'use client';

import { useEffect, useRef } from 'react';
import { ATTESA_MASSIMA_MS, EVENTO_FINE_INTRO } from '@/lib/intro/regole';

/**
 * Intro animata del brand sopra la pagina (versione scelta in lib/intro/regole.ts).
 * Se parte lo decide lo script inline del layout (attributo data-intro su <html>), prima del primo disegno.
 * p5 si scarica solo qui, quando l'intro parte; la pagina sotto si carica normalmente.
 * Un tocco, un clic o un tasto la saltano; se non parte in tempo o va in errore, si va dritti al sito.
 */
export function IntroBrand() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const el = ref.current;
    if (!el || !html.hasAttribute('data-intro')) return;

    let chiusa = false;
    let ferma: (() => void) | undefined;
    const eventi = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    const pulisci = () => {
      ferma?.();
      ferma = undefined;
      clearTimeout(scadenza);
      eventi.forEach((e) => window.removeEventListener(e, fine));
    };
    // fine vera dell'intro (finita, saltata o fallita): via la copertura e via libera alle animazioni della pagina
    const fine = () => {
      if (chiusa) return;
      chiusa = true;
      pulisci();
      html.removeAttribute('data-intro');
      window.dispatchEvent(new Event(EVENTO_FINE_INTRO));
    };

    eventi.forEach((e) => window.addEventListener(e, fine, { passive: true }));
    // tempo contato dall'apertura della pagina: oltre, meglio il sito subito che uno schermo nero
    const scadenza = setTimeout(fine, Math.max(0, ATTESA_MASSIMA_MS - performance.now()));

    import('@/lib/intro/avvio')
      .then(({ avviaIntro }) => avviaIntro(el, fine))
      .then((stop) => {
        if (chiusa) { stop(); return; }
        clearTimeout(scadenza);
        ferma = stop;
        html.setAttribute('data-intro', 'in-corso');
      })
      .catch(fine);

    // smontato senza essere finito (es. doppio effetto in sviluppo): si ferma tutto ma l'intro resta da fare
    return () => {
      if (chiusa) return;
      chiusa = true;
      pulisci();
    };
  }, []);

  return <div ref={ref} className="mm-intro" aria-hidden="true" />;
}
