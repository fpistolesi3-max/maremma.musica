// Campo trappola contro i programmi automatici che compilano i moduli pubblici (prevendita, tavoli, recupero del QR).
// Il campo è nel modulo ma fuori schermo, non raggiungibile da tastiera né letto ad alta voce: una persona lo lascia vuoto,
// un programma che riempie tutti i campi no. Non ferma chi prende di mira il sito apposta: per quello c'è il limite di
// richieste nel firewall di Vercel (README, "Moduli pubblici").

/** Nome del campo: lo stesso in tutti i moduli (era già quello del modulo dei tavoli). */
export const CAMPO_TRAPPOLA = 'sito';

/** true se il campo trappola arriva compilato: la richiesta viene da un programma, non da una persona. */
export function daProgramma(f: FormData): boolean {
  return String(f.get(CAMPO_TRAPPOLA) ?? '').trim() !== '';
}
