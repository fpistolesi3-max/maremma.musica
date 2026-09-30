import type { Metadata } from 'next';
import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { esci } from '@/app/azioni/accesso';
import { Monogramma } from '@/components/ui';
import { NavAdmin } from '@/components/admin/nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin Maremma Musica' }, robots: { index: false } };

/** Guscio dell'area admin (mockup Admin): barra laterale da desktop, barra in alto su telefono. */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const s = await richiedi(['admin'], '/admin');
  return (
    <div className="mm-grana flex min-h-dvh flex-col md:flex-row">
      <aside className="flex flex-none flex-col gap-4 border-b border-linea bg-vinile px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-[240px] md:gap-8 md:border-b-0 md:border-r md:px-3 md:py-7">
        <div className="flex items-center gap-3 md:px-3">
          <Link href="/" aria-label="Sito pubblico"><Monogramma className="h-[34px] w-[32px]" /></Link>
          <div className="flex flex-grow flex-col gap-[5px]">
            <span className="text-[11px] font-semibold leading-none tracking-[.22em]">MAREMMA MUSICA</span>
            <span className="font-mono text-[10px] leading-none text-arancio">ADMIN</span>
          </div>
          <form action={esci} className="md:hidden"><button type="submit" className="mm-btn mm-btn--muto" style={{ minHeight: 40 }}>Esci</button></form>
        </div>
        <NavAdmin />
        <div className="hidden flex-grow md:block" />
        <div className="hidden flex-col gap-[6px] border-t border-linea px-3 pt-4 md:flex">
          <span className="font-mono text-[11px] leading-[14px] text-osso-2">{s.utente.email}</span>
          <form action={esci}><button type="submit" className="border-0 bg-transparent p-0 py-2 text-[12px] font-semibold tracking-[.12em] text-osso-2 hover:text-osso">ESCI</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-grow">{children}</main>
    </div>
  );
}
