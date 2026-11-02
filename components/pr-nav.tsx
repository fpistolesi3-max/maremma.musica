'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/** Schede dell'area PR dell'admin: i PR e i canali senza PR. La serata scelta resta quando si cambia scheda. */
export function NavPr() {
  const p = usePathname();
  const serata = useSearchParams().get('serata');
  const q = serata ? `?serata=${encodeURIComponent(serata)}` : '';
  const voci = [
    { href: '/admin/pr', testo: 'PR', attiva: p === '/admin/pr' || (p.startsWith('/admin/pr/') && !p.startsWith('/admin/pr/canali')) },
    { href: '/admin/pr/canali', testo: 'Canali', attiva: p.startsWith('/admin/pr/canali') },
  ];
  return (
    <nav aria-label="PR e canali" className="flex gap-1 border-b border-linea px-4 md:px-12">
      {voci.map((v) => (
        <Link key={v.href} href={`${v.href}${q}`} aria-current={v.attiva ? 'page' : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold uppercase tracking-[.12em] no-underline ${v.attiva ? 'border-arancio text-osso' : 'border-transparent text-osso-2 hover:text-osso'}`}>
          {v.testo}
        </Link>
      ))}
    </nav>
  );
}
