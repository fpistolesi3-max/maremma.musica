// Logica della porta condivisa da server e telefono dello staff (che la usa anche senza campo).
import type { RifiutoIngresso, StatoIscrizione } from './dati/tipi';

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
  categoria?: string | null;  // categoria della prevendita (es. Donne): lo staff la controlla a vista
  rifiuto?: RifiutoIngresso | null; // "Non rientra" già dato dallo staff (si può comunque far entrare)
  canale: string;             // da dove si è iscritto (instagram, diretto…): utile quando non c'è un PR
  origine: 'lista' | 'cassa' | 'tavolo'; // cassa = solo storico: registrato alla porta quando la cassa esisteva, senza QR
  /**
   * Solo per i tavoli: un QR per tutto il gruppo. Ogni passaggio fa entrare una persona finché ci sono posti;
   * `pagato` falso = prenotazione ancora in attesa del pagamento anticipato (non si entra).
   */
  tavolo?: { nome: string; persone: number; entrati: number; pagato: boolean };
}

/** Va controllata alla porta: una categoria vera (es. Donne). Nessuna categoria, o "Standard", entra con la sola scansione. */
export const categoriaDaControllare = (v: Pick<VocePorta, 'categoria'>) => Boolean(v.categoria && v.categoria.trim().toLowerCase() !== 'standard');

/** Persone che una voce porta dentro: una, oppure tutto il gruppo del tavolo. La prevendita non pagata non conta. */
export function personeVoce(v: VocePorta) {
  if (v.stato === 'annullato' || v.stato === 'rimborsato' || v.stato === 'in_attesa' || v.stato === 'scaduta') return 0;
  return v.tavolo ? v.tavolo.persone : 1;
}

export function entratiVoce(v: VocePorta) {
  return v.tavolo ? v.tavolo.entrati : v.stato === 'entrato' ? 1 : 0;
}

/**
 * Dopo l'orario limite la prevendita non vale più per entrare. `limite` assente = nessun limite (i tavoli non ne hanno).
 * Il confronto è in istanti, non in ore di calendario: vale a cavallo della mezzanotte e del cambio d'ora.
 */
export const oltreLimite = (limite: string | null | undefined, ora: string) => Boolean(limite) && Date.parse(ora) >= Date.parse(limite as string);

/**
 * Quante persone sono dentro e quante ne restano. `entrati`: prevendite entrate + persone entrate con i QR dei tavoli (ogni passaggio
 * una persona; comprese le voci storiche della cassa, che sono gente dentro). `attesi`: prevendite pagate non ancora entrate (dopo il
 * limite non contano più) + posti dei tavoli pagati non ancora usati. `liberi` = capienza − entrati (mai sotto zero), solo se la
 * capienza c'è. Gli ingressi pagati alla porta fuori dal sito non si possono contare.
 */
export function conteggioPorta(elenco: VocePorta[], o: { capienza?: number | null; limite?: string | null; ora: string }) {
  const dopoLimite = oltreLimite(o.limite, o.ora);
  let entrati = 0;
  let attesi = 0;
  for (const v of elenco) {
    entrati += entratiVoce(v);
    if (v.tavolo) {
      if (v.tavolo.pagato) attesi += Math.max(0, personeVoce(v) - v.tavolo.entrati);
    } else if (!dopoLimite && (v.stato === 'pagato' || v.stato === 'in_lista')) attesi += 1;
  }
  const liberi = o.capienza != null && o.capienza > 0 ? Math.max(0, o.capienza - entrati) : null;
  return { entrati, attesi, liberi, dopoLimite };
}

/** Serata di un biglietto che non è quella aperta sul telefono. */
export interface SerataBiglietto { id: string; nome: string; data: string }

export type EsitoPorta =
  | { esito: 'entrato'; voce: VocePorta; incassato: number; ora: string; primaPagato: boolean }
  | { esito: 'non_pagato'; voce: VocePorta }    // prevendita non completata (in_attesa): non ha un QR e non vale per entrare
  | { esito: 'oltre_orario'; voce: VocePorta; limite: string } // prevendita valida ma oltre l'orario limite: non entra
  | { esito: 'altra_serata'; serata: SerataBiglietto; chiave: string } // QR valido ma di un'altra serata: solo sul telefono, non lo manda il server
  | { esito: 'da_confermare'; voce: VocePorta }  // prevendita con categoria: entra solo dopo "Fai entrare" dello staff
  | { esito: 'rifiutato'; voce: VocePorta }       // lo staff ha toccato "Non rientra": niente ingresso, rifiuto salvato
  | { esito: 'gia_entrato'; voce: VocePorta }
  | { esito: 'annullato'; voce: VocePorta }
  | { esito: 'non_valido'; motivo: string };

/** Chi è in lista ha già pagato online: alla porta il sito non incassa. */
export interface OpzioniIngresso {
  porta: string;
  ora: string;
  /** Lo staff ha toccato "Fai entrare" dopo aver controllato la categoria (o il documento). */
  confermato?: boolean;
  /** Serata senza telefono: ogni ingresso passa dal controllo del documento, anche senza categoria. */
  documento?: boolean;
  /** Orario limite della prevendita della serata (ISO): dopo, un QR di prevendita non entra. I tavoli non ne hanno. */
  limite?: string | null;
}

/**
 * Decide l'esito e, se la persona entra, restituisce la voce aggiornata. Entra chi ha la prevendita pagata (o gratis);
 * chi non l'ha completata (in_attesa) non ha una prevendita: può pagarla dal telefono e riprovare. Dopo l'orario limite non entra
 * più nessuna prevendita (pagata o no): resta il tavolo, che non ha limite.
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
  if (voce.stato === 'scaduta') return { esito: { esito: 'non_valido', motivo: 'Prevendita non completata: non vale per entrare' }, aggiornata: null };
  if (oltreLimite(o.limite, o.ora)) return { esito: { esito: 'oltre_orario', voce, limite: o.limite as string }, aggiornata: null };
  if (voce.stato === 'in_attesa') return { esito: { esito: 'non_pagato', voce }, aggiornata: null };
  if ((categoriaDaControllare(voce) || o.documento) && !o.confermato) return { esito: { esito: 'da_confermare', voce }, aggiornata: null };
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
