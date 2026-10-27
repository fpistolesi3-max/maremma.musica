import Link from 'next/link';
import type { ReactNode } from 'react';
import type { StatoIscrizione } from '@/lib/dati/tipi';

// Piccoli pezzi del Design System usati ovunque.

export function Monogramma({ className = 'h-[30px] w-[28px]' }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/img/monogramma.svg" alt="" className={className} />;
}

export function MarchioLink({ piccolo = false }: { piccolo?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-[10px] no-underline md:gap-[14px]" aria-label="Maremma Musica, home">
      <Monogramma className={piccolo ? 'h-[30px] w-[28px]' : 'h-[30px] w-[28px] md:h-[36px] md:w-[34px]'} />
      <span className="font-sans text-[11px] font-semibold leading-none tracking-logo text-osso md:text-[13px] md:tracking-[.26em]">MAREMMA MUSICA</span>
    </Link>
  );
}

export function Stella() {
  return <span aria-hidden="true">✦</span>;
}

export function Freccia() {
  return <span className="mm-btn__freccia" aria-hidden="true">→</span>;
}

export function IconaIndietro() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
  );
}

export function Lucchetto() {
  return (
    <svg className="mm-lista__lucchetto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Il campo "Lista" bloccato (ListField del DS). */
export function CampoLista({ nome, ufficiale, nota }: { nome: string; ufficiale: boolean; nota?: string }) {
  return (
    <div className={ufficiale ? 'mm-lista mm-lista--ufficiale' : 'mm-lista'} role="group" aria-label={`Lista: ${nome}`}>
      <span className="mm-lista__etichetta">Lista</span>
      <span className="mm-lista__nome">{nome}</span>
      <Lucchetto />
      {nota && <span className="mm-lista__nota">{nota}</span>}
    </div>
  );
}

const CHIP_ISCRIZIONE: Record<StatoIscrizione, { classe: string; testo: string }> = {
  in_attesa: { classe: 'mm-chip mm-chip--incassare', testo: 'Non pagato' },
  scaduta: { classe: 'mm-chip mm-chip--annullato', testo: 'Scaduta' },
  in_lista: { classe: 'mm-chip mm-chip--lista', testo: 'In lista' },
  pagato: { classe: 'mm-chip mm-chip--pagato', testo: 'Pagato' },
  entrato: { classe: 'mm-chip mm-chip--entrato', testo: 'Entrato' },
  annullato: { classe: 'mm-chip mm-chip--annullato', testo: 'Annullato' },
  rimborsato: { classe: 'mm-chip mm-chip--annullato', testo: 'Rimborsato' },
};

export function ChipIscrizione({ stato, testo }: { stato: StatoIscrizione; testo?: string }) {
  const c = CHIP_ISCRIZIONE[stato];
  return <span className={c.classe}>{testo ?? c.testo}</span>;
}

export function Chip({ classe, children }: { classe: string; children: ReactNode }) {
  return <span className={classe}>{children}</span>;
}

/** Il disco con solchi, etichetta e foro (motivo del logo). */
export function Disco({ className = '', etichetta, piccolo = false }: { className?: string; etichetta?: [string, string]; piccolo?: boolean }) {
  return (
    <div className={`mm-disco ${className}`} aria-hidden="true" style={piccolo ? { boxShadow: 'none' } : undefined}>
      {etichetta && (
        <div className="mm-disco__etichetta" style={{ fontSize: 'clamp(7px, 1.6vw, 10px)' }}>
          <span dangerouslySetInnerHTML={{ __html: etichetta[0] }} />
          <span dangerouslySetInnerHTML={{ __html: etichetta[1] }} />
        </div>
      )}
      <div className="mm-disco__foro" />
    </div>
  );
}

/** Segnaposto quando manca la locandina. */
export function LocandinaInArrivo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-[10px] bg-notte-3 md:gap-[14px] ${className}`}>
      <Disco className="h-[44px] w-[44px] md:h-[64px] md:w-[64px]" piccolo />
      <span className="text-center font-mono text-[8px] leading-[11px] text-osso-2 md:text-[9px] md:leading-[12px]">LOCANDINA<br />IN ARRIVO</span>
    </div>
  );
}

export function Etichetta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`etichetta ${className}`}>{children}</span>;
}
