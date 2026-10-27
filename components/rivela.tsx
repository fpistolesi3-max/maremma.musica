'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Entrata allo scroll: maschera dal basso, scaglionata con `indice`.
 * Se l'elemento è già in vista al caricamento, o il movimento è ridotto, non si nasconde mai.
 */
export function Rivela({ children, indice = 0, className = '' }: { children: ReactNode; indice?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('mm-rivela--prima');
    const io = new IntersectionObserver(([v]) => {
      if (!v.isIntersecting) return;
      el.classList.remove('mm-rivela--prima');
      io.disconnect();
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => { io.disconnect(); el.classList.remove('mm-rivela--prima'); };
  }, []);

  return <div ref={ref} className={`mm-rivela ${className}`} style={{ '--i': indice } as CSSProperties}>{children}</div>;
}
