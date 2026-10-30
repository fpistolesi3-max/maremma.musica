// Avvio dell'intro nel browser. Questo modulo si carica solo quando l'intro parte (import dinamico): mai nel bundle comune.
import { DURATA, creaIntro } from './sketch';
import { Pennello } from './pennello';
import { INTRO } from './regole';

const LOGO = '/img/logo-maremma-musica-intro.webp';

// Archivo Black e DM Serif Display servono solo all'intro: si caricano qui, non in globals.css.
// Martian Mono (stile techno) è già dichiarato dal sito.
const FONT_LOCALI: Record<string, string> = {
  'Archivo Black': '/fonts/archivo-black-400.woff2',
  'DM Serif Display': '/fonts/dm-serif-display-400.woff2',
};
const FONT_PER_STILE = {
  classico: ['Archivo Black', 'DM Serif Display'],
  techno: ['Archivo Black', 'Martian Mono'],
  giradischi: ['Archivo Black'],
} as const;

async function caricaFont(famiglia: string) {
  const url = FONT_LOCALI[famiglia];
  if (url) {
    const f = new FontFace(famiglia, `url(${url}) format("woff2")`);
    document.fonts.add(await f.load());
  } else {
    await document.fonts.load(`400 16px "${famiglia}"`);
  }
}

function caricaLogo() {
  return new Promise<HTMLImageElement>((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = ko;
    img.src = LOGO;
  });
}

/**
 * Carica font e logo in parallelo, poi disegna l'intro su un canvas nel contenitore, a ogni fotogramma (requestAnimationFrame).
 * La promessa si risolve al primo fotogramma con la funzione che ferma tutto; a fine animazione chiama finita().
 */
export async function avviaIntro(contenitore: HTMLElement, finita: () => void): Promise<() => void> {
  const usaPng = INTRO.logo === 'png' || INTRO.stile !== 'classico';
  const [immagineLogo] = await Promise.all([
    usaPng ? caricaLogo() : Promise.resolve(undefined),
    ...FONT_PER_STILE[INTRO.stile].map(caricaFont),
  ]);

  const canvas = document.createElement('canvas');
  contenitore.appendChild(canvas);
  const p = new Pennello(canvas);
  const misura = () => p.dimensiona(contenitore.clientWidth, contenitore.clientHeight, Math.min(2, window.devicePixelRatio || 1));
  misura();
  window.addEventListener('resize', misura);
  p.noiseSeed(7);
  const intro = creaIntro(p, { ...INTRO, immagineLogo });

  let raf = 0;
  const ferma = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', misura);
    canvas.remove();
  };
  return new Promise((partita) => {
    let inizio = 0;
    const passo = (ora: number) => {
      if (!inizio) { inizio = ora; partita(ferma); }
      const t = (ora - inizio) / 1000;
      intro.disegna(t);
      if (t >= DURATA) { finita(); return; }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
  });
}
