// Logica della porta condivisa da server e telefono dello staff (che la usa anche senza campo).
import type { MetodoPagamento, RifiutoIngresso, StatoIscrizione } from './dati/tipi';
import { chiaveCognome } from './regole';

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
  origine: 'lista' | 'cassa' | 'tavolo'; // cassa = registrato alla porta, senza QR
  metodo?: MetodoPagamento | null; // solo per la cassa: contanti o POS
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

/** Dati di chi entra pagando in cassa, senza lista e senza QR. */
export interface DatiCassa { nome: string; cognome: string; dataNascita: string; importo: number }

/** Stessa persona per cognome (senza accenti e apostrofi) e data di nascita: serve ai doppioni tra lista e cassa. */
export const stessaPersona = (a: Pick<VocePorta, 'cognome' | 'dataNascita'>, b: Pick<VocePorta, 'cognome' | 'dataNascita'>) =>
  a.dataNascita === b.dataNascita && chiaveCognome(a.cognome) === chiaveCognome(b.cognome);

/** Le due postazioni della porta: lo scanner (chi ha la prevendita) e la cassa (chi arriva senza e paga lì). L'ultima usata si salva sul telefono. */
export type Scheda = 'scanner' | 'cassa';

/** Scheda che vale davvero: senza cassa stasera (o valore sconosciuto) si resta sullo scanner. */
export const schedaEffettiva = (scheda: unknown, cassaAttiva: boolean): Scheda => (scheda === 'cassa' && cassaAttiva ? 'cassa' : 'scanner');

/** Testo sotto un ingresso negato dallo scanner: chi non ha una prevendita valida non passa di qui, va alla cassa (se c'è). */
export const rimandoCassa = (cassaAttiva: boolean) =>
  cassaAttiva ? 'Non ha una prevendita valida: va alla cassa.' : 'Stasera niente cassa: senza prevendita non entra.';

/**
 * Prevendite non completate (in_attesa) il cui cognome inizia con quello che si sta scrivendo in cassa: la cassa le propone
 * per riusare i dati (alla registrazione quella richiesta si chiude). Servono almeno 2 lettere; al massimo 3 proposte.
 */
export function proposteRiuso(elenco: VocePorta[], cognome: string): VocePorta[] {
  const k = chiaveCognome(cognome);
  if (k.length < 2) return [];
  return elenco.filter((v) => v.stato === 'in_attesa' && v.origine !== 'cassa' && chiaveCognome(v.cognome).startsWith(k)).slice(0, 3);
}

/** Ultimi ingressi in cassa della serata (tutte le porte), dal più recente, con il totale incassato in contanti e con POS. */
export function riepilogoCassa(elenco: VocePorta[], quanti = 8) {
  const dentro = elenco.filter((v) => v.origine === 'cassa' && v.stato === 'entrato')
    .sort((a, b) => (b.oraCheckIn ?? '').localeCompare(a.oraCheckIn ?? ''));
  const somma = (m: MetodoPagamento) => dentro.filter((v) => v.metodo === m).reduce((t, v) => t + v.importo, 0);
  return { ultimi: dentro.slice(0, quanti), ingressi: dentro.length, contanti: somma('porta_contanti'), pos: somma('porta_pos') };
}

/** Serata di un biglietto che non è quella aperta sul telefono. */
export interface SerataBiglietto { id: string; nome: string; data: string }

export type EsitoPorta =
  | { esito: 'entrato'; voce: VocePorta; incassato: number; ora: string; primaPagato: boolean }
  | { esito: 'non_pagato'; voce: VocePorta }    // prevendita non completata (in_attesa): non ha un QR e non vale per entrare
  | { esito: 'altra_serata'; serata: SerataBiglietto; chiave: string } // QR valido ma di un'altra serata: solo sul telefono, non lo manda il server
  | { esito: 'da_confermare'; voce: VocePorta }  // prevendita con categoria: entra solo dopo "Fai entrare" dello staff
  | { esito: 'rifiutato'; voce: VocePorta }       // lo staff ha toccato "Non rientra": niente ingresso, rifiuto salvato
  | { esito: 'gia_entrato'; voce: VocePorta }
  | { esito: 'annullato'; voce: VocePorta }
  | { esito: 'non_valido'; motivo: string };

/** `metodo`: contanti o POS, solo per l'ingresso in cassa. Chi è in lista ha già pagato online: alla porta non si incassa. */
export interface OpzioniIngresso {
  metodo: MetodoPagamento;
  porta: string;
  ora: string;
  /** Lo staff ha toccato "Fai entrare" dopo aver controllato la categoria (o il documento). */
  confermato?: boolean;
  /** Serata senza telefono: ogni ingresso passa dal controllo del documento, anche senza categoria. */
  documento?: boolean;
}

/**
 * Decide l'esito e, se la persona entra, restituisce la voce aggiornata. Entra chi ha la prevendita pagata (o gratis);
 * chi non l'ha completata (in_attesa) non ha una prevendita: può pagarla dal telefono e riprovare, o passare dalla cassa se c'è.
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
