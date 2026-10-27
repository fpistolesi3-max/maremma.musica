'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Icona = 'porta' | 'serate' | 'pr' | 'iscrizioni' | 'staff';
export interface VoceArea { href: string; testo: string; icona: Icona }

const ICONE: Record<Icona, React.ReactNode> = {
  porta: <><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /><path d="M8 12h8" /></>,
  serate: <><rect x="4" y="5" width="16" height="15" rx="1" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  pr: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3 3 3 6" /></>,
  iscrizioni: <><path d="M5 4h14v16H5z" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
  staff: <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 3v18" /><circle cx="12.5" cy="12" r=".8" /></>,
};

/** Dove si trova la pagina: "PR" copre anche l'elenco dei PR dell'admin e i canali. */
function attiva(href: string, p: string) {
  if (href === '/admin') return p === '/admin' || p.startsWith('/admin/eventi');
  if (href === '/gestione/pr') return p.startsWith('/gestione') || p.startsWith('/admin/pr');
  return p.startsWith(href);
}

/** Voci dell'area riservata: barra laterale da desktop, barra in basso (a portata di pollice) su telefono. */
export function NavArea({ voci, variante }: { voci: VoceArea[]; variante: 'lato' | 'basso' }) {
  const p = usePathname();
  if (variante === 'lato') {
    return (
      <nav aria-label="Area riservata" className="flex flex-col gap-1">
        {voci.map((v) => {
          const a = attiva(v.href, p);
          return (
            <Link key={v.href} href={v.href} aria-current={a ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-sm px-3 py-[10px] text-[13px] font-semibold uppercase tracking-[.12em] no-underline ${a ? 'bg-notte-3 text-osso' : v.icona === 'porta' ? 'text-arancio' : 'text-osso-2 hover:text-osso'}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={a || v.icona === 'porta' ? 'var(--arancio)' : 'currentColor'} strokeWidth="1.6" aria-hidden="true">{ICONE[v.icona]}</svg>
              {v.testo}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="Area riservata" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-linea bg-vinile md:hidden"
      style={{ gridTemplateColumns: `repeat(${voci.length}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {voci.map((v) => {
        const a = attiva(v.href, p);
        return (
          <Link key={v.href} href={v.href} aria-current={a ? 'page' : undefined}
            className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[.08em] no-underline ${a ? 'bg-notte-3 text-osso' : v.icona === 'porta' ? 'text-arancio' : 'text-osso-2'}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a || v.icona === 'porta' ? 'var(--arancio)' : 'currentColor'} strokeWidth="1.6" aria-hidden="true">{ICONE[v.icona]}</svg>
            {v.testo}
          </Link>
        );
      })}
    </nav>
  );
}
