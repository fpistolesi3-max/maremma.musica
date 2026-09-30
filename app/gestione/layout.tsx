import type { Metadata } from 'next';
import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { esci } from '@/app/azioni/accesso';
import { Monogramma } from '@/components/ui';
import { NavGestione } from '@/components/gestione-nav';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'Gestione', template: '%s · Gestione Maremma Musica' }, robots: { index: false } };

/** Area gestionale condivisa da admin e staff porta (i PR non entrano). */
export default async function LayoutGestione({ children }: { children: React.ReactNode }) {
  const s = await richiedi(['admin', 'staff'], '/gestione/pr');
  const admin = s.utente.ruolo === 'admin';
  return (
    <div className="mm-grana flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex h-16 flex-none items-center gap-3 border-b border-linea bg-vinile px-4 md:px-10">
        <Link href="/" aria-label="Sito pubblico"><Monogramma /></Link>
        <div className="flex min-w-0 flex-grow flex-col gap-[5px]">
          <span className="text-[11px] font-semibold leading-none tracking-[.22em]">GESTIONE</span>
          <span className="font-mono text-[10px] leading-none text-arancio">{admin ? 'ADMIN' : 'STAFF'}<span className="hidden sm:inline"> · {s.utente.email}</span></span>
        </div>
        <Link href={admin ? '/admin' : '/door'} className="mm-btn mm-btn--muto whitespace-nowrap" style={{ minHeight: 40 }}>{admin ? '← Admin' : '← Porta'}</Link>
        <form action={esci} className="hidden sm:block"><button type="submit" className="mm-btn mm-btn--muto" style={{ minHeight: 40 }}>Esci</button></form>
      </header>
      <Suspense><NavGestione /></Suspense>
      <main className="flex-grow">{children}</main>
    </div>
  );
}
