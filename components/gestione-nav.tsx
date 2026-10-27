'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/** Schede della sezione PR (attività, canali, account): la serata scelta resta quando si cambia scheda. */
export function NavGestione({ admin = false }: { admin?: boolean }) {
  const p = usePathname();
  const serata = useSearchParams().get('serata');
  const q = serata ? `?serata=${serata}` : '';
  const voci = [
    { href: '/gestione/pr', testo: 'Attività', senzaSerata: false },
    { href: '/gestione/canali', testo: 'Canali · senza PR', senzaSerata: false },
    ...(admin ? [{ href: '/admin/pr', testo: 'Account PR', senzaSerata: true }] : []),
  ];
  return (
    <nav aria-label="Gestione" className="flex gap-1 overflow-x-auto border-b border-linea px-4 md:px-10">
      {voci.map((v) => {
        const attiva = p.startsWith(v.href);
        return (
          <Link key={v.href} href={`${v.href}${v.senzaSerata ? '' : q}`} aria-current={attiva ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-semibold uppercase tracking-[.12em] no-underline ${attiva ? 'border-arancio text-osso' : 'border-transparent text-osso-2 hover:text-osso'}`}>
            {v.testo}
          </Link>
        );
      })}
    </nav>
  );
}
