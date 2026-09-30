import type { ReactNode } from 'react';

/** Testata delle pagine admin: briciole in mono, titolo display, azioni a destra. */
export function TestataAdmin({ briciole, titolo, chip, sotto, azioni }: { briciole: string; titolo: string; chip?: ReactNode; sotto?: ReactNode; azioni?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-linea px-4 pb-6 pt-6 md:flex-row md:items-end md:gap-6 md:px-12 md:pt-7">
      <div className="flex min-w-0 flex-grow flex-col gap-[10px]">
        <span className="font-mono text-[11px] leading-[14px] text-osso-2">{briciole}</span>
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2">
          <h1 className="m-0 font-display text-[44px] font-black uppercase leading-[.85] md:text-[64px]">{titolo}</h1>
          {chip}
        </div>
        {sotto && <span className="font-mono text-[12px] leading-4 text-osso-2">{sotto}</span>}
      </div>
      {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
    </div>
  );
}

export function Numero({ etichetta, valore, nota, colore, bordo }: { etichetta: string; valore: string; nota?: string; colore?: string; bordo?: boolean }) {
  return (
    <div className={`flex flex-col gap-[10px] px-4 py-5 md:px-7 md:py-6 ${bordo ? 'border-l border-linea' : ''}`}>
      <span className="text-[11px] font-semibold leading-[14px] tracking-etichetta text-osso-2">{etichetta.toUpperCase()}</span>
      <span className={`font-display text-[44px] font-black leading-[.85] md:text-[64px] ${colore ?? ''}`}>{valore}</span>
      <span className="font-mono text-[11px] leading-[14px] text-osso-3">{nota ?? ' '}</span>
    </div>
  );
}
