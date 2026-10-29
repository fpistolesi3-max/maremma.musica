'use client';

import { useEffect, useState } from 'react';
import { linkNavigatori, usaAppleMaps, type Navigatore } from '@/lib/mappa';

type Luogo = { lat: number | null; lng: number | null; location: string | null; comune: string | null };

/** Piccoli segni per riconoscere l'app a colpo d'occhio (non sono i loghi ufficiali): pin, freccia, fumetto. */
function Segno({ app }: { app: Navigatore['app'] }) {
  const comune = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (app === 'google') return <svg {...comune}><path d="M12 22s7-6.6 7-12.2A7 7 0 0 0 5 9.8C5 15.4 12 22 12 22Z" /><circle cx="12" cy="9.8" r="2.6" /></svg>;
  if (app === 'apple') return <svg {...comune}><path d="M20 4 3.5 11l7 2.5L13 20.5Z" /></svg>;
  return <svg {...comune}><path d="M4.5 14.5c-1-1.6-1.3-3.2-1-4.8C4.3 5.6 8 3 12.2 3c4.6 0 8.3 3.4 8.3 7.6 0 4.1-3.6 7.4-8.1 7.4H9.5l-3 2v-3.2" /><circle cx="9.5" cy="10.5" r=".6" fill="currentColor" /><circle cx="14.5" cy="10.5" r=".6" fill="currentColor" /></svg>;
}

/**
 * Le indicazioni, fuori dalla mappa: "Apri in Google Maps / Apple Maps / Waze". Su iPhone e iPad Apple Maps viene prima.
 * Con le coordinate portano al punto esatto, senza cercano per nome; con la location segreta o senza niente da cercare non compaiono.
 */
export function Navigatori({ d, visibile, className = '' }: { d: Luogo; visibile: boolean; className?: string }) {
  const [apple, setApple] = useState(false);
  useEffect(() => setApple(usaAppleMaps(navigator.userAgent, navigator.maxTouchPoints)), []);
  const lista = linkNavigatori(d, apple, visibile);
  if (!lista.length) return null;
  return (
    <nav aria-label="Indicazioni stradali" className={`grid grid-cols-1 gap-2 sm:grid-cols-3 ${className}`}>
      {lista.map((n) => (
        <a
          key={n.app}
          href={n.href}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-h-[56px] items-center gap-3 border border-linea-forte bg-notte-2 px-4 py-[10px] text-osso no-underline transition-colors hover:border-arancio focus-visible:border-arancio sm:min-h-[68px] sm:px-3"
        >
          <span className="flex-none text-osso-2 group-hover:text-arancio"><Segno app={n.app} /></span>
          <span className="flex min-w-0 flex-grow flex-col">
            <span className="font-mono text-[9px] uppercase leading-[12px] tracking-[.08em] text-osso-3">Apri in</span>
            <span className="whitespace-nowrap font-display text-[20px] font-black uppercase leading-[1] sm:text-[18px]">{n.nome}</span>
          </span>
          <span aria-hidden="true" className="flex-none font-mono text-[13px] text-osso-3 group-hover:text-arancio sm:hidden">↗</span>
        </a>
      ))}
    </nav>
  );
}
