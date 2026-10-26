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

export const ATTIVE: Iscrizione['stato'][] = ['in_lista', 'pagato', 'entrato'];
export const isAttiva = (i: Pick<Iscrizione, 'stato'>) => ATTIVE.includes(i.stato);

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

/** Giorni per pagare in anticipo un tavolo richiesto, prima che la prenotazione decada. */
export const GIORNI_PAGAMENTO_TAVOLO = 3;

/** Termine per pagare: qualche giorno dalla richiesta, ma mai oltre l'apertura della serata. */
export function scadenzaPagamento(richiesta: Date, evento: Pick<Evento, 'data'>) {
  return new Date(Math.min(richiesta.getTime() + GIORNI_PAGAMENTO_TAVOLO * 86_400_000, new Date(evento.data).getTime())).toISOString();
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
