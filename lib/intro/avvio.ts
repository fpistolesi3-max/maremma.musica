// Avvio dell'intro nel browser. Questo modulo (con p5) si carica solo quando l'intro parte: mai nel bundle comune.
import { DURATA, creaIntro } from './sketch';
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
  return new Promise<void>((ok, ko) => {
    const img = new Image();
    img.onload = () => ok();
    img.onerror = ko;
    img.src = LOGO;
  });
}

/**
 * Carica p5, font e logo in parallelo, poi disegna l'intro nel contenitore.
 * La promessa si risolve al primo fotogramma con la funzione che ferma tutto; a fine animazione chiama finita().
 */
export async function avviaIntro(contenitore: HTMLElement, finita: () => void): Promise<() => void> {
  const usaPng = INTRO.logo === 'png' || INTRO.stile !== 'classico';
  const [{ default: P5 }] = await Promise.all([
    import('p5'),
    ...FONT_PER_STILE[INTRO.stile].map(caricaFont),
    usaPng ? caricaLogo() : Promise.resolve(),
  ]);

  return new Promise((partita) => {
    let intro: ReturnType<typeof creaIntro> | null = null;
    let inizio = 0;
    const istanza = new P5((p) => {
      p.setup = async () => {
        p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
        p.createCanvas(contenitore.clientWidth, contenitore.clientHeight);
        p.noiseSeed(7);
        // il logo è già nella cache del browser: qui si converte solo in immagine di p5
        const immagineLogo = usaPng ? await p.loadImage(LOGO) : undefined;
        intro = creaIntro(p, { ...INTRO, immagineLogo });
      };
      p.draw = () => {
        if (!intro) return;
        if (!inizio) { inizio = p.millis(); partita(() => istanza.remove()); }
        const t = (p.millis() - inizio) / 1000;
        intro.disegna(t);
        if (t >= DURATA) { p.noLoop(); finita(); }
      };
      p.windowResized = () => p.resizeCanvas(contenitore.clientWidth, contenitore.clientHeight);
    }, contenitore);
  });
}
