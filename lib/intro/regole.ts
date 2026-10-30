// Intro animata del brand: quale versione si usa e quando parte.
// Niente dipendenze: le funzioni qui sotto finiscono anche nello script inline che decide prima del primo disegno.

export type StileIntro = 'classico' | 'techno' | 'giradischi';
export type UscitaIntro = 'tenda' | 'blob' | 'strisce' | 'spazzata';

/**
 * La versione in uso. Le altre restano nel codice: per cambiarla basta questa riga.
 * - classico: tipografia cinetica e blob morbidi (uscite pensate: tenda o blob)
 * - techno: tutto a scatti su 128 BPM, glitch a fette (uscita pensata: strisce)
 * - giradischi: lo slogan scende dal piatto, scratch, poi accanto al disco (uscita pensata: spazzata)
 */
export const INTRO: { stile: StileIntro; uscita: UscitaIntro; logo: 'png' | 'vettoriale' } = {
  stile: 'giradischi',
  uscita: 'spazzata',
  logo: 'png',
};

export const CHIAVE_INTRO = 'mm-intro';
export const EVENTO_FINE_INTRO = 'mm:intro-fine';
/** Oltre questo tempo dall'apertura della pagina l'intro non parte più: meglio il sito subito che uno schermo nero. */
export const ATTESA_MASSIMA_MS = 2000;

/**
 * Parte solo alla prima pagina pubblica della sessione (anche all'avvio della web app installata, che è una sessione nuova).
 * Mai con prefers-reduced-motion e mai sul biglietto, che si apre dalla mail e spesso alla porta.
 * Deve restare autonoma (niente riferimenti esterni): viene copiata così com'è nello script inline.
 */
export function decidiIntro(s: { giaVista: boolean; movimentoRidotto: boolean; percorso: string }): boolean {
  return !s.giaVista && !s.movimentoRidotto && !/^\/biglietto(\/|$)/.test(s.percorso);
}

function avvio(decidi: typeof decidiIntro, chiave: string) {
  try {
    const s = window.sessionStorage;
    const giaVista = !!s.getItem(chiave);
    s.setItem(chiave, '1');
    if (!decidi({ giaVista, movimentoRidotto: matchMedia('(prefers-reduced-motion: reduce)').matches, percorso: location.pathname })) return;
    // nella stessa sessione l'intro sostituisce il caricamento della home
    s.setItem('mm-caricamento', '1');
    document.documentElement.setAttribute('data-intro', '');
  } catch { /* senza storage niente intro */ }
}

/** Per le animazioni della pagina che non devono partire sotto l'intro (es. i titoli che si decodificano). */
export function attendiFineIntro(): Promise<void> {
  if (!document.documentElement.hasAttribute('data-intro')) return Promise.resolve();
  return new Promise((ok) => window.addEventListener(EVENTO_FINE_INTRO, () => ok(), { once: true }));
}

/**
 * Script inline del layout delle pagine pubbliche: gira prima del primo disegno, così la copertura
 * dell'intro c'è dal primo fotogramma (niente lampo del sito prima dell'animazione).
 */
export function scriptIntro(): string {
  return `(${avvio.toString()})(${decidiIntro.toString()}, ${JSON.stringify(CHIAVE_INTRO)})`;
}
