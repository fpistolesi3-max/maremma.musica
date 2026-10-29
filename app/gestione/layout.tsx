import type { Metadata } from 'next';
import { richiedi } from '@/lib/sessione';
import { GuscioArea } from '@/components/area/guscio';
import { NavGestione } from '@/components/gestione-nav';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'PR', template: '%s · Maremma Musica' }, robots: { index: false } };

/** Attività dei PR e canali: solo admin (staff e PR tornano alla propria area), nello stesso guscio dell'admin. */
export default async function LayoutGestione({ children }: { children: React.ReactNode }) {
  const s = await richiedi(['admin'], '/gestione/pr');
  return (
    <GuscioArea ruolo={s.utente.ruolo} email={s.utente.email}>
      <Suspense><NavGestione admin={s.utente.ruolo === 'admin'} /></Suspense>
      {children}
    </GuscioArea>
  );
}
