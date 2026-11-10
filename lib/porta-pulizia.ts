// Pulizia dell'elenco della porta salvato sul telefono (nomi, date di nascita), fuori dalla pagina della porta.
import { elencoScaduto } from './porta-logica';

export const CHIAVE_PORTA = 'mm-porta'; // la stessa di components/porta/store.ts

/**
 * Toglie dal localStorage l'elenco della porta scaduto (12 ore dopo la fine della serata).
 * Serve per chi è uscito dalla porta durante la serata (l'elenco resta per rientrare senza campo) e non la riapre più.
 * Mai con ingressi ancora da inviare. Legge il localStorage direttamente: lo store della porta non si carica sulle altre pagine.
 */
export function pulisciElencoPorta(memoria: Pick<Storage, 'getItem' | 'setItem'>, ora: Date = new Date()): boolean {
  try {
    const salvato = memoria.getItem(CHIAVE_PORTA);
    if (!salvato) return false;
    const dati = JSON.parse(salvato) as { state?: Record<string, unknown> };
    const s = dati.state;
    if (!s || !elencoScaduto(s.scadeAlle as string | null | undefined, ora)) return false;
    if (Array.isArray(s.coda) && s.coda.length > 0) return false;
    memoria.setItem(CHIAVE_PORTA, JSON.stringify({ ...dati, state: { ...s, eventoId: null, elenco: [], salvatoAlle: null, scadeAlle: null, limite: null, conflitti: 0 } }));
    return true;
  } catch {
    return false; // localStorage non disponibile o illeggibile: niente da fare
  }
}
