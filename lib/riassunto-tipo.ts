// Riepilogo in parole semplici di un tipo di prevendita, per l'admin.
// Funzione pura: legge gli stessi valori del modulo e li racconta con la stessa logica con cui vengono salvati
// (salvaLottoAzione) e usati per vendere (finestraLotto, tipiVista in lib/regole.ts).
import { parti } from './formato';
import { finestraLotto } from './regole';

export type UscitaModo = 'subito' | 'giorni' | 'data';
export type FineModo = 'mai' | 'ore' | 'data';
export type PrModo = 'tutti' | 'alcuni' | 'nessuno';

export interface DatiTipo {
  uscitaModo: UscitaModo;
  uscitaGiorniPrima: string;     // come scritto nel campo ("" = vuoto)
  dataInizio: string;            // "2026-11-28T00:00" (campo data e ora)
  dopoPrecedente: boolean;
  primo: boolean;                // il primo tipo non ha un "tipo prima": la casella non conta
  fineModo: FineModo;
  fineOrePrima: string;
  dataFine: string;
  quantita: string;              // "" = illimitati
  categoria: string;
  confermaCategoria: boolean;
  prModo: PrModo;
  prScelti: string[];            // nomi dei PR spuntati (solo con prModo "alcuni")
  dataSerata?: string;           // apertura della serata (ISO): con lei "14 giorni prima" diventa anche un giorno preciso
}

const GIORNO = 86_400_000;
const ORA = 3_600_000;
const due = (n: number) => String(n).padStart(2, '0');

/** Istante ISO → "23/11 alle 22:00" (ora di Roma). */
function giornoEOra(iso: string): string {
  const p = parti(iso);
  return `${due(p.giorno)}/${due(p.mese)} alle ${p.ore}:${p.minuti}`;
}

/** L'apertura della serata come istante, se c'è ed è una data vera. */
function apertura(d: DatiTipo): number | null {
  if (!d.dataSerata) return null;
  const t = Date.parse(d.dataSerata);
  return Number.isNaN(t) ? null : t;
}

/** Numero come lo legge il salvataggio: vuoto = nessun valore. */
function numero(v: string): number | null {
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** "2026-11-28T00:00" → "28/11 alle 00:00". Senza orario vale quello che userebbe il salvataggio. */
function dataEOra(v: string, orarioPredefinito: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v.trim());
  if (!m) return null;
  const ora = m[4] ? `${m[4]}:${m[5]}` : orarioPredefinito;
  return `${m[3]}/${m[2]} alle ${ora}`;
}

const plurale = (n: number, uno: string, molti: string) => `${n} ${n === 1 ? uno : molti}`;

/** Frase d'inizio. `dopoAParte`: "quando finiscono i posti del tipo prima" va detto a parte, perché c'è anche una data. */
function quandoInizia(d: DatiTipo): { testo: string; dopoAParte: boolean } {
  const dopo = d.dopoPrecedente && !d.primo;
  const giorni = d.uscitaModo === 'giorni' ? numero(d.uscitaGiorniPrima) : null;
  const data = d.uscitaModo === 'data' ? dataEOra(d.dataInizio, '00:00') : null;

  if (giorni != null) {
    const serata = apertura(d);
    const prima = giorni === 0 ? 'il giorno della serata' : `${plurale(giorni, 'giorno', 'giorni')} prima`;
    if (serata != null) return { testo: `In vendita dal ${giornoEOra(new Date(serata - giorni * GIORNO).toISOString())} (${prima})`, dopoAParte: dopo };
    return { testo: giorni === 0 ? 'In vendita dal giorno della serata' : `In vendita da ${plurale(giorni, 'giorno', 'giorni')} prima della serata`, dopoAParte: dopo };
  }
  if (data) return { testo: `In vendita dal ${data}`, dopoAParte: dopo };
  if (dopo) return { testo: 'In vendita quando finiscono i posti del tipo prima', dopoAParte: false };
  if (d.uscitaModo === 'giorni') return { testo: 'In vendita da subito (manca il numero di giorni)', dopoAParte: false };
  if (d.uscitaModo === 'data') return { testo: 'In vendita da subito (manca la data di inizio)', dopoAParte: false };
  return { testo: 'In vendita da subito', dopoAParte: false };
}

function quandoFinisce(d: DatiTipo): string {
  const ore = d.fineModo === 'ore' ? numero(d.fineOrePrima) : null;
  const data = d.fineModo === 'data' ? dataEOra(d.dataFine, '23:59') : null;
  if (ore != null) {
    const serata = apertura(d);
    const data = serata != null ? giornoEOra(new Date(serata - ore * ORA).toISOString()) : null;
    if (ore === 0) return data ? `fino all’inizio della serata (${data})` : 'fino all’inizio della serata';
    // 168 ore si leggono meglio come 7 giorni.
    const prima = ore >= 24 && ore % 24 === 0 ? `${plurale(ore / 24, 'giorno', 'giorni')} prima` : `${plurale(ore, 'ora', 'ore')} prima`;
    return data ? `fino al ${data} (${prima})` : `fino a ${prima} della serata`;
  }
  if (data) return `fino al ${data}`;
  if (d.fineModo === 'ore') return 'fino alla serata (manca il numero di ore)';
  if (d.fineModo === 'data') return 'fino alla serata (manca la data di fine)';
  return 'fino alla serata';
}

function posti(d: DatiTipo): string {
  const n = numero(d.quantita);
  return n == null ? 'posti illimitati' : plurale(n, 'posto', 'posti');
}

function categoria(d: DatiTipo): string | null {
  const c = d.categoria.trim().slice(0, 40);
  if (!c) return null;
  return d.confermaCategoria ? `categoria ${c} (il cliente dichiara di rientrarci)` : `categoria ${c}`;
}

function chiPuoVenderlo(d: DatiTipo): string {
  if (d.prModo === 'nessuno') return 'solo dal sito, non dai link dei PR';
  if (d.prModo === 'alcuni') {
    // «Alcuni» senza nessun PR spuntato non si salva (vedi lib/pr-scelti.ts).
    if (d.prScelti.length === 0) return 'nessun PR scelto: spunta almeno un PR per salvare';
    return `solo dai link di ${d.prScelti.join(', ')}`;
  }
  return 'anche dai link di tutti i PR';
}

/** Una riga: "In vendita dal 28/11 alle 00:00 fino alla serata · 100 posti · anche dai link di tutti i PR". */
export function riassuntoTipo(d: DatiTipo): string {
  const inizio = quandoInizia(d);
  const cat = categoria(d);
  return [
    `${inizio.testo} ${quandoFinisce(d)}`,
    ...(inizio.dopoAParte ? ['solo quando finiscono i posti del tipo prima'] : []),
    posti(d),
    ...(cat ? [cat] : []),
    chiPuoVenderlo(d),
  ].join(' · ');
}

/** Quando parte la vendita del primo tipo, per la testata della sezione: "da subito" oppure "dal 28/11". */
export function quandoParteLaVendita(
  l: { dataInizio: string | null; dataFine: string | null; uscitaGiorniPrima: number | null; fineOrePrima: number | null },
  dataSerata: string,
): string {
  const { inizio } = finestraLotto(l, { data: dataSerata });
  if (!inizio || Number.isNaN(inizio.getTime())) return 'da subito';
  const p = parti(inizio.toISOString());
  return `dal ${due(p.giorno)}/${due(p.mese)}`;
}
