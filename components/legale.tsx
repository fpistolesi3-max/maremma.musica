import type { ReactNode } from 'react';

/** Guscio delle pagine legali: testo minimo, da far rivedere a un consulente. */
export function PaginaLegale({ titolo, aggiornata, children }: { titolo: string; aggiornata: string; children: ReactNode }) {
  return (
    <article className="contenitore flex flex-col pb-16 pt-8 md:pb-24 md:pt-14" style={{ maxWidth: 820 }}>
      <span className="font-mono text-[11px] tracking-[.06em] text-arancio">✦ LEGALE · AGGIORNATA IL {aggiornata}</span>
      <h1 className="m-0 mt-4 font-display text-[56px] font-black uppercase leading-[.86] md:text-[88px]">{titolo}</h1>
      <p className="mt-6 border border-attesa px-4 py-3 text-[14px] leading-5 text-attesa">
        Testo di base per l&apos;MVP. TODO: cliente — da completare con ragione sociale e far rivedere a un consulente prima del lancio.
      </p>
      <div className="testo-legale">{children}</div>
    </article>
  );
}
