/** Dove mettere l'etichetta arancio della serata rispetto al punto: sopra, sotto, a sinistra o a destra, dove sta nel riquadro e copre meno nomi (senza dipendenze, per i test). */

export type Rett = { x0: number; y0: number; x1: number; y1: number };
export type Lato = 'su' | 'giu' | 'sx' | 'dx';
export type Posizione = {
  lato: Lato;
  /** Dove cade il punto lungo l'etichetta, in % (della larghezza se sopra o sotto, dell'altezza se di lato): lì si attacca lo stelo. */
  ancora: number;
  rett: Rett;
  /** Sta tutta dentro il riquadro, con il margine. */
  dentro: boolean;
};

/** Dal centro del punto alla faccia dell'etichetta: raggio del punto (10) + stelo (12). */
export const DISTANZA = 22;
const MARGINE = 6;
const ORDINE: Lato[] = ['su', 'giu', 'dx', 'sx'];

/** Misura approssimata dell'etichetta (titolo in Big Shoulders nero, riga sotto in mono): stessa larghezza massima del CSS (290 px, 360 se il riquadro è largo). */
export function misuraEtichetta(titolo: string, sotto: string, larga = false): { w: number; h: number } {
  const w = Math.max(titolo.length * (larga ? 10.4 : 6.8), sotto.length * (larga ? 7 : 6.3)) + 20;
  return { w: Math.min(larga ? 360 : 290, Math.round(w)), h: larga ? 53 : 44 };
}

/** Rettangolo di un nome scritto accanto a un punto (paese: pallino + nome, a destra o a sinistra) o centrato sul punto (luogo). */
export function rettNome(x: number, y: number, nome: string, opzioni: { larga?: boolean; sinistra?: boolean; centrato?: boolean; carattere?: number } = {}): Rett {
  const { larga = false, sinistra = false, centrato = false } = opzioni;
  const w = nome.length * (opzioni.carattere ?? (larga ? 9 : 7.5)) + (centrato ? 0 : 18);
  if (centrato) return { x0: x - w / 2, y0: y - 8, x1: x + w / 2, y1: y + 8 };
  return sinistra ? { x0: x - w, y0: y - 8, x1: x, y1: y + 8 } : { x0: x, y0: y - 8, x1: x + w, y1: y + 8 };
}

export function sovrapposizione(a: Rett, b: Rett): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

const tra = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

function candidata(lato: Lato, p: { x: number; y: number }, m: { w: number; h: number }, box: { w: number; h: number }): Posizione {
  if (lato === 'su' || lato === 'giu') {
    const x0 = tra(p.x - m.w / 2, MARGINE, box.w - m.w - MARGINE);
    const ancora = Math.round(tra(((p.x - x0) / m.w) * 100, 0, 100));
    const a = p.x - (ancora * m.w) / 100;
    const y0 = lato === 'su' ? p.y - DISTANZA - m.h : p.y + DISTANZA;
    return { lato, ancora, rett: { x0: a, y0, x1: a + m.w, y1: y0 + m.h }, dentro: false };
  }
  const y0 = tra(p.y - m.h / 2, MARGINE, box.h - m.h - MARGINE);
  const ancora = Math.round(tra(((p.y - y0) / m.h) * 100, 0, 100));
  const a = p.y - (ancora * m.h) / 100;
  const x0 = lato === 'dx' ? p.x + DISTANZA : p.x - DISTANZA - m.w;
  return { lato, ancora, rett: { x0, y0: a, x1: x0 + m.w, y1: a + m.h }, dentro: false };
}

/**
 * Sceglie il lato: tra quelli che stanno tutti nel riquadro vince chi copre meno area di `ostacoli` (nomi, pulsanti, titolo);
 * a parità, l'ordine è sopra, sotto, destra, sinistra. Se nessuno sta dentro, vince chi esce di meno.
 */
export function scegliLato(punto: { x: number; y: number }, misura: { w: number; h: number }, box: { w: number; h: number }, ostacoli: Rett[] = []): Posizione {
  const T = 2; // l'ancora è arrotondata: un paio di pixel di scarto non contano come "fuori"
  const dentroBox: Rett = { x0: MARGINE - T, y0: MARGINE - T, x1: box.w - MARGINE + T, y1: box.h - MARGINE + T };
  let migliore: Posizione | null = null;
  let costoMigliore = Infinity;
  ORDINE.forEach((lato, i) => {
    const c = candidata(lato, punto, misura, box);
    const area = misura.w * misura.h;
    const fuori = area - sovrapposizione(c.rett, dentroBox);
    const costo = fuori * 1000 + ostacoli.reduce((t, o) => t + sovrapposizione(c.rett, o), 0) + i;
    c.dentro = fuori < 1;
    if (costo < costoMigliore) { costoMigliore = costo; migliore = c; }
  });
  return migliore!;
}

/** Ingombro dei pulsanti negli angoli in alto ("Vedi la mappa" a sinistra, "Indicazioni" a destra): l'etichetta non ci va sopra. */
export function rettPulsanti(boxW: number, sinistra: boolean): Rett[] {
  const r: Rett[] = [{ x0: boxW - 130, y0: 0, x1: boxW, y1: 52 }];
  if (sinistra) r.push({ x0: 0, y0: 0, x1: 178, y1: 52 });
  return r;
}
