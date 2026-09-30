import 'server-only';
import { leggi, modifica, segreto } from './archivio';
import type { Archivio, Iscrizione } from './tipi';
import type { Sessione } from '../sessione';
import { leggiTokenQr, verificaTokenQr } from '../qr-token';
import { decidiIngresso, trovaVoce, type DatiCassa, type EsitoPorta, type OpzioniIngresso, type VocePorta } from '../porta-logica';
import { randomUUID } from 'node:crypto';
import { creaCodice, creaTokenQr } from '../qr-token';
import { etaSufficiente, giaIscritto } from '../regole';
import { eventoPassato } from '../regole';

// Porta: staff e admin. Lo staff vede le iscrizioni ma dei PR solo il nome della lista
// (equivalente di porta_elenco() nello schema Supabase).

function soloStaff(s: Sessione) {
  if (s.utente.ruolo !== 'staff' && s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

function voce(d: Readonly<Archivio>, i: Iscrizione): VocePorta {
  const pr = i.prId ? d.pr.find((p) => p.id === i.prId) : null;
  return {
    id: i.id, token: i.tokenQr, codice: i.codice, nome: i.nome, cognome: i.cognome, dataNascita: i.dataNascita,
    stato: i.stato, importo: i.importo, oraCheckIn: i.oraCheckIn, porta: i.porta, lista: i.origine === 'cassa' ? 'Cassa' : pr?.nomeDisplay ?? 'Maremma Musica', canale: i.canale ?? 'diretto', origine: i.origine ?? 'lista',
  };
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
    }));
}

export async function elencoPorta(s: Sessione, eventoId: string): Promise<VocePorta[]> {
  soloStaff(s);
  const d = await leggi();
  return d.iscrizioni.filter((i) => i.eventoId === eventoId).map((i) => voce(d, i));
}

export async function checkIn(s: Sessione, eventoId: string, chiave: string, o: OpzioniIngresso): Promise<EsitoPorta> {
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
    const voci = elenco.map((i) => voce(d, i));
    const v = trovaVoce(voci, chiave);
    if (!v) return { esito: 'non_valido', motivo: 'Non è in lista per questa serata' } satisfies EsitoPorta;
    const { esito, aggiornata } = decidiIngresso(v, { ...o, ora });
    if (aggiornata) {
      const i = elenco.find((x) => x.id === v.id)!;
      if (esito.esito === 'entrato' && esito.incassato > 0) {
        i.metodoPagamento = o.metodo; i.pagatoAt = ora;
      }
      i.stato = 'entrato'; i.oraCheckIn = ora; i.porta = o.porta;
    }
    return esito;
  });
}

/**
 * Ingresso in cassa: la persona paga alla porta senza essere in lista. Si registra con nome, cognome
 * e data di nascita (età minima e doppioni), niente email e niente QR: entra subito.
 * `rif` è l'id creato dal telefono: se la sincronizzazione si ripete non si crea un doppione.
 */
export async function registraCassa(s: Sessione, eventoId: string, rif: string, dati: DatiCassa, o: Omit<OpzioniIngresso, 'incassa'>): Promise<EsitoPorta> {
  soloStaff(s);
  const chiave = await segreto();
  const ora = new Date(Math.min(new Date(o.ora).getTime() || Date.now(), Date.now())).toISOString();
  return modifica((d): EsitoPorta => {
    const gia = d.iscrizioni.find((i) => i.rifCassa === rif && i.eventoId === eventoId);
    if (gia) return { esito: 'entrato', voce: voce(d, gia), incassato: gia.importo, ora: gia.oraCheckIn ?? ora, primaPagato: false };
    const evento = d.eventi.find((e) => e.id === eventoId);
    if (!evento) return { esito: 'non_valido', motivo: 'Serata non trovata' };
    const nome = dati.nome.trim().slice(0, 80);
    const cognome = dati.cognome.trim().slice(0, 80);
    if (!nome || !cognome || !/^\d{4}-\d{2}-\d{2}$/.test(dati.dataNascita)) return { esito: 'non_valido', motivo: 'Dati incompleti' };
    if (!etaSufficiente(dati.dataNascita, evento)) return { esito: 'non_valido', motivo: `Serata ${evento.etaMinima}+: non può entrare` };
    const doppio = giaIscritto(d.iscrizioni, eventoId, cognome, dati.dataNascita);
    if (doppio) return { esito: doppio.stato === 'entrato' ? 'gia_entrato' : 'non_valido', ...(doppio.stato === 'entrato' ? { voce: voce(d, doppio) } : { motivo: 'È già in lista: aprilo da "Cerca per nome"' }) } as EsitoPorta;
    const importo = Math.max(0, Math.round((Number(dati.importo) || 0) * 100) / 100);
    const id = randomUUID();
    const i = {
      id, eventoId, lottoId: null, prId: null, nome, cognome, dataNascita: dati.dataNascita, email: '',
      tokenQr: creaTokenQr(chiave, id, eventoId), codice: creaCodice(chiave, id), // interni: nessun QR viene mostrato
      stato: 'entrato' as const, metodoPagamento: importo > 0 ? o.metodo : null, importo,
      pagatoAt: importo > 0 ? ora : null, oraCheckIn: ora, porta: o.porta,
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
    const ingressi = d.iscrizioni.filter((i) => i.eventoId === eventoId && i.porta === nome && i.stato === 'entrato').length;
    const p = d.porte.find((x) => x.nome === nome && x.eventoId === eventoId);
    const ultimoSync = new Date().toISOString();
    if (p) Object.assign(p, { ultimoSync, ingressi });
    else d.porte.push({ nome, eventoId, ultimoSync, ingressi });
  });
}
