import Link from 'next/link';
import { esci } from '@/app/azioni/accesso';
import { Monogramma } from '@/components/ui';
import { NavArea, type VoceArea } from '@/components/area/nav';
import type { Ruolo } from '@/lib/dati/tipi';

/** Voci per ruolo. È solo la barra: l'accesso alle pagine lo controlla comunque `richiedi` e `lib/dati/*`. */
export function vociArea(ruolo: Ruolo): VoceArea[] {
  const staff: VoceArea[] = [
    { href: '/door', testo: 'Porta', icona: 'porta' },
    { href: '/gestione/pr', testo: 'PR', icona: 'pr' },
  ];
  if (ruolo !== 'admin') return staff;
  return [
    staff[0],
    { href: '/admin', testo: 'Serate', icona: 'serate' },
    staff[1],
    { href: '/admin/iscrizioni', testo: 'Iscrizioni', icona: 'iscrizioni' },
    { href: '/admin/staff', testo: 'Staff', icona: 'staff' },
  ];
}

/** Un solo guscio per admin e staff: stesse voci, stesso "Esci", "Porta" sempre a un tocco. */
export function GuscioArea({ ruolo, email, children }: { ruolo: Ruolo; email: string; children: React.ReactNode }) {
  const voci = vociArea(ruolo);
  const etichetta = ruolo === 'admin' ? 'ADMIN' : 'STAFF';
  const marchio = (
    <>
      <Link href="/" aria-label="Sito pubblico"><Monogramma className="h-[34px] w-[32px]" /></Link>
      <div className="flex flex-grow flex-col gap-[5px]">
        <span className="text-[11px] font-semibold leading-none tracking-[.22em]">MAREMMA MUSICA</span>
        <span className="font-mono text-[10px] leading-none text-arancio">{etichetta}</span>
      </div>
    </>
  );
  return (
    <div className="mm-grana flex min-h-dvh flex-col md:flex-row">
      <header className="flex flex-none items-center gap-3 border-b border-linea bg-vinile px-4 py-3 md:hidden">
        {marchio}
        <form action={esci}><button type="submit" className="mm-btn mm-btn--muto" style={{ minHeight: 40 }}>Esci</button></form>
      </header>
      <aside className="hidden flex-none flex-col gap-8 border-r border-linea bg-vinile px-3 py-7 md:sticky md:top-0 md:flex md:h-dvh md:w-[240px]">
        <div className="flex items-center gap-3 px-3">{marchio}</div>
        <NavArea voci={voci} variante="lato" />
        <div className="flex-grow" />
        <div className="flex flex-col gap-[6px] border-t border-linea px-3 pt-4">
          <span className="font-mono text-[11px] leading-[14px] text-osso-2">{email}</span>
          <form action={esci}><button type="submit" className="border-0 bg-transparent p-0 py-2 text-[12px] font-semibold tracking-[.12em] text-osso-2 hover:text-osso">ESCI</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-grow pb-[76px] md:pb-0">{children}</main>
      <NavArea voci={voci} variante="basso" />
    </div>
  );
}
