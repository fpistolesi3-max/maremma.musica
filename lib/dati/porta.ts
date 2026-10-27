import 'server-only';
import { leggi, modifica, segreto } from './archivio';
import type { Archivio, Iscrizione, PrenotazioneTavolo } from './tipi';
import type { Sessione } from '../sessione';
import { leggiTokenQr, verificaTokenQr } from '../qr-token';
import { decidiIngresso, trovaVoce, type DatiCassa, type EsitoPorta, type OpzioniIngresso, type VocePorta } from '../porta-logica';
import { randomUUID } from 'node:crypto';
import { creaCodice, creaTokenQr } from '../qr-token';
import { etaSufficiente, giaIscritto, iscrizioneScaduta } from '../regole';
import { eventoPassato, prenotazioneAttiva, prenotazioneScaduta } from '../regole';

// Porta: staff e admin. Lo staff vede le iscrizioni ma dei PR solo il nome della lista
// (equivalente di porta_elenco() nello schema Supabase).

function soloStaff(s: Sessione) {
  if (s.utente.ruolo !== 'staff' && s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

function voce(d: Readonly<Archivio>, i: Iscrizione): VocePorta {
  const pr = i.prId ? d.pr.find((p) => p.id === i.prId) : null;
  return {
    id: i.id, token: i.tokenQr, codice: i.codice, nome: i.nome, cognome: i.cognome, dataNascita: i.dataNascita,
    stato: i.stato, importo: i.importo, oraCheckIn: i.oraCheckIn, porta: i.porta, lista: i.origine === 'cassa' ? 'Cassa' : pr?.nomeDisplay ?? 'Maremma Musica', categoria: i.categoria ?? null, rifiuto: i.rifiutoIngresso ?? null, canale: i.canale ?? 'diretto', origine: i.origine ?? 'lista',
  };
}

/** Il tavolo alla porta: una voce sola per tutto il gruppo, con quanti sono già entrati. */
function voceTavolo(d: Readonly<Archivio>, p: PrenotazioneTavolo): VocePorta {
  const pr = p.prId ? d.pr.find((x) => x.id === p.prId) : null;
  const t = d.tavoli.find((x) => x.id === p.tavoloId);
  const chiusa = !prenotazioneAttiva(p) || prenotazioneScaduta(p);
  const ultimo = p.ingressi[p.ingressi.length - 1];
  return {
    id: p.id, token: p.tokenQr, codice: p.codice, nome: p.nome, cognome: p.cognome, dataNascita: '',
    stato: p.stato === 'rimborsata' ? 'rimborsato' : chiusa ? 'annullato' : p.ingressi.length >= p.persone ? 'entrato' : p.stato === 'confermata' ? 'pagato' : 'in_lista',
    importo: p.spesaMinima, oraCheckIn: ultimo?.ora ?? null, porta: ultimo?.porta ?? null,
    lista: pr?.nomeDisplay ?? 'Maremma Musica', canale: 'diretto', origine: 'tavolo',
    tavolo: { nome: t?.nome ?? 'Tavolo', persone: p.persone, entrati: p.ingressi.length, pagato: p.stato === 'confermata' },
  };
}

function vociEvento(d: Readonly<Archivio>, eventoId: string): VocePorta[] {
  // Le prevendite scadute senza pagare non sono mai state in lista: alla porta non servono.
  return [
    ...d.iscrizioni.filter((i) => i.eventoId === eventoId && i.stato !== 'scaduta' && !iscrizioneScaduta(i)).map((i) => voce(d, i)),
    ...d.prenotazioni.filter((p) => p.eventoId === eventoId).map((p) => voceTavolo(d, p)),
  ];
}

export async function eventiPorta(s: Sessione) {
  soloStaff(s);
  const d = await leggi();
  const ieri = new Date(Date.now() - 12 * 3_600_000);
  return d.eventi
    .filter((e) => !eventoPassato(e, ieri))
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((e) => ({
      id: e.id, nome: e.nome, data: e.data, numero: e.numero, etaMinima: e.etaMinima,
      prezzoCassa: e.tipoIngresso === 'libero' ? 0 : e.prezzoCassa ?? e.prezzoLista,
      cassa: e.cassaAttiva,
    }));
}

export async function elencoPorta(s: Sessione, eventoId: string): Promise<VocePorta[]> {
  soloStaff(s);
  const d = await leggi();
  return vociEvento(d, eventoId);
}

/** La serata ha la cassa alla porta? Arriva al telefono a ogni sincronizzazione: l'admin la può cambiare durante la serata. */
export async function cassaAttivaPorta(s: Sessione, eventoId: string): Promise<boolean> {
  soloStaff(s);
  return (await leggi()).eventi.find((e) => e.id === eventoId)?.cassaAttiva ?? false;
}

/** `rif`: id del movimento creato dal telefono. Serve ai tavoli, dove lo stesso QR passa più volte. */
export async function checkIn(s: Sessione, eventoId: string, chiave: string, o: OpzioniIngresso, rif?: string): Promise<EsitoPorta> {
  soloStaff(s);
  const chiaveSegreta = await segreto();
  if (chiave.startsWith('MM1.')) {
    const letto = leggiTokenQr(chiave);
    if (!letto || !verificaTokenQr(chiaveSegreta, chiave, eventoId)) {
      // Firma sbagliata: QR falso, modificato o di un'altra serata.
      return { esito: 'non_valido', motivo: 'QR non valido per questa serata' };
    }
  }
  // L'orario di un ingresso registrato offline resta quello vero, ma mai nel futuro.
  const ora = new Date(Math.min(new Date(o.ora).getTime() || Date.now(), Date.now())).toISOString();
  return modifica((d) => {
    const elenco = d.iscrizioni.filter((i) => i.eventoId === eventoId);
    const v = trovaVoce(vociEvento(d, eventoId), chiave);
    if (!v) return { esito: 'non_valido', motivo: 'Non è in lista per questa serata' } satisfies EsitoPorta;
    if (v.tavolo) {
      const p = d.prenotazioni.find((x) => x.id === v.id)!;
      // Sincronizzazione ripetuta dello stesso passaggio: è già contato, non entra un'altra persona.
      const gia = rif ? p.ingressi.find((x) => x.rif === rif) : undefined;
      if (gia) return { esito: 'entrato', voce: v, incassato: 0, ora: gia.ora, primaPagato: true } satisfies EsitoPorta;
      const r = decidiIngresso(v, { ...o, ora });
      if (r.aggiornata) p.ingressi.push({ rif: rif ?? randomUUID(), ora, porta: o.porta });
      return r.esito;
    }
    const { esito, aggiornata } = decidiIngresso(v, { ...o, ora });
    if (aggiornata) {
      const i = elenco.find((x) => x.id === v.id)!;
      i.stato = 'entrato'; i.oraCheckIn = ora; i.porta = o.porta;
    }
    return esito;
  });
}

/**
 * "Non rientra": lo staff ha controllato la categoria e la persona non entra. Non registra l'ingresso; salva chi, quando e da
 * quale porta (l'admin lo vede e decide se rimborsare). L'iscrizione resta valida. Ripetibile: la sincronizzazione può arrivare due volte.
 */
export async function rifiutaIngresso(s: Sessione, eventoId: string, chiave: string, o: { porta: string; ora: string }): Promise<EsitoPorta> {
  soloStaff(s);
  const ora = new Date(Math.min(new Date(o.ora).getTime() || Date.now(), Date.now())).toISOString();
  return modifica((d): EsitoPorta => {
    const v = trovaVoce(vociEvento(d, eventoId), chiave);
    const i = v && !v.tavolo ? d.iscrizioni.find((x) => x.id === v.id && x.eventoId === eventoId) : undefined;
    if (!v || !i) return { esito: 'non_valido', motivo: 'Non è in lista per questa serata' };
    if (i.stato === 'entrato') return { esito: 'gia_entrato', voce: voce(d, i) };
    i.rifiutoIngresso = { ora, porta: o.porta, da: s.utente.email };
    return { esito: 'rifiutato', voce: voce(d, i) };
  });
}

/**
 * Ingresso in cassa: la persona paga alla porta senza essere in lista. Si registra con nome, cognome
 * e data di nascita (età minima e doppioni), niente email e niente QR: entra subito.
 * `rif` è l'id creato dal telefono: se la sincronizzazione si ripete non si crea un doppione.
 */
export async function registraCassa(s: Sessione, eventoId: string, rif: string, dati: DatiCassa, o: OpzioniIngresso): Promise<EsitoPorta> {
  soloStaff(s);
  const chiave = await segreto();
  const ora = new Date(Math.min(new Date(o.ora).getTime() || Date.now(), Date.now())).toISOString();
  return modifica((d): EsitoPorta => {
    const gia = d.iscrizioni.find((i) => i.rifCassa === rif && i.eventoId === eventoId);
    if (gia) return { esito: 'entrato', voce: voce(d, gia), incassato: gia.importo, ora: gia.oraCheckIn ?? ora, primaPagato: false };
    const evento = d.eventi.find((e) => e.id === eventoId);
    if (!evento) return { esito: 'non_valido', motivo: 'Serata non trovata' };
    // Con la cassa spenta il telefono non mostra il pulsante; un ingresso arrivato lo stesso (fatto offline, prima che il
    // telefono sapesse dello spegnimento) si registra comunque: la persona ha pagato ed è dentro.
    const nome = dati.nome.trim().slice(0, 80);
    const cognome = dati.cognome.trim().slice(0, 80);
    if (!nome || !cognome || !/^\d{4}-\d{2}-\d{2}$/.test(dati.dataNascita)) return { esito: 'non_valido', motivo: 'Dati incompleti' };
    if (!etaSufficiente(dati.dataNascita, evento)) return { esito: 'non_valido', motivo: `Serata ${evento.etaMinima}+: non può entrare` };
    const doppio = giaIscritto(d.iscrizioni, eventoId, cognome, dati.dataNascita);
    if (doppio) return { esito: doppio.stato === 'entrato' ? 'gia_entrato' : 'non_valido', ...(doppio.stato === 'entrato' ? { voce: voce(d, doppio) } : { motivo: 'È già in lista: aprilo da "Cerca per nome"' }) } as EsitoPorta;
    const importo = Math.max(0, Math.round((Number(dati.importo) || 0) * 100) / 100);
    const id = randomUUID();
    const i = {
      id, eventoId, lottoId: null, categoria: null, prId: null, nome, cognome, dataNascita: dati.dataNascita, email: '',
      tokenQr: creaTokenQr(chiave, id, eventoId), codice: creaCodice(chiave, id), // interni: nessun QR viene mostrato
      stato: 'entrato' as const, metodoPagamento: importo > 0 ? o.metodo : null, importo,
      pagatoAt: importo > 0 ? ora : null, scade: null, pagamentoOnline: null, oraCheckIn: ora, porta: o.porta,
      consensoPrivacyAt: ora, consensoMarketing: false, annullatoAt: null, createdAt: ora,
      canale: 'cassa', consegnaId: null, origine: 'cassa' as const, rifCassa: rif,
    };
    d.iscrizioni.push(i);
    return { esito: 'entrato', voce: voce(d, i), incassato: importo, ora, primaPagato: false };
  });
}

/** Ogni sincronizzazione aggiorna lo stato della porta, visibile all'admin. */
export async function segnaPorta(nome: string, eventoId: string) {
  await modifica((d) => {
    const ingressi = d.iscrizioni.filter((i) => i.eventoId === eventoId && i.porta === nome && i.stato === 'entrato').length
      + d.prenotazioni.filter((p) => p.eventoId === eventoId).reduce((n, p) => n + p.ingressi.filter((x) => x.porta === nome).length, 0);
    const p = d.porte.find((x) => x.nome === nome && x.eventoId === eventoId);
    const ultimoSync = new Date().toISOString();
    if (p) Object.assign(p, { ultimoSync, ingressi });
    else d.porte.push({ nome, eventoId, ultimoSync, ingressi });
  });
}
