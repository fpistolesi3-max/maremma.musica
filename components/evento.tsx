import Link from 'next/link';
import type { Evento } from '@/lib/dati/tipi';
import type { EventoPubblico } from '@/lib/dati/pubblico';
import { chipLista, type StatoLista } from '@/lib/regole';
import { dataPunti, giorno2, giornoSett, meseCorto, numeroEvento, ora, orari } from '@/lib/formato';
import { Freccia, LocandinaInArrivo } from './ui';
import { BinarioCinetico } from './binario-cinetico';

// Pezzi della lista date e della pagina evento, dai mockup Home / Evento.

import { luogoTesto as luogo } from '@/lib/luogo';
import { PulsanteMorph } from '@/components/pulsante-morph';
export { luogo };

export function sottotitolo(e: Evento) {
  if (e.highlight) return e.highlight;
  if (e.lineup.length) return e.lineup.join(' · ');
  return 'Line-up in arrivo';
}

/** "Premio 500 € alla maschera migliore" → la cifra in arancio, come nei mockup. */
export function ConCifraArancio({ testo }: { testo: string }) {
  const parti = testo.split(/(\d[\d.,]*\s?€)/);
  return <>{parti.map((p, i) => (i % 2 ? <span key={i} className="text-arancio">{p}</span> : p))}</>;
}

export function PuoIscriversi(s: StatoLista) {
  return s.tipo === 'aperta' || s.tipo === 'libero';
}

/** Pulsante principale della serata: se la lista non è aperta il motivo è scritto nell'etichetta. */
export function BottoneLista({ ep, className = '', style }: { ep: EventoPubblico; className?: string; style?: React.CSSProperties }) {
  if (PuoIscriversi(ep.stato)) {
    return (
      <PulsanteMorph href={`/e/${ep.evento.slug}/prevendita`} className={className} style={style}>
        Mettiti in lista <Freccia />
      </PulsanteMorph>
    );
  }
  const motivo = { dal: ep.stato.tipo === 'dal' && ep.stato.dal ? `Lista dal ${dataPunti(ep.stato.dal)}` : 'Lista chiusa', piena: 'Lista piena', chiusa: ep.stato.tipo === 'chiusa' && ep.stato.alle ? `Prevendite chiuse alle ${ora(ep.stato.alle)}` : 'Lista chiusa', passata: 'Serata passata' }[ep.stato.tipo as 'dal' | 'piena' | 'chiusa' | 'passata'];
  return (
    <button type="button" disabled className={`mm-btn mm-btn--clip mm-btn--primario ${className}`} style={style}>{motivo}</button>
  );
}

export function Locandina({ e, className, alt }: { e: Evento; className: string; alt?: string }) {
  if (!e.locandinaUrl) return <LocandinaInArrivo className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={e.locandinaUrl} alt={alt ?? ''} className={`object-cover ${className}`} />;
}

/** Riga della lista "Prossime date": su telefono impilata, da desktop a colonne. */
export function RigaEvento({ ep, ultima }: { ep: EventoPubblico; ultima?: boolean }) {
  const e = ep.evento;
  const chip = chipLista(ep.stato, true);
  return (
    <Link
      href={`/e/${e.slug}`}
      className={`mm-riga-data grid grid-cols-[84px_minmax(0,1fr)] gap-4 border-t border-linea py-5 text-osso no-underline hover:text-osso md:grid-cols-[120px_200px_minmax(0,1fr)_auto_24px] md:items-center md:gap-5 md:py-7 lg:grid-cols-[120px_250px_minmax(0,1fr)_220px_40px] lg:gap-10 ${ultima ? 'border-b' : ''}`}
    >
      <Locandina e={e} className="h-[126px] w-[84px] md:h-[180px] md:w-[120px]" />
      {/* data grande solo da desktop */}
      <div className="hidden items-end gap-3 md:flex">
        <span className="font-display text-[112px] font-black leading-[.8]">{giorno2(e.data)}</span>
        <div className="flex flex-col gap-2 pb-1">
          <span className="font-display text-[44px] font-black uppercase leading-[.85] text-arancio">{meseCorto(e.data)}</span>
          <span className="dato-s text-osso-2">{giornoSett(e.data)} · {numeroEvento(e.numero)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-[6px] md:gap-[10px]">
        <span className="font-mono text-[10px] leading-[14px] text-osso-2 md:hidden">{giornoSett(e.data)} · {numeroEvento(e.numero)}</span>
        <span className="font-display text-[40px] font-black uppercase leading-[.86] md:hidden">{giorno2(e.data)} <span className="text-arancio">{meseCorto(e.data)}</span></span>
        <span className="font-display text-[20px] font-extrabold uppercase leading-[1.05] md:text-[48px] md:font-black md:leading-[.9]">{e.nome}</span>
        <span className="hidden font-display text-[22px] font-extrabold uppercase leading-none text-osso-2 md:block">{sottotitolo(e)}</span>
        <span className="font-mono text-[11px] leading-4 text-osso-2 md:text-[13px] md:leading-[18px]">
          {luogo(e)}{e.dressCode ? ` · dress code ${e.dressCode.toLowerCase()}` : ''} · {orari(e.data, e.dataFine)}
        </span>
        <div className="mt-1 flex gap-2 md:hidden"><span className={chip.classe}>{chip.testo}</span></div>
      </div>
      <div className="hidden md:flex"><span className={chip.classe}>{chip.testo}</span></div>
      <span className="mm-freccia hidden font-mono text-[26px] leading-none text-arancio md:block" aria-hidden="true">→</span>
    </Link>
  );
}

/** Nastro delle date che attraversa la pagina e scorre in orizzontale. */
export function Nastro({ eventi }: { eventi: Evento[] }) {
  // Con poche date le ripetiamo, così il nastro copre sempre lo schermo.
  const voci = eventi.length >= 4 ? eventi : Array.from({ length: Math.ceil(4 / Math.max(1, eventi.length)) }, () => eventi).flat();
  const giro = (chiave: string, nascosto: boolean) => (
    <div className="mm-nastro__giro" key={chiave} aria-hidden={nascosto || undefined}>
      <span className="text-[24px] md:text-[34px]">Prossime date</span><i aria-hidden="true">✦</i>
      {voci.map((e, n) => (
        <span key={`${e.id}-${n}`} className="contents">
          <Link href={`/e/${e.slug}`} tabIndex={nascosto || n >= eventi.length ? -1 : undefined} className="text-[24px] md:text-[34px]">{dataPunti(e.data)} {e.nome}</Link>
          {n % 2 ? <i aria-hidden="true">✦</i> : <b className="mm-mini-disco" aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative h-[104px] flex-none overflow-hidden md:h-[150px]">
      <nav
        aria-label="Prossime date"
        className="mm-nastro absolute -left-10 top-7 flex h-12 w-[calc(100%+80px)] -rotate-3 items-center md:-left-[60px] md:top-11 md:h-16 md:w-[calc(100%+120px)] md:-rotate-2"
      >
        {/* due giri identici: l'animazione scorre di metà e riparte senza stacco */}
        <BinarioCinetico>{[giro('a', false), giro('b', true)]}</BinarioCinetico>
      </nav>
    </div>
  );
}
