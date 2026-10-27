import type { Evento, Iscrizione, Lotto, PrenotazioneTavolo } from './dati/tipi';
import { anniCompiuti, dataIso, dataPunti, euro } from './formato';

// Regole di business pure (senza archivio): testate in lib/regole.test.ts.

export type StatoLista =
  | { tipo: 'aperta'; lotto: Lotto | null; prezzo: number }
  | { tipo: 'libero'; lotto: Lotto | null; prezzo: 0 }
  | { tipo: 'dal'; dal: string }            // apre più avanti
  | { tipo: 'piena' }
  | { tipo: 'chiusa' }
  | { tipo: 'passata' };

/** Iscrizioni con un QR valido: pagate online, gratis o già entrate. Quelle in attesa di pagamento non valgono ancora. */
export const ATTIVE: Iscrizione['stato'][] = ['in_lista', 'pagato', 'entrato'];
export const isAttiva = (i: Pick<Iscrizione, 'stato'>) => ATTIVE.includes(i.stato);

/** In attesa di pagamento col termine passato: il posto è tornato libero (anche se nessuno l'ha ancora segnata "scaduta"). */
export function iscrizioneScaduta(i: Pick<Iscrizione, 'stato' | 'scade'>, adesso = new Date()) {
  return i.stato === 'in_attesa' && (!i.scade || new Date(i.scade).getTime() <= adesso.getTime());
}

/** Occupa un posto del lotto: valida, oppure in attesa di pagamento e ancora nel termine. */
export function tienePosto(i: Pick<Iscrizione, 'stato' | 'scade'>, adesso = new Date()) {
  return isAttiva(i) || (i.stato === 'in_attesa' && !iscrizioneScaduta(i, adesso));
}

export function eventoPassato(e: Pick<Evento, 'data' | 'dataFine'>, adesso = new Date()) {
  const fine = e.dataFine ? new Date(e.dataFine) : new Date(new Date(e.data).getTime() + 8 * 3_600_000);
  return fine.getTime() < adesso.getTime();
}

/**
 * Quale lotto si prende adesso? Il primo (per ordine) già aperto, non scaduto e con posti.
 * Da link PR si saltano i lotti non visibili ai PR.
 */
export function statoLista(
  evento: Evento, lotti: Lotto[], usati: Record<string, number>, opzioni: { adesso?: Date; daPr?: boolean } = {},
): StatoLista {
  const adesso = opzioni.adesso ?? new Date();
  if (eventoPassato(evento, adesso)) return { tipo: 'passata' };
  const dellEvento = lotti.filter((l) => l.eventoId === evento.id);
  const suoi = dellEvento.filter((l) => !opzioni.daPr || l.visibileDaPr).sort((a, b) => a.ordine - b.ordine);

  // Nessun lotto definito: vale il prezzo lista dell'evento, senza limite di posti.
  if (dellEvento.length === 0) {
    if (new Date(evento.data).getTime() < adesso.getTime()) return { tipo: 'chiusa' };
    return evento.tipoIngresso === 'libero' || evento.prezzoLista === 0
      ? { tipo: 'libero', lotto: null, prezzo: 0 }
      : { tipo: 'aperta', lotto: null, prezzo: evento.prezzoLista };
  }

  let futuro: string | null = null;
  let pieno = false;
  for (const l of suoi) {
    if (l.dataInizio && new Date(l.dataInizio) > adesso) { futuro ??= l.dataInizio; continue; }
    if (l.dataFine && new Date(l.dataFine) < adesso) continue;
    if (l.quantita != null && (usati[l.id] ?? 0) >= l.quantita) { pieno = true; continue; }
    return evento.tipoIngresso === 'libero' || l.prezzo === 0
      ? { tipo: 'libero', lotto: l, prezzo: 0 }
      : { tipo: 'aperta', lotto: l, prezzo: l.prezzo };
  }
  if (suoi.length === 0) return { tipo: 'chiusa' }; // nessun lotto vendibile da link PR
  if (futuro) return { tipo: 'dal', dal: futuro };
  return pieno ? { tipo: 'piena' } : { tipo: 'chiusa' };
}

/** Testo e classe del chip evento, sempre con la parola (mai solo colore). */
export function chipLista(s: StatoLista, breve = false): { testo: string; classe: string } {
  switch (s.tipo) {
    case 'aperta': return { testo: breve ? `Lista · ${euro(s.prezzo)}` : 'Lista aperta', classe: 'mm-chip mm-chip--lista' };
    case 'libero': return { testo: 'Ingresso libero', classe: 'mm-chip mm-chip--libero' };
    case 'dal': return { testo: `Lista dal ${dataPunti(s.dal)}`, classe: 'mm-chip mm-chip--pagato' };
    case 'piena': return { testo: 'Lista piena', classe: 'mm-chip mm-chip--esaurito' };
    case 'chiusa': return { testo: 'Lista chiusa', classe: 'mm-chip mm-chip--pagato' };
    case 'passata': return { testo: 'Serata passata', classe: 'mm-chip mm-chip--libero' };
  }
}

export function etaSufficiente(dataNascita: string, evento: Pick<Evento, 'data' | 'etaMinima'>) {
  return anniCompiuti(dataNascita, dataIso(evento.data)) >= evento.etaMinima;
}

/** Normalizza il cognome per il controllo doppioni: "D'Àngelo " e "d'angelo" sono la stessa persona. */
export function chiaveCognome(cognome: string) {
  return cognome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

export function giaIscritto(
  iscrizioni: Iscrizione[], eventoId: string, cognome: string, dataNascita: string,
) {
  const k = chiaveCognome(cognome);
  return iscrizioni.find((i) => i.eventoId === eventoId && isAttiva(i) && i.dataNascita === dataNascita && chiaveCognome(i.cognome) === k);
}

/** Valida giorno/mese/anno come data reale (niente 31 febbraio). */
export function componiData(giorno: string, mese: string, anno: string): string | null {
  const g = Number(giorno), m = Number(mese), a = Number(anno);
  if (!/^\d{1,2}$/.test(giorno.trim()) || !/^\d{1,2}$/.test(mese.trim()) || !/^\d{4}$/.test(anno.trim())) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) return null;
  if (a < 1900 || d.getTime() > Date.now()) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}

/**
 * Pagamento online (tutti i pagamenti passano dal sito): il tavolo resta fermo solo mentre il cliente paga.
 * 30 minuti è il minimo che Stripe accetta per la scadenza della pagina di pagamento. Se la richiesta la
 * inserisce il PR (o la crew, per un tavolo venduto a voce), il cliente riceve il link per email e ha più tempo.
 */
export const MINUTI_PAGAMENTO_ONLINE = 30;
export const ORE_PAGAMENTO_ONLINE_PR = 24;
/** Il promemoria della richiesta inserita dal PR (o dalla crew) parte solo se il cliente ha avuto il link da almeno queste ore. */
export const ORE_MINIME_PROMEMORIA_PR = 3;

/** Termine del pagamento: pochi minuti (o qualche ora, se inserita dal PR o dalla crew), mai oltre l'apertura. */
export function scadenzaPagamentoOnline(richiesta: Date, evento: Pick<Evento, 'data'>, conLink = false) {
  const durata = conLink ? ORE_PAGAMENTO_ONLINE_PR * 3_600_000 : MINUTI_PAGAMENTO_ONLINE * 60_000;
  return new Date(Math.min(richiesta.getTime() + durata, new Date(evento.data).getTime())).toISOString();
}

/**
 * Pagamento online di una prevendita arrivato (anche in ritardo, dopo il termine). Vale se l'iscrizione aspettava
 * ancora il pagamento (o è scaduta da poco), la serata non è iniziata, nel lotto c'è ancora posto e la stessa persona
 * non ha già un altro QR valido. Altrimenti i soldi vanno restituiti.
 */
export function pagamentoIscrizioneValido(o: {
  iscrizione: Pick<Iscrizione, 'stato'>; evento: Pick<Evento, 'data'>; lotto: Pick<Lotto, 'quantita'> | null;
  altriNelLotto: number; doppione: boolean; adesso?: Date;
}) {
  const adesso = o.adesso ?? new Date();
  if (o.iscrizione.stato !== 'in_attesa' && o.iscrizione.stato !== 'scaduta') return false;
  if (new Date(o.evento.data).getTime() <= adesso.getTime()) return false;
  if (o.lotto?.quantita != null && o.altriNelLotto >= o.lotto.quantita) return false;
  return !o.doppione;
}

/** Le richieste dei tavoli si chiudono all'apertura: dopo, il termine per pagare sarebbe già passato. */
export function richiesteTavoliAperte(evento: Pick<Evento, 'data'>, adesso = new Date()) {
  return new Date(evento.data).getTime() > adesso.getTime();
}

/** Tiene occupato il tavolo: in attesa di pagamento o già pagata. */
export const prenotazioneAttiva = (p: Pick<PrenotazioneTavolo, 'stato'>) => p.stato === 'in_attesa' || p.stato === 'confermata';

export function prenotazioneScaduta(p: Pick<PrenotazioneTavolo, 'stato' | 'scade'>, adesso = new Date()) {
  return p.stato === 'in_attesa' && new Date(p.scade).getTime() <= adesso.getTime();
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
export const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
