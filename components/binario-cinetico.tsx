'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Binario del Nastro: scorre da solo, accelera e si inclina con la velocità dello scroll.
 * Sostituisce l'animazione CSS solo quando JS è attivo e il movimento è consentito.
 */
export function BinarioCinetico({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.style.animation = 'none';
    let x = 0, vel = 0, sy = window.scrollY, ultimo = performance.now(), raf = 0, metà = el.scrollWidth / 2;
    let pausa = false;
    const base = 55; // px al secondo
    const passo = (ora: number) => {
      const dt = Math.min(0.05, (ora - ultimo) / 1000);
      ultimo = ora;
      const y = window.scrollY;
      vel = vel * 0.88 + (y - sy) * 0.12; // px/frame smussati
      sy = y;
      const v = pausa ? 0 : base + vel * 60;
      x -= v * dt;
      if (x <= -metà) x += metà;
      if (x > 0) x -= metà;
      const skew = Math.max(-12, Math.min(12, vel * -0.6));
      el.style.transform = `translate3d(${x.toFixed(1)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
      raf = requestAnimationFrame(passo);
    };
    const avvia = () => { if (!raf) { ultimo = performance.now(); sy = window.scrollY; raf = requestAnimationFrame(passo); } };
    const ferma = () => { cancelAnimationFrame(raf); raf = 0; };
    const io = new IntersectionObserver(([v]) => (v.isIntersecting ? avvia() : ferma()));
    io.observe(el);
    const nav = el.parentElement;
    const su = () => { pausa = true; }, giu = () => { pausa = false; };
    nav?.addEventListener('pointerenter', su);
    nav?.addEventListener('pointerleave', giu);
    nav?.addEventListener('focusin', su);
    nav?.addEventListener('focusout', giu);
    const ro = new ResizeObserver(() => { metà = el.scrollWidth / 2; });
    ro.observe(el);
    return () => {
      ferma(); io.disconnect(); ro.disconnect();
      nav?.removeEventListener('pointerenter', su); nav?.removeEventListener('pointerleave', giu);
      nav?.removeEventListener('focusin', su); nav?.removeEventListener('focusout', giu);
      el.style.animation = ''; el.style.transform = '';
    };
  }, []);

  return <div ref={ref} className="mm-nastro__binario">{children}</div>;
}
