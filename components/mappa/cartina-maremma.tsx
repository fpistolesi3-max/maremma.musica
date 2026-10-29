import { ALTEZZA, LAT_N, LAT_S, LARGHEZZA, LON_E, LON_O, LUOGHI, PAESI, proietta, rigaDistanze } from '@/lib/cartina';
import { misuraEtichetta, rettNome, rettPulsanti, scegliLato, sovrapposizione, type Rett } from '@/lib/etichetta';
import { etichettaMappa } from '@/lib/mappa';
import type { DatiMappa } from './tipi';
import { EtichettaSerata, PuntoSerata, Scatola } from './scatola';

const OMBRA = '[text-shadow:0_0_3px_#0b1824,0_0_7px_#0b1824]';
const pc = (v: number, tot: number) => `${((v / tot) * 100).toFixed(2)}%`;

// 20 km sulla carta, in percentuale della larghezza (1° di longitudine a questa latitudine ≈ 81,5 km)
const KM_PER_GRADO_LON = 111.32 * Math.cos((((LAT_N + LAT_S) / 2) * Math.PI) / 180);
const SCALA = Math.round((20 / KM_PER_GRADO_LON / (LON_E - LON_O)) * 1000) / 10; // arrotondata: i decimali lunghi sono scritti diversi da server e browser

// La scelta del lato dell'etichetta si fa su un riquadro di riferimento largo come uno schermo di telefono (il caso più stretto):
// più largo, l'etichetta pesa meno e quel lato va bene lo stesso.
const RIF_W = 343;
const RIF_H = (RIF_W * ALTEZZA) / LARGHEZZA;
const aRif = (lat: number, lng: number) => { const p = proietta(lat, lng); return { x: (p.x / LARGHEZZA) * RIF_W, y: (p.y / ALTEZZA) * RIF_H }; };
/** Ingombro del titolo "MAREMMA" in basso a sinistra, della scala e del nord: l'etichetta non ci va sopra. */
const FISSI: Rett[] = [{ x0: 8, y0: RIF_H - 52, x1: 104, y1: RIF_H - 4 }, { x0: RIF_W - 40, y0: RIF_H - 52, x1: RIF_W, y1: RIF_H - 4 }];

/** Il riquadro della cartina illustrata (i pulsanti li aggiunge chi la usa, come `children`: a sinistra "Vedi la mappa", a destra "Indicazioni"). */
export function CartinaMaremma({ d, children }: { d: DatiMappa; children?: React.ReactNode }) {
  const p = proietta(d.lat, d.lng);
  const punto = aRif(d.lat, d.lng);

  // I nomi della cartina, sul riquadro di riferimento: i paesi corti e i luoghi di peso 1 si vedono sempre, gli altri solo se il riquadro è largo.
  const nomi = [
    ...PAESI.filter((t) => t.peso !== 3).map((t) => ({ chiave: t.nome, sempre: t.peso === 1, rett: rettNome(aRif(t.lat, t.lng).x + (t.lato === 'l' ? 2 : -2), aRif(t.lat, t.lng).y, t.peso === 1 ? (t.corto ?? t.nome) : t.nome, { sinistra: t.lato === 'l' }) })),
    ...LUOGHI.map((l) => ({ chiave: l.nome, sempre: l.peso === 1, rett: rettNome(aRif(l.lat, l.lng).x, aRif(l.lat, l.lng).y - (l.tipo === 'isola' || l.tipo === 'monte' ? 8 : 0), l.nome, { centrato: true, carattere: l.tipo === 'mare' ? 9 : 7 }) })),
  ];
  const misura = misuraEtichetta(d.titolo, d.sotto);
  const scelta = scegliLato(punto, misura, { w: RIF_W, h: RIF_H }, [...nomi.filter((n) => n.sempre).map((n) => n.rett), ...rettPulsanti(RIF_W, true), ...FISSI]);
  // Quello che finirebbe sotto l'etichetta o sul punto della serata non si scrive.
  const sulPunto: Rett = { x0: punto.x - 10, y0: punto.y - 10, x1: punto.x + 10, y1: punto.y + 10 };
  const nascosti = new Set(nomi.filter((n) => sovrapposizione(n.rett, scelta.rett) > 0 || sovrapposizione(n.rett, sulPunto) > 0).map((n) => n.chiave));

  return (
    <Scatola>
      <div role="img" aria-label={`${etichettaMappa(d)} · cartina della Maremma`} className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/cartina-maremma.svg" alt="" width={LARGHEZZA} height={ALTEZZA} draggable={false} className="absolute inset-0 h-full w-full select-none" />

        {LUOGHI.map((l) => {
          if (nascosti.has(l.nome)) return null;
          const q = proietta(l.lat, l.lng);
          const su = l.tipo === 'isola' || l.tipo === 'monte';
          return (
            <span key={l.nome} aria-hidden="true" className={`absolute -translate-x-1/2 ${su ? '-translate-y-[170%]' : '-translate-y-1/2'} ${l.peso === 1 ? '' : 'cq-largo-block'} cq-luogo whitespace-nowrap font-mono uppercase leading-none ${l.tipo === 'mare' ? 'tracking-[.5em] text-[#6f9cc0]' : 'tracking-[.12em] text-osso-2'} ${OMBRA}`} style={{ left: pc(q.x, LARGHEZZA), top: pc(q.y, ALTEZZA) }}>
              {l.tipo === 'monte' ? '▲ ' : ''}{l.nome}
            </span>
          );
        })}

        {PAESI.filter((t) => t.peso !== 3 && !nascosti.has(t.nome)).map((t) => {
          const q = proietta(t.lat, t.lng);
          const sinistra = t.lato === 'l';
          return (
            <span key={t.nome} aria-hidden="true" className={`absolute -translate-y-1/2 items-center gap-[5px] whitespace-nowrap cq-paese font-display font-bold uppercase leading-none tracking-[.08em] text-osso ${t.peso === 1 ? 'flex' : 'cq-largo-flex'} ${sinistra ? '-translate-x-full flex-row-reverse' : ''} ${OMBRA}`} style={{ left: `calc(${pc(q.x, LARGHEZZA)} ${sinistra ? '+' : '-'} 2px)`, top: pc(q.y, ALTEZZA) }}>
              <i className="h-[5px] w-[5px] flex-none rounded-full bg-osso" />
              <span className="cq-stretto">{t.corto ?? t.nome}</span><span className="cq-largo-inline">{t.nome}</span>
            </span>
          );
        })}

        <div className="pointer-events-none absolute" style={{ left: pc(p.x, LARGHEZZA), top: pc(p.y, ALTEZZA) }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2"><PuntoSerata /></div>
          <EtichettaSerata titolo={d.titolo} sotto={d.sotto} lato={scelta.lato} ancora={scelta.ancora} />
        </div>

        {/* titolo da locandina sul mare, scala e nord */}
        <span aria-hidden="true" className="pointer-events-none absolute bottom-[26px] left-3 cq-titolo font-display font-black uppercase leading-[.8] text-[rgba(225,215,201,.16)]">Maremma</span>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-[10px] flex items-center gap-2 font-mono text-[8px] leading-none text-osso-2">
          <span className="block h-[5px] flex-none border-x border-b border-osso-2" style={{ width: `${SCALA}%` }} />20 KM
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[22px] right-3 flex flex-col items-center font-mono text-[9px] leading-none text-osso-2">
          <span>N</span><span className="mt-[2px] h-4 w-px bg-osso-2" />
        </div>
        <p className="absolute bottom-[3px] right-[6px] m-0 font-mono text-[10px] leading-[12px] text-osso-2 [text-shadow:0_0_3px_#0b1824,0_0_6px_#0b1824]">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-osso-2">© OpenStreetMap</a> · rilievo <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer" className="text-osso-2">Mapzen</a>
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
