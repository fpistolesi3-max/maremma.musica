'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Dà vita a locandina e disco dell'hero tramite variabili CSS sul contenitore
 * (--rx, --ry, --giro): nessuna libreria, un solo rAF, attivo solo quando è in vista.
 * - desktop: la locandina si inclina in prospettiva seguendo il cursore
 * - telefono: leggera inclinazione legata allo scroll
 * - il disco gira piano, accelera con lo scroll e poi rallenta
 */
export function CopertinaViva({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fine = window.matchMedia('(pointer: fine)').matches;

    let visibile = false;
    let raf = 0;
    let ultimo = performance.now();
    let giro = 0;
    let vel = 8; // gradi al secondo
    let rx = 0, ry = 0, tx = 0, ty = 0;
    let sy = window.scrollY, dsc = 0;

    const passo = (ora: number) => {
      const dt = Math.min(0.05, (ora - ultimo) / 1000);
      ultimo = ora;
      const y = window.scrollY;
      dsc = dsc * 0.85 + (y - sy) * 0.15; // velocità di scroll smussata (px/frame)
      sy = y;
      // disco: base lenta + spinta dallo scroll, poi torna alla base
      const obiettivo = 8 + Math.min(720, Math.abs(dsc) * 40);
      vel += (obiettivo - vel) * Math.min(1, dt * (obiettivo > vel ? 6 : 1.6));
      giro = (giro + vel * dt) % 360;
      if (!fine) { tx = Math.max(-1, Math.min(1, dsc / 25)) * 6; ty = Math.sin(y / 260) * 5; }
      rx += (tx - rx) * Math.min(1, dt * 8);
      ry += (ty - ry) * Math.min(1, dt * 8);
      el.style.setProperty('--giro', `${giro.toFixed(2)}deg`);
      el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      raf = requestAnimationFrame(passo);
    };

    const avvia = () => { if (!raf) { ultimo = performance.now(); raf = requestAnimationFrame(passo); } };
    const ferma = () => { cancelAnimationFrame(raf); raf = 0; };
    const io = new IntersectionObserver(([v]) => {
      visibile = v.isIntersecting && el.offsetParent !== null;
      visibile ? avvia() : ferma();
    });
    io.observe(el);

    const mossa = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (ev.clientX - r.left) / r.width - 0.5;
      const ny = (ev.clientY - r.top) / r.height - 0.5;
      ty = Math.max(-1, Math.min(1, nx)) * 12;
      tx = Math.max(-1, Math.min(1, -ny)) * 9;
    };
    const esce = () => { tx = ty = 0; };
    if (fine) {
      window.addEventListener('pointermove', mossa, { passive: true });
      document.documentElement.addEventListener('pointerleave', esce);
    }
    return () => {
      ferma();
      io.disconnect();
      window.removeEventListener('pointermove', mossa);
      document.documentElement.removeEventListener('pointerleave', esce);
    };
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
