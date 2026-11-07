'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Linguette } from '@/components/admin/linguette';

/** Schede dell'area PR dell'admin: i PR e i canali senza PR. La serata scelta resta quando si cambia scheda. */
export function NavPr() {
  const p = usePathname();
  const serata = useSearchParams().get('serata');
  const q = serata ? `?serata=${encodeURIComponent(serata)}` : '';
  return (
    <Linguette etichetta="PR e canali" voci={[
      { href: `/admin/pr${q}`, testo: 'PR', attiva: p === '/admin/pr' || (p.startsWith('/admin/pr/') && !p.startsWith('/admin/pr/canali')) },
      { href: `/admin/pr/canali${q}`, testo: 'Social e sito', attiva: p.startsWith('/admin/pr/canali') },
    ]} />
  );
}
