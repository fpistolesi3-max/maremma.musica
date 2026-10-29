'use client';

import { useEffect, useState } from 'react';
import { linkIndicazioni, usaAppleMaps } from '@/lib/mappa';
import type { DatiMappa } from './tipi';

/** Pulsante "Indicazioni": Apple Maps su iOS, Google Maps altrove. */
export function Indicazioni({ d, className = '' }: { d: Pick<DatiMappa, 'lat' | 'lng' | 'location' | 'comune'>; className?: string }) {
  const [apple, setApple] = useState(false);
  useEffect(() => setApple(usaAppleMaps(navigator.userAgent, navigator.maxTouchPoints)), []);
  const href = linkIndicazioni(d, apple);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`border border-linea-forte bg-notte px-3 py-[10px] font-mono text-[11px] leading-[14px] text-osso no-underline hover:border-osso ${className}`}>
      Indicazioni →
    </a>
  );
}
