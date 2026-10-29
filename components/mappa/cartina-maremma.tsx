import { ALTEZZA, LAT_N, LAT_S, LARGHEZZA, LON_E, LON_O, LUOGHI, PAESI, proietta, rigaDistanze } from '@/lib/cartina';
import { etichettaMappa } from '@/lib/mappa';
import type { DatiMappa } from './tipi';
import { EtichettaSerata, PuntoSerata, Scatola } from './scatola';

const OMBRA = '[text-shadow:0_0_3px_#0b1824,0_0_7px_#0b1824]';
const pc = (v: number, tot: number) => `${((v / tot) * 100).toFixed(2)}%`;

// 20 km sulla carta, in percentuale della larghezza (1° di longitudine a questa latitudine ≈ 81,5 km)
const KM_PER_GRADO_LON = 111.32 * Math.cos((((LAT_N + LAT_S) / 2) * Math.PI) / 180);
const SCALA = Math.round((20 / KM_PER_GRADO_LON / (LON_E - LON_O)) * 1000) / 10; // arrotondata: i decimali lunghi sono scritti diversi da server e browser

/** Il riquadro della cartina illustrata (il pulsante lo aggiunge chi la usa, come `children`). */
export function CartinaMaremma({ d, children }: { d: DatiMappa; children?: React.ReactNode }) {
  const p = proietta(d.lat, d.lng);
  const x = (p.x / LARGHEZZA) * 100, y = (p.y / ALTEZZA) * 100;
  // L'etichetta sta sopra il punto; vicino ai bordi si sposta così non esce dal riquadro.
  const giu = y < 34;
  const ancora = x < 38 ? 20 : x > 62 ? 80 : 50;
  // Quello che finirebbe sotto l'etichetta della serata non si scrive (rettangolo largo come l'etichetta su telefono).
  const libero = (qx: number, qy: number) => !(Math.abs(qx - x) < 33 && (giu ? qy > y - 2 && qy < y + 23 : qy < y + 2 && qy > y - 23));

  return (
    <Scatola>
      <div role="img" aria-label={`${etichettaMappa(d)} · cartina della Maremma`} className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/cartina-maremma.svg" alt="" width={LARGHEZZA} height={ALTEZZA} draggable={false} className="absolute inset-0 h-full w-full select-none" />

        {LUOGHI.map((l) => {
          const q = proietta(l.lat, l.lng);
          if (!libero((q.x / LARGHEZZA) * 100, (q.y / ALTEZZA) * 100)) return null;
          const su = l.tipo === 'isola' || l.tipo === 'monte';
          return (
            <span key={l.nome} aria-hidden="true" className={`absolute -translate-x-1/2 ${su ? '-translate-y-[170%]' : '-translate-y-1/2'} ${l.peso === 1 ? '' : 'cq-largo-block'} cq-luogo whitespace-nowrap font-mono uppercase leading-none ${l.tipo === 'mare' ? 'tracking-[.5em] text-[#6f9cc0]' : 'tracking-[.12em] text-osso-2'} ${OMBRA}`} style={{ left: pc(q.x, LARGHEZZA), top: pc(q.y, ALTEZZA) }}>
              {l.tipo === 'monte' ? '▲ ' : ''}{l.nome}
            </span>
          );
        })}

        {PAESI.filter((t) => t.peso !== 3).map((t) => {
          const q = proietta(t.lat, t.lng);
          if (!libero((q.x / LARGHEZZA) * 100, (q.y / ALTEZZA) * 100)) return null;
          const sinistra = t.lato === 'l';
          return (
            <span key={t.nome} aria-hidden="true" className={`absolute -translate-y-1/2 items-center gap-[5px] cq-paese font-display font-bold uppercase leading-none tracking-[.08em] text-osso ${t.peso === 1 ? 'flex' : 'cq-largo-flex'} ${sinistra ? '-translate-x-full flex-row-reverse' : ''} ${OMBRA}`} style={{ left: `calc(${pc(q.x, LARGHEZZA)} ${sinistra ? '+' : '-'} 2px)`, top: pc(q.y, ALTEZZA) }}>
              <i className="h-[5px] w-[5px] flex-none rounded-full bg-osso" />
              <span className="cq-stretto">{t.corto ?? t.nome}</span><span className="cq-largo-inline">{t.nome}</span>
            </span>
          );
        })}

        <div className="pointer-events-none absolute" style={{ left: pc(p.x, LARGHEZZA), top: pc(p.y, ALTEZZA) }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2"><PuntoSerata /></div>
          <EtichettaSerata titolo={d.titolo} sotto={d.sotto} ancora={ancora} giu={giu} className={giu ? 'left-0 top-[10px]' : 'bottom-[10px] left-0'} />
        </div>

        {/* titolo da locandina sul bordo del mare, scala e nord */}
        <span aria-hidden="true" className={`pointer-events-none absolute bottom-7 left-2 rotate-180 cq-vert font-display font-black uppercase leading-[.8] text-[rgba(225,215,201,.14)] [writing-mode:vertical-rl]`}>Maremma</span>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-[10px] flex items-center gap-2 font-mono text-[8px] leading-none text-osso-2">
          <span className="block h-[5px] flex-none border-x border-b border-osso-2" style={{ width: `${SCALA}%` }} />20 KM
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[22px] right-3 flex flex-col items-center font-mono text-[9px] leading-none text-osso-2">
          <span>N</span><span className="mt-[2px] h-4 w-px bg-osso-2" />
        </div>
        <p className="absolute bottom-[3px] right-[6px] m-0 font-mono text-[9px] leading-[12px] text-[rgba(163,158,149,.75)] [text-shadow:0_0_3px_#0b1824]">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-[rgba(163,158,149,.75)]">© OpenStreetMap</a> · rilievo Mapzen
        </p>
      </div>
      {children}
    </Scatola>
  );
}

/** Riga con i tempi in auto stimati dalla distanza in linea d'aria. È una stima, e lo dice. */
export function RigaDistanze({ lat, lng, className = '' }: { lat: number; lng: number; className?: string }) {
  return (
    <p className={`m-0 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border border-t-0 border-linea bg-notte-2 px-3 py-[10px] font-mono text-[11px] leading-4 ${className}`}>
      <span className="text-osso">{rigaDistanze(lat, lng)}</span>
      <span className="text-[10px] text-osso-3">IN AUTO · STIMA DALLA LINEA D’ARIA</span>
    </p>
  );
}
