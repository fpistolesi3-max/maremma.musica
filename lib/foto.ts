// Regole delle foto delle serate, senza accesso a dati o file: le usano sia il server sia le pagine.

export const MAX_FOTO_SERATA = 150;
export const MAX_IN_EVIDENZA = 4;
/** Lato lungo della foto grande e della miniatura, in pixel (le riduce il browser prima del caricamento). */
export const LATO_GRANDE = 2000;
export const LATO_MINIATURA = 600;
/** Peso massimo di ogni file caricato: coincide con il limite del bucket `foto-serate`. */
export const MAX_BYTE_FILE = 1_500_000;
/** Un caricamento non confermato dopo tanto tempo è abbandonato e si ripulisce. */
export const SCADENZA_CARICAMENTO_MS = 60 * 60 * 1000;
export const MAX_CREDITO = 80;

export interface Foto {
  id: string;
  eventoId: string;
  ordine: number;
  inEvidenza: boolean;
  nascosta: boolean;
  larghezza: number;
  altezza: number;
  byte: number;
  /** false finché il browser non ha finito di caricare i due file e il server non li ha controllati. */
  pronta: boolean;
  creataAt: string;
}

/** Foto con gli indirizzi a cui si vedono nel sito. */
export interface FotoVista extends Foto {
  urlGrande: string;
  urlMini: string;
}

export const percorsoGrande = (eventoId: string, id: string) => `${eventoId}/${id}.jpg`;
export const percorsoMini = (eventoId: string, id: string) => `${eventoId}/${id}-m.jpg`;

const perOrdine = <T extends Pick<Foto, 'ordine' | 'creataAt'>>(a: T, b: T) => a.ordine - b.ordine || a.creataAt.localeCompare(b.creataAt);

/** Quello che vede il pubblico: solo foto pronte e non nascoste, nell'ordine scelto. */
export function fotoVisibili<T extends Foto>(foto: readonly T[]): T[] {
  return foto.filter((f) => f.pronta && !f.nascosta).sort(perOrdine);
}

/** Le foto in evidenza (massimo 4). Se l'admin non ne ha scelta nessuna, valgono le prime visibili. */
export function fotoInEvidenza<T extends Foto>(foto: readonly T[], quante = MAX_IN_EVIDENZA): T[] {
  const visibili = fotoVisibili(foto);
  const scelte = visibili.filter((f) => f.inEvidenza);
  return (scelte.length ? scelte : visibili).slice(0, Math.min(quante, MAX_IN_EVIDENZA));
}

/**
 * Sposta una foto di un posto. Restituisce gli aggiornamenti d'ordine da fare (di solito due; se ci sono numeri
 * uguali, per esempio foto caricate insieme, rinumera tutta la serie), o null se la foto è già in cima o in fondo.
 */
export function spostaFoto(foto: readonly Foto[], id: string, verso: 'prima' | 'dopo'): { id: string; ordine: number }[] | null {
  const lista = foto.filter((f) => f.pronta).sort(perOrdine);
  const i = lista.findIndex((f) => f.id === id);
  const j = verso === 'prima' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return null;
  if (lista[i].ordine !== lista[j].ordine) return [{ id: lista[i].id, ordine: lista[j].ordine }, { id: lista[j].id, ordine: lista[i].ordine }];
  const nuova = lista.slice();
  [nuova[i], nuova[j]] = [nuova[j], nuova[i]];
  return nuova.map((f, k) => ({ id: f.id, ordine: k })).filter((u, k) => lista.find((f) => f.id === u.id)!.ordine !== u.ordine || k === i || k === j);
}

export function testoAltFoto(nomeSerata: string, dataGgMm: string, numero?: number) {
  return `Foto della serata ${nomeSerata} del ${dataGgMm}${numero ? `, numero ${numero}` : ''}`;
}

export function creditoPulito(testo: string) {
  return testo.replace(/\s+/g, ' ').trim().slice(0, MAX_CREDITO);
}

/**
 * Le foto della sezione "Serate passate" della home: fino a 4, una per serata a turno (dalla più recente), così si vedono
 * le ultime serate; se le serate sono meno di 4 si riempie con le altre foto in evidenza. Senza foto: lista vuota.
 */
export function fotoPerHome<E, F>(serate: readonly { evento: E; evidenza: readonly F[] }[], quante = 4): { evento: E; foto: F }[] {
  const out: { evento: E; foto: F }[] = [];
  const recenti = serate.slice(0, quante);
  for (let giro = 0; out.length < quante; giro++) {
    let preso = false;
    for (const s of recenti) {
      if (s.evidenza[giro] !== undefined && out.length < quante) { out.push({ evento: s.evento, foto: s.evidenza[giro] }); preso = true; }
    }
    if (!preso) break;
  }
  return out;
}
