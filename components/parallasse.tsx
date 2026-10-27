'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Voce = { tile: HTMLElement; strato: HTMLElement; vel: number };
const voci = new Set<Voce>();
let attivo = false;
let raf = 0;

// Un solo ascoltatore di scroll per tutta la pagina, che muove solo i tile in vista.
function aggiorna() {
  raf = 0;
  const vh = window.innerHeight;
  voci.forEach(({ tile, strato, vel }) => {
    const r = tile.getBoundingClientRect();
    if (r.bottom < -50 || r.top > vh + 50) return;
    const max = r.height * 0.1;
    const d = Math.max(-max, Math.min(max, (r.top + r.height / 2 - vh / 2) * vel));
    strato.style.transform = `translate3d(0,${d.toFixed(1)}px,0)`;
  });
}
const sulloScroll = () => { if (!raf) raf = requestAnimationFrame(aggiorna); };

/** Tile con parallasse a strati: il contenuto scorre un po' più piano (o più veloce) del resto della pagina. */
export function Parallasse({ children, className = '', velocita = 0.1 }: { children: ReactNode; className?: string; velocita?: number }) {
  const tile = useRef<HTMLDivElement>(null);
  const strato = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tile.current || !strato.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const v: Voce = { tile: tile.current, strato: strato.current, vel: velocita };
    voci.add(v);
    if (!attivo) { attivo = true; window.addEventListener('scroll', sulloScroll, { passive: true }); window.addEventListener('resize', sulloScroll); }
    sulloScroll();
    return () => {
      voci.delete(v);
      v.strato.style.transform = '';
      if (!voci.size) { attivo = false; window.removeEventListener('scroll', sulloScroll); window.removeEventListener('resize', sulloScroll); }
    };
  }, [velocita]);

  return (
    <div ref={tile} className={`mm-parallasse relative overflow-hidden ${className}`}>
      <div ref={strato} className="mm-parallasse__strato">{children}</div>
    </div>
  );
}
