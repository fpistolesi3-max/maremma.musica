import type { Evento } from './dati/tipi';
import { linkIndicazioni } from './mappa';

/** Il posto, oppure "segreta" fino a 48 ore prima (usabile ovunque, anche nelle email e nel PDF). */
export function luogoVisibile(e: Pick<Evento, 'locationSegreta' | 'data'>, adesso = new Date()) {
  return !e.locationSegreta || new Date(e.data).getTime() - adesso.getTime() <= 48 * 3_600_000;
}

export function luogoTesto(e: Evento) {
  if (!luogoVisibile(e)) return 'Location segreta · svelata 48 ore prima';
  return [e.comune, e.location].filter(Boolean).join(' · ') || 'Location in arrivo'; // TODO: cliente
}

/** "Come arrivare" del biglietto: link a Google Maps, ma solo quando la pagina della serata rivelerebbe il posto (location segreta: niente fino a 48 ore prima). Null se non c'è niente da cercare. */
export function linkComeArrivare(e: Pick<Evento, 'locationSegreta' | 'data' | 'lat' | 'lng' | 'location' | 'comune'>, adesso = new Date()): string | null {
  return luogoVisibile(e, adesso) ? linkIndicazioni(e) : null;
}
