import type { ReactNode } from 'react';

/** Testata delle pagine admin: briciole in mono, titolo display, azioni a destra. */
export function TestataAdmin({ briciole, titolo, chip, sotto, azioni }: { briciole: string; titolo: string; chip?: ReactNode; sotto?: ReactNode; azioni?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-linea px-4 pb-6 pt-6 md:flex-row md:items-end md:gap-6 md:px-12 md:pt-7">
      <div className="flex min-w-0 flex-grow flex-col gap-[10px]">
        {/* Niente briciola che ripete il titolo ("SERATE / Serate"). */}
        {briciole.trim().toLowerCase() !== titolo.trim().toLowerCase() && <span className="font-mono text-[11px] leading-[14px] text-osso-2">{briciole}</span>}
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

const SUMMARY = 'flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden';
const FRECCIA = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="flex-none text-osso-2 group-open:rotate-180"><path d="M5 9l7 7 7-7" /></svg>;

/** Filtri richiudibili: chiusi mostrano solo il riepilogo di quelli attivi e "Azzera". */
export function Filtri({ attivi, azzera, children }: { attivi: string[]; azzera: string; children: ReactNode }) {
  return (
    <details className="group border border-linea bg-notte-2 px-4" open={false}>
      <summary className={SUMMARY}>
        <span className="text-[11px] font-semibold tracking-etichetta text-osso-2">FILTRI</span>
        <span className="min-w-0 flex-grow truncate font-mono text-[12px] text-osso">{attivi.length ? attivi.join(' · ') : 'Nessun filtro'}</span>
        {attivi.length > 0 && <a href={azzera} className="link-sottolineato flex-none py-2 text-[12px]">Azzera</a>}
        {FRECCIA}
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/** Modulo che si apre solo quando serve (es. "Aggiungi PR"): la pagina parte dall'elenco. */
export function Apribile({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <details className="group border border-linea bg-notte-2 px-4">
      <summary className={SUMMARY}>
        <span className="flex-grow text-[13px] font-semibold uppercase tracking-etichetta text-osso">{titolo}</span>
        {FRECCIA}
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/** Azioni secondarie di una pagina in un menu "Altro" (i link figli diventano voci). */
export function MenuAltro({ children }: { children: ReactNode }) {
  return (
    <details className="group relative">
      <summary className="mm-btn mm-btn--muto cursor-pointer list-none [&::-webkit-details-marker]:hidden">Altro</summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-[220px] flex-col border border-linea-forte bg-notte-2 [&>a]:px-4 [&>a]:py-3 [&>a]:text-[15px] [&>a]:text-osso [&>a]:no-underline [&>a:hover]:bg-notte">{children}</div>
    </details>
  );
}
