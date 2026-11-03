'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Entrata allo scroll: maschera dal basso, scaglionata con `indice`.
 * Se l'elemento è già in vista al caricamento, o il movimento è ridotto, non si nasconde mai.
 * `className` va sul guscio (per esempio il posto nella griglia), `interno` sulla parte che si scopre (per esempio `h-full`).
 */
export function Rivela({ children, indice = 0, className = '', interno = '' }: { children: ReactNode; indice?: number; className?: string; interno?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const dentro = inner.current;
    if (!el || !dentro || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    dentro.classList.add('mm-rivela--prima');
    const io = new IntersectionObserver(([v]) => {
      if (!v.isIntersecting) return;
      dentro.classList.remove('mm-rivela--prima');
      io.disconnect();
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => { io.disconnect(); dentro.classList.remove('mm-rivela--prima'); };
  }, []);

  // l'osservato è il guscio esterno: il clip-path dell'interno lo renderebbe "invisibile" all'observer
  return <div ref={ref} className={className}><div ref={inner} className={`mm-rivela ${interno}`} style={{ '--i': indice } as CSSProperties}>{children}</div></div>;
}
