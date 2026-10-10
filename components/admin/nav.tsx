'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const VOCI = [
  { href: '/admin', testo: 'Serate', icona: <><rect x="4" y="5" width="16" height="15" rx="1" /><path d="M4 10h16M9 3v4M15 3v4" /></> },
  { href: '/admin/pr', testo: 'PR', icona: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3 3 3 6" /></> },
  { href: '/gestione/pr', testo: 'Attività PR', icona: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></> },
  { href: '/admin/iscrizioni', testo: 'Iscrizioni', icona: <><path d="M5 4h14v16H5z" /><path d="M9 9h6M9 13h6M9 17h3" /></> },
  { href: '/admin/staff', testo: 'Staff porta', icona: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 3v18" /><circle cx="12.5" cy="12" r=".8" /></> },
  { href: '/door', testo: 'Apri scanner', icona: <><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /><path d="M8 12h8" /></> },
];

export function NavAdmin() {
  const p = usePathname();
  const ref = useRef<HTMLElement>(null);
  // Su telefono la barra scorre in orizzontale: la voce attiva resta in vista e, con il mouse,
  // la rotella (che scorre solo in verticale) la fa scorrere di lato.
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    nav.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    const rotella = (e: WheelEvent) => {
      if (nav.scrollWidth <= nav.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      nav.scrollLeft += e.deltaY;
    };
    nav.addEventListener('wheel', rotella, { passive: false });
    return () => nav.removeEventListener('wheel', rotella);
  }, [p]);
  return (
    <nav ref={ref} aria-label="Admin" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
      {VOCI.map((v) => {
        const attiva = v.href === '/admin' ? p === '/admin' || p.startsWith('/admin/eventi') : p.startsWith(v.href);
        return (
          <Link key={v.href} href={v.href} aria-current={attiva ? 'page' : undefined}
            className={`flex flex-none items-center gap-3 whitespace-nowrap rounded-sm px-3 py-[10px] text-[13px] font-semibold uppercase tracking-[.12em] no-underline ${attiva ? 'bg-notte-3 text-osso' : 'text-osso-2 hover:text-osso'}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={attiva ? 'var(--arancio)' : 'currentColor'} strokeWidth="1.6" aria-hidden="true">{v.icona}</svg>
            {v.testo}
          </Link>
        );
      })}
    </nav>
  );
}
