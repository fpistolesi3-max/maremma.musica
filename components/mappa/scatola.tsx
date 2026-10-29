import { ALTEZZA, LARGHEZZA } from '@/lib/cartina';
import type { Lato } from '@/lib/etichetta';

/** Il riquadro della mappa di "Come arrivare": stessa forma e stessa grana per la cartina e per la mappa vera. */
export function Scatola({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mm-grana mm-cq relative w-full overflow-hidden border border-linea bg-[#0b1824] ${className}`} style={{ aspectRatio: `${LARGHEZZA} / ${ALTEZZA}` }}>
      {children}
    </div>
  );
}

/**
 * L'etichetta arancio del sito: nome della serata, data e luogo, con lo stelo che tocca il punto (il punto è l'origine del contenitore che la ospita).
 * `lato` dice da che parte del punto sta e `ancora` dove cade il punto lungo l'etichetta (in %), come li sceglie `scegliLato`.
 */
export function EtichettaSerata({ titolo, sotto, lato = 'su', ancora = 50 }: { titolo: string; sotto: string; lato?: Lato; ancora?: number }) {
  const verticale = lato === 'su' || lato === 'giu';
  const stile: React.CSSProperties = verticale
    ? { left: 0, transform: `translateX(-${ancora}%)`, ...(lato === 'su' ? { bottom: 10, paddingBottom: 12 } : { top: 10, paddingTop: 12 }) }
    : { top: 0, transform: `translateY(-${ancora}%)`, ...(lato === 'dx' ? { left: 10, paddingLeft: 12 } : { right: 10, paddingRight: 12 }) };
  const stelo: React.CSSProperties = verticale
    ? { left: `${ancora}%`, width: 1, height: 12, ...(lato === 'su' ? { bottom: 0 } : { top: 0 }) }
    : { top: `${ancora}%`, height: 1, width: 12, ...(lato === 'dx' ? { left: 0 } : { right: 0 }) };
  return (
    <div className="cq-et pointer-events-none absolute z-10 w-max" style={stile}>
      <div className="bg-arancio px-[10px] py-[6px] text-su-arancio">
        <div className="cq-et-titolo truncate font-display font-black uppercase leading-[.95]">{titolo}</div>
        <div className="cq-et-sotto truncate pt-[3px] font-mono leading-[12px]">{sotto}</div>
      </div>
      <div className="absolute bg-arancio" style={stelo} />
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
