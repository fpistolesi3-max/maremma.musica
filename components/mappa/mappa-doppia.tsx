'use client';

import { useState } from 'react';
import { inMaremma } from '@/lib/cartina';
import { CartinaMaremma, RigaDistanze } from './cartina-maremma';
import { Indicazioni } from './indicazioni';
import { MappaVera } from './mappa-vera';
import { Scatola } from './scatola';
import type { DatiMappa } from './tipi';

const BOTTONE = 'border border-linea-forte bg-notte px-3 py-[10px] font-mono text-[11px] leading-[14px] text-osso hover:border-osso';

/**
 * Le due insieme: si vede la cartina illustrata; un tocco su "Vedi la mappa" la sostituisce con la mappa vera, nello stesso riquadro,
 * e un altro tocco torna indietro. La libreria della mappa si scarica solo al primo tocco. Senza rete resta la cartina.
 * Fuori dalla Maremma non c'è cartina: si vede direttamente la mappa vera.
 */
export function MappaDoppia({ d }: { d: DatiMappa }) {
  const [vera, setVera] = useState(false);
  const [assente, setAssente] = useState(false);
  const cartina = inMaremma(d.lat, d.lng);

  if (!cartina) return <Scatola><MappaVera d={d} /><Indicazioni d={d} className="absolute right-3 top-3 z-20" /></Scatola>;

  const comandi = (
    <>
      <Indicazioni d={d} className="absolute right-3 top-3 z-20" />
      <button type="button" onClick={() => { setAssente(false); setVera((v) => !v); }} aria-pressed={vera} className={`${BOTTONE} absolute left-3 top-3 z-20`}>
        {vera ? '← Torna alla cartina' : 'Vedi la mappa'}
      </button>
    </>
  );

  return (
    <div>
      {vera ? (
        <Scatola><MappaVera d={d} subito onErrore={() => { setVera(false); setAssente(true); }} />{comandi}</Scatola>
      ) : (
        <CartinaMaremma d={d}>{comandi}</CartinaMaremma>
      )}
      {!vera && <RigaDistanze lat={d.lat} lng={d.lng} />}
      <p role="status" className="m-0 font-mono text-[11px] leading-4 text-osso-2">{assente ? 'La mappa non si carica adesso (serve la rete): resta la cartina.' : ''}</p>
    </div>
  );
}
