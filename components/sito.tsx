import Link from 'next/link';
import { MenuTelefono } from './client';
import { MarchioLink } from './ui';

// Testata e piede del sito pubblico (mockup Home desktop / telefono).

const VOCI = [
  { href: '/eventi', testo: 'Date' },
  { href: '/eventi#archivio', testo: 'Serate passate' },
  { href: '/chi-siamo', testo: 'Crew' },
  { href: '/galleria', testo: 'Galleria' },
];

export function Testata() {
  return (
    <header className="relative z-30 border-b border-linea bg-notte">
      <div className="contenitore flex h-16 items-center gap-3 md:h-24 md:gap-12">
        <div className="flex-grow md:flex-grow-0"><MarchioLink /></div>
        <nav aria-label="Principale" className="hidden flex-grow justify-center gap-9 md:flex">
          {VOCI.map((v) => (
            <Link key={v.href} href={v.href} className="font-sans text-[13px] font-semibold uppercase leading-none tracking-etichetta text-osso-2 no-underline hover:text-osso">
              {v.testo}
            </Link>
          ))}
        </nav>
        <Link href="/biglietto" className="px-[6px] py-[14px] font-sans text-[12px] font-semibold uppercase leading-none tracking-[.12em] no-underline md:hidden">Il mio QR</Link>
        <Link href="/biglietto" className="mm-btn mm-btn--linea hidden md:inline-flex" style={{ minHeight: 40, padding: '0 18px', fontSize: 13 }}>Il mio QR</Link>
        {/* Menu telefono: <details>, si apre anche senza JavaScript (browser di Instagram) */}
        <MenuTelefono className="group md:hidden">
          <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-sm border border-linea-forte text-osso [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
          </summary>
          <nav aria-label="Menu" className="absolute inset-x-0 top-16 border-b border-linea bg-notte px-4 pb-6 pt-2">
            {[...VOCI, { href: '/biglietto', testo: 'Il mio QR' }, { href: '/accedi', testo: 'Area PR e staff' }].map((v) => (
              <Link key={v.href} href={v.href} className="block border-b border-linea py-4 font-display text-[28px] font-extrabold uppercase leading-none no-underline">
                {v.testo}
              </Link>
            ))}
          </nav>
        </MenuTelefono>
      </div>
    </header>
  );
}

export function Piede() {
  return (
    <footer id="contatti" className="border-t border-linea bg-vinile">
      <div className="contenitore flex flex-col gap-9 pb-8 pt-12 md:gap-16 md:pb-12 md:pt-[72px]">
        <div className="flex flex-col gap-9 md:flex-row md:gap-20">
          <p className="m-0 flex-grow font-display text-[52px] font-black uppercase leading-[.86] md:text-[72px]">Ci vediamo<br />sotto cassa.</p>
          <div className="flex flex-col gap-[10px] md:w-[260px] md:gap-[14px]">
            <span className="etichetta">Contatti</span>
            <a href="mailto:maremmamusica@gmail.com" className="font-mono text-[13px] leading-5 no-underline md:text-[14px]">maremmamusica@gmail.com</a>
            <a href="https://www.instagram.com/maremma.musica/" className="font-mono text-[13px] leading-5 no-underline md:text-[14px]">Instagram @maremma.musica</a>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:contents">
            <div className="contents md:flex md:w-[180px] md:flex-col md:gap-[14px]">
              <span className="etichetta hidden md:block">Sito</span>
              <Link href="/biglietto" className="py-[10px] font-sans text-[16px] font-medium leading-[22px] no-underline md:py-0">Il mio QR</Link>
              <Link href="/accedi?dopo=/pr" className="py-[10px] font-sans text-[16px] font-medium leading-[22px] no-underline md:py-0">Area PR</Link>
              <Link href="/door" className="py-[10px] font-sans text-[16px] font-medium leading-[22px] no-underline md:py-0">Staff porta</Link>
            </div>
            <div className="contents md:flex md:w-[180px] md:flex-col md:gap-[14px]">
              <span className="etichetta hidden md:block">Legale</span>
              <Link href="/privacy" className="py-[10px] font-sans text-[16px] font-medium leading-[22px] no-underline md:py-0">Privacy</Link>
              <Link href="/cookie" className="py-[10px] font-sans text-[16px] font-medium leading-[22px] no-underline md:py-0">Cookie</Link>
              <Link href="/condizioni" className="py-[10px] font-sans text-[16px] font-medium leading-[22px] no-underline md:py-0">Termini della lista</Link>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-2 border-t border-linea pt-6 font-mono text-[10px] leading-[14px] tracking-[.04em] text-osso-3 md:flex-row md:text-[11px]">
          {/* TODO: cliente — ragione sociale e partita IVA */}
          <span>© 2026 MAREMMA MUSICA · [RAGIONE SOCIALE · P.IVA]</span>
          <span>MAREMMA, TOSCANA · 42.76°N 11.11°E</span>
        </div>
      </div>
    </footer>
  );
}
