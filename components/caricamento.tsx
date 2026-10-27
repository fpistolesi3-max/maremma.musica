'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Disco } from './ui';
import { TitoloDecodifica } from './titolo-decodifica';

const CHIAVE = 'mm-caricamento';

/**
 * Caricamento iniziale della home: overlay di al massimo 1,2 s, una volta per sessione.
 * Non blocca il rendering (il contenuto è sotto); senza JS si chiude da solo con CSS;
 * un tocco, clic o tasto lo chiude subito; con prefers-reduced-motion non compare.
 */
export function Caricamento() {
  const ref = useRef<HTMLDivElement>(null);
  const [attivo, setAttivo] = useState(false);
  const isoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

  isoLayout(() => {
    const el = ref.current;
    if (!el) return;
    const saltare = () => {
      try {
        if (sessionStorage.getItem(CHIAVE)) return true;
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (nav && new URL(nav.name).pathname !== '/') { sessionStorage.setItem(CHIAVE, '1'); return true; }
        sessionStorage.setItem(CHIAVE, '1');
      } catch { /* senza storage si mostra e basta */ }
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    };
    if (saltare()) { el.remove(); return; }
    setAttivo(true);
    const chiudi = () => el.classList.add('mm-caricamento--esce');
    // pagina pronta = idratata; minimo ~0,6 s per non fare un lampo
    const t = setTimeout(chiudi, Math.max(0, 600 - performance.now()));
    const eventi = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    eventi.forEach((e) => window.addEventListener(e, chiudi, { once: true, passive: true }));
    const via = setTimeout(() => el.remove(), 2000);
    return () => { clearTimeout(t); clearTimeout(via); eventi.forEach((e) => window.removeEventListener(e, chiudi)); };
  }, []);

  return (
    <div ref={ref} className="mm-caricamento" aria-hidden="true">
      <Disco className="mm-caricamento__disco h-[132px] w-[132px]" etichetta={['✦', '✦']} />
      {/* il testo che si decodifica parte solo se il caricamento è davvero attivo */}
      {attivo
        ? <TitoloDecodifica testo="MAREMMA MUSICA" className="font-display text-[32px] font-black uppercase leading-none tracking-[.04em] text-osso" />
        : <span className="font-display text-[32px] font-black uppercase leading-none tracking-[.04em] text-osso">MAREMMA MUSICA</span>}
      <span className="mm-caricamento__barra" />
    </div>
  );
}
