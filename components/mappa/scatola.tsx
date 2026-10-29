import { ALTEZZA, LARGHEZZA } from '@/lib/cartina';

/** Il riquadro comune alle tre proposte: stessa forma e stessa grana, così si confrontano alla pari. */
export function Scatola({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mm-grana mm-cq relative w-full overflow-hidden border border-linea bg-[#0b1824] ${className}`} style={{ aspectRatio: `${LARGHEZZA} / ${ALTEZZA}` }}>
      {children}
    </div>
  );
}

/**
 * L'etichetta arancio del sito: nome della serata, data e luogo. Lo stelo tocca il punto: `ancora` è dove cade lungo la larghezza
 * (50 = al centro; meno o più per le serate vicine ai bordi), `giu` mette l'etichetta sotto il punto invece che sopra.
 */
export function EtichettaSerata({ titolo, sotto, ancora = 50, giu = false, className = '' }: { titolo: string; sotto: string; ancora?: number; giu?: boolean; className?: string }) {
  return (
    <div className={`pointer-events-none absolute z-10 flex ${giu ? 'flex-col-reverse' : 'flex-col'} ${className}`} style={{ transform: `translateX(-${ancora}%)` }}>
      <div className="max-w-[290px] bg-arancio px-[10px] py-[6px] text-su-arancio">
        <div className="cq-et-titolo truncate font-display font-black uppercase leading-[.95]">{titolo}</div>
        <div className="cq-et-sotto truncate pt-[3px] font-mono leading-[12px]">{sotto}</div>
      </div>
      <div className="h-3 w-px bg-arancio" style={{ marginLeft: `${ancora}%` }} />
    </div>
  );
}

/** Il punto della serata, con un anello che pulsa piano (fermo con "riduci movimento"). */
export function PuntoSerata() {
  return (
    <span className="relative block h-[14px] w-[14px]">
      <span className="absolute inset-0 rounded-full bg-[rgba(213,91,35,.4)] motion-safe:animate-ping" />
      <span className="absolute inset-[2px] rounded-full border-2 border-notte bg-arancio" />
    </span>
  );
}
