import { serataIniziale } from './elenco-serate';

/** I parametri della pagina Iscrizioni. `pr` è l'handle di un PR, oppure "nessuno" (arrivati da soli) o "con" (portati da un PR qualsiasi). */
export interface FiltroIscrizioni { evento?: string; q?: string; stato?: string; pr?: string; canale?: string }

type Serata = { passata: boolean; evento: { id: string; data: string; pubblicato: boolean } };

/**
 * Cosa mostra la pagina Iscrizioni. Di norma una serata sola: quella scelta, altrimenti la prossima (o l'ultima passata).
 * Con un testo di ricerca si cerca in tutte le serate (la scelta resta per tornarci). Un filtro PR/canale senza serata scelta
 * (come i numeri della pagina Canali con "tutte le serate") mostra anch'esso tutte le serate.
 */
export function vistaIscrizioni<T extends Serata>(f: FiltroIscrizioni, serate: T[]) {
  const scelta = serate.find((x) => x.evento.id === f.evento) ?? serataIniziale(serate);
  const eventoValido = serate.some((x) => x.evento.id === f.evento);
  const tutte = Boolean(f.q?.trim()) || (!eventoValido && Boolean(f.pr || f.canale));
  return { scelta, tutte };
}

/** Indirizzo della pagina Iscrizioni con questi filtri (quelli vuoti si tolgono). */
export function percorsoIscrizioni(f: FiltroIscrizioni) {
  const p = new URLSearchParams();
  for (const k of ['evento', 'q', 'stato', 'pr', 'canale'] as const) if (f[k]) p.set(k, f[k]!);
  const s = p.toString();
  return s ? `/admin/iscrizioni?${s}` : '/admin/iscrizioni';
}
