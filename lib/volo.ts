// Calcoli del visore delle foto (volo tra miniatura e schermo intero, scorrimento col dito), senza DOM: li usa
// components/foto-serata.tsx.

export interface Rett { left: number; top: number; width: number; height: number }
/** Uno spostamento più un ingrandimento (anche diverso in larghezza e altezza), con origine in alto a sinistra. */
export interface Trasf { x: number; y: number; sx: number; sy: number }

export const DURATA_APERTURA = 300;
export const DURATA_CHIUSURA = 260;
/** Spazio tra una foto e l'altra mentre scorrono. */
export const STACCO = 16;

/** Dove sta una foto larga×alta dentro `area`, intera (come object-fit: contain). */
export function rettContenuto(area: Rett, larghezza: number, altezza: number): Rett {
  const s = Math.min(area.width / larghezza, area.height / altezza);
  const width = larghezza * s, height = altezza * s;
  return { left: area.left + (area.width - width) / 2, top: area.top + (area.height - height) / 2, width, height };
}

/** Parte decisa e arriva morbida (quartica in uscita). */
export const curvaVolo = (t: number) => 1 - (1 - t) ** 4;

const tra = (a: number, b: number, p: number) => a + (b - a) * p;

/**
 * I fotogrammi del volo da una miniatura alla foto intera, con soli `transform` (niente dimensioni né ritagli animati,
 * così lavora la scheda grafica e la pagina non si ricalcola). Il guscio, grande come `finale` e con overflow hidden,
 * si stira fino alla cornice della miniatura (`cornice`); la foto dentro si stira al contrario, così resta senza
 * deformazioni e si vede ritagliata come nella griglia. `copre` è dove sta la foto ritagliata (object-fit: cover,
 * con l'eventuale ingrandimento del passaggio del mouse). La curva è già dentro i fotogrammi: tra uno e l'altro si va dritti.
 */
export function fotogrammiVolo(cornice: Rett, copre: Rett, finale: Rett, passi = 16): { guscio: Trasf[]; foto: Trasf[] } {
  const guscio: Trasf[] = [], foto: Trasf[] = [];
  const kMini = Math.max(copre.width / finale.width, copre.height / finale.height);
  const centroMini = { x: copre.left + copre.width / 2, y: copre.top + copre.height / 2 };
  const centroFinale = { x: finale.left + finale.width / 2, y: finale.top + finale.height / 2 };
  for (let i = 0; i <= passi; i++) {
    const p = curvaVolo(i / passi);
    const w = { left: tra(cornice.left, finale.left, p), top: tra(cornice.top, finale.top, p), width: tra(cornice.width, finale.width, p), height: tra(cornice.height, finale.height, p) };
    const sx = w.width / finale.width, sy = w.height / finale.height;
    const k = tra(kMini, 1, p);
    const cx = tra(centroMini.x, centroFinale.x, p), cy = tra(centroMini.y, centroFinale.y, p);
    guscio.push({ x: w.left - finale.left, y: w.top - finale.top, sx, sy });
    foto.push({ x: (cx - (k * finale.width) / 2 - w.left) / sx, y: (cy - (k * finale.height) / 2 - w.top) / sy, sx: k / sx, sy: k / sy });
  }
  return { guscio, foto };
}

export const cssTrasf = (t: Trasf) => `translate(${t.x}px, ${t.y}px) scale(${t.sx}, ${t.sy})`;

/**
 * Alla fine del trascinamento col dito: 1 = alla successiva, -1 = alla precedente, 0 = torna al suo posto.
 * Si cambia se la foto è spinta oltre un quarto della larghezza, o lanciata (più di mezzo pixel al millisecondo) per almeno 30 px.
 */
export function esitoTrascinamento({ dx, velocita, larghezza, quante }: { dx: number; velocita: number; larghezza: number; quante: number }): -1 | 0 | 1 {
  if (quante < 2 || dx === 0) return 0;
  const lancio = Math.abs(velocita) > 0.5 && Math.sign(velocita) === Math.sign(dx) && Math.abs(dx) > 30;
  if (Math.abs(dx) <= larghezza / 4 && !lancio) return 0;
  return dx < 0 ? 1 : -1;
}
