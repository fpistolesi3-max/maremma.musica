// Logica della porta condivisa da server e telefono dello staff (che la usa anche senza campo).
import type { MetodoPagamento, StatoIscrizione } from './dati/tipi';

export interface VocePorta {
  id: string;
  token: string;
  codice: string;
  nome: string;
  cognome: string;
  dataNascita: string;
  stato: StatoIscrizione;
  importo: number;
  oraCheckIn: string | null;
  porta: string | null;
  lista: string;
  canale: string;             // da dove si è iscritto (instagram, diretto…): utile quando non c'è un PR
  origine: 'lista' | 'cassa' | 'tavolo'; // cassa = registrato alla porta, senza QR
  /**
   * Solo per i tavoli: un QR per tutto il gruppo. Ogni passaggio fa entrare una persona finché ci sono posti;
   * `pagato` falso = prenotazione ancora in attesa del pagamento anticipato (non si entra).
   */
  tavolo?: { nome: string; persone: number; entrati: number; pagato: boolean };
}

/** Persone che una voce porta dentro: una, oppure tutto il gruppo del tavolo. La prevendita non pagata non conta. */
export function personeVoce(v: VocePorta) {
  if (v.stato === 'annullato' || v.stato === 'rimborsato' || v.stato === 'in_attesa' || v.stato === 'scaduta') return 0;
  return v.tavolo ? v.tavolo.persone : 1;
}

export function entratiVoce(v: VocePorta) {
  return v.tavolo ? v.tavolo.entrati : v.stato === 'entrato' ? 1 : 0;
}

/** Dati di chi entra pagando in cassa, senza lista e senza QR. */
export interface DatiCassa { nome: string; cognome: string; dataNascita: string; importo: number }

export type EsitoPorta =
  | { esito: 'entrato'; voce: VocePorta; incassato: number; ora: string; primaPagato: boolean }
  | { esito: 'non_pagato'; voce: VocePorta }    // prevendita chiesta ma non (ancora) pagata online: non entra
  | { esito: 'gia_entrato'; voce: VocePorta }
  | { esito: 'annullato'; voce: VocePorta }
  | { esito: 'non_valido'; motivo: string };

/** `metodo`: contanti o POS, solo per l'ingresso in cassa. Chi è in lista ha già pagato online: alla porta non si incassa. */
export interface OpzioniIngresso {
  metodo: MetodoPagamento;
  porta: string;
  ora: string;
}

/**
 * Decide l'esito e, se la persona entra, restituisce la voce aggiornata. Entra chi ha la prevendita pagata (o gratis);
 * chi l'ha chiesta senza pagare no: può pagarla dal telefono e riprovare, o passare dalla cassa se c'è.
 * Idempotente: il secondo passaggio dà sempre "già entrato" con l'orario del primo.
 * Fa eccezione il QR di un tavolo, che vale per più persone: ogni passaggio ne fa entrare una, fino al completo.
 */
export function decidiIngresso(voce: VocePorta, o: OpzioniIngresso): { esito: EsitoPorta; aggiornata: VocePorta | null } {
  if (voce.stato === 'annullato' || voce.stato === 'rimborsato') return { esito: { esito: 'annullato', voce }, aggiornata: null };
  if (voce.tavolo) {
    const t = voce.tavolo;
    if (!t.pagato) return { esito: { esito: 'non_valido', motivo: 'Tavolo non ancora pagato' }, aggiornata: null };
    if (t.entrati >= t.persone) return { esito: { esito: 'gia_entrato', voce }, aggiornata: null };
    const entrati = t.entrati + 1;
    const aggiornata: VocePorta = { ...voce, tavolo: { ...t, entrati }, stato: entrati >= t.persone ? 'entrato' : 'pagato', oraCheckIn: o.ora, porta: o.porta };
    return { esito: { esito: 'entrato', voce: aggiornata, incassato: 0, ora: o.ora, primaPagato: true }, aggiornata };
  }
  if (voce.stato === 'entrato') return { esito: { esito: 'gia_entrato', voce }, aggiornata: null };
  if (voce.stato === 'scaduta') return { esito: { esito: 'non_valido', motivo: 'Prevendita mai pagata' }, aggiornata: null };
  if (voce.stato === 'in_attesa') return { esito: { esito: 'non_pagato', voce }, aggiornata: null };
  const aggiornata: VocePorta = { ...voce, stato: 'entrato', oraCheckIn: o.ora, porta: o.porta };
  return { esito: { esito: 'entrato', voce: aggiornata, incassato: 0, ora: o.ora, primaPagato: voce.stato === 'pagato' }, aggiornata };
}

export function normalizzaChiave(s: string) {
  return s.trim();
}

/** Trova la voce per token del QR, codice a 8 caratteri (con o senza trattino) o id. */
export function trovaVoce(elenco: VocePorta[], chiave: string): VocePorta | undefined {
  const k = chiave.trim();
  if (!k) return undefined;
  if (k.startsWith('MM1.')) return elenco.find((v) => v.token === k);
  const cod = k.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return elenco.find((v) => v.codice === cod || v.id === k);
}

export function cercaPerNome(elenco: VocePorta[], q: string): VocePorta[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const parole = norm(q).split(/\s+/).filter(Boolean);
  if (!parole.length) return [];
  // Anche per data di nascita: "14.05" o "2001"
  return elenco
    .filter((v) => {
      const testo = norm(`${v.nome} ${v.cognome} ${v.dataNascita.split('-').reverse().join('.')}`);
      return parole.every((p) => testo.includes(p));
    })
    .sort((a, b) => a.cognome.localeCompare(b.cognome) || a.nome.localeCompare(b.nome))
    .slice(0, 30);
}
