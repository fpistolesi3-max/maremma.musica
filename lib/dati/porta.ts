import 'server-only';
import { leggi, modifica, segreto } from './archivio';
import type { Archivio, Iscrizione, PrenotazioneTavolo } from './tipi';
import type { Sessione } from '../sessione';
import { leggiTokenQr, verificaTokenQr } from '../qr-token';
import { decidiIngresso, trovaVoce, type EsitoPorta, type OpzioniIngresso, type SerataBiglietto, type VocePorta } from '../porta-logica';
import { randomUUID } from 'node:crypto';
import { eventoPassato, iscrizioneScaduta, limiteIngresso, prenotazioneAttiva, prenotazioneScaduta } from '../regole';

// Porta: staff e admin. Lo staff vede le iscrizioni ma dei PR solo il nome della lista
// (equivalente di porta_elenco() nello schema Supabase).

function soloStaff(s: Sessione) {
  if (s.utente.ruolo !== 'staff' && s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

function voce(d: Readonly<Archivio>, i: Iscrizione): VocePorta {
  const pr = i.prId ? d.pr.find((p) => p.id === i.prId) : null;
  return {
    id: i.id, token: i.tokenQr, codice: i.codice, nome: i.nome, cognome: i.cognome, dataNascita: i.dataNascita,
    stato: i.stato, importo: i.importo, oraCheckIn: i.oraCheckIn, porta: i.porta, lista: i.origine === 'cassa' ? 'Ingresso alla porta (storico)' : pr?.nomeDisplay ?? 'Maremma Musica', categoria: i.categoria ?? null, rifiuto: i.rifiutoIngresso ?? null, canale: i.canale ?? 'diretto', origine: i.origine ?? 'lista',
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
    .filter((e) => e.pubblicato && !eventoPassato(e, ieri))
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((e) => ({
      id: e.id, nome: e.nome, data: e.data, numero: e.numero, etaMinima: e.etaMinima,
      limite: limiteIngresso(e), senzaTelefono: e.senzaTelefono,
    }));
}

export async function elencoPorta(s: Sessione, eventoId: string): Promise<VocePorta[]> {
  soloStaff(s);
  const d = await leggi();
  return vociEvento(d, eventoId);
}

/**
 * Un QR firmato che non è di questa serata: di quale serata è? Serve a dire "Biglietto di … Cambia serata" invece di "Codice non trovato".
 * Il token porta solo l'id: la serata si ricava dall'iscrizione (o dal tavolo) e la firma si verifica con quella serata, quindi un QR
 * falso o modificato non dice niente. Solo serate che la porta può aprire (non in bozza, non passate).
 */
export async function serataDelBiglietto(s: Sessione, chiave: string): Promise<SerataBiglietto | null> {
  soloStaff(s);
  const letto = chiave.startsWith('MM1.') ? leggiTokenQr(chiave) : null;
  if (!letto) return null;
  const d = await leggi();
  const eventoId = d.iscrizioni.find((i) => i.id === letto.id)?.eventoId ?? d.prenotazioni.find((p) => p.id === letto.id)?.eventoId;
  if (!eventoId || !verificaTokenQr(await segreto(), chiave, eventoId)) return null;
  const e = (await eventiPorta(s)).find((x) => x.id === eventoId);
  return e ? { id: e.id, nome: e.nome, data: e.data } : null;
}

/** Lista di riserva per le serate senza telefono, in ordine alfabetico: chi ha una prevendita valida, con nome e data di nascita da confrontare col documento. */
export async function listaStampabile(s: Sessione, eventoId: string) {
  soloStaff(s);
  const d = await leggi();
  const evento = d.eventi.find((e) => e.id === eventoId);
  if (!evento) return null;
  const righe = d.iscrizioni
    .filter((i) => i.eventoId === eventoId && (i.stato === 'pagato' || i.stato === 'in_lista' || i.stato === 'entrato'))
    .map((i) => ({ id: i.id, nome: i.nome, cognome: i.cognome, dataNascita: i.dataNascita, categoria: i.categoria, entrato: i.stato === 'entrato', oraCheckIn: i.oraCheckIn }))
    .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
  return { evento, righe };
}

/** Fino a quando la prevendita vale per entrare. Arriva al telefono a ogni sincronizzazione: l'admin lo può cambiare durante la serata. */
export async function limitePorta(s: Sessione, eventoId: string): Promise<string | null> {
  soloStaff(s);
  const e = (await leggi()).eventi.find((x) => x.id === eventoId);
  return e ? limiteIngresso(e) : null;
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
    // Serata senza telefono e orario limite: li decide il server, il telefono non può saltare il controllo del documento né il limite.
    // Vale l'orario in cui l'ingresso è stato fatto (mai nel futuro): chi è entrato offline prima del limite e sincronizza dopo, è valido.
    const evento = d.eventi.find((e) => e.id === eventoId);
    const documento = evento?.senzaTelefono === true;
    const limite = evento ? limiteIngresso(evento) : null;
    const { esito, aggiornata } = decidiIngresso(v, { ...o, ora, documento, limite });
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
