import { locationVisibile } from '@/lib/dati/pubblico';
import type { Evento } from '@/lib/dati/tipi';
import { inMaremma } from '@/lib/cartina';
import { giorno2, giornoSett, meseCorto } from '@/lib/formato';
import { sceltaMappa } from '@/lib/mappa';
import { ApriInMaps, MappaSerata } from '@/components/mappa-serata';
import { CartinaMaremma, RigaDistanze } from '@/components/mappa/cartina-maremma';
import { Indicazioni } from '@/components/mappa/indicazioni';
import { MappaDoppia } from '@/components/mappa/mappa-doppia';
import { MappaVera } from '@/components/mappa/mappa-vera';
import { Scatola } from '@/components/mappa/scatola';
import type { DatiMappa } from '@/components/mappa/tipi';

/** "attuale" è la mappa in produzione; 1, 2 e 3 sono le proposte da scegliere (vedi proposte-mappa/LEGGIMI.md). */
export type VarianteMappa = 'attuale' | '1' | '2' | '3';

/** La sezione "Come arrivare" della pagina serata: testo, "Apri in Maps" e la mappa nella variante scelta. */
export function ComeArrivare({ e, coordinate, variante = 'attuale', visibile = locationVisibile(e) }: { e: Evento; coordinate: string | null; variante?: VarianteMappa; visibile?: boolean }) {
  const mappa = e.lat != null && e.lng != null && sceltaMappa(e, visibile) === 'mappa';
  const luogo = e.location ?? e.comune ?? coordinate ?? '';
  const dati: DatiMappa | null = mappa ? {
    lat: e.lat!, lng: e.lng!, location: e.location, comune: e.comune,
    titolo: e.nome,
    sotto: `${giornoSett(e.data)} ${giorno2(e.data)} ${meseCorto(e.data)} · ${luogo}`.toUpperCase(),
  } : null;

  return (
    <section className="contenitore grid gap-4 pb-10 md:grid-cols-[520px_minmax(0,1fr)] md:gap-12 md:pb-24 xl:gap-24">
      <div className="flex flex-col gap-4 md:gap-5">
        <h2 className="m-0 font-display text-[48px] font-black uppercase leading-[.86] md:text-[72px]">Come<br className="hidden md:block" /> arrivare</h2>
        <p className="m-0 text-[16px] leading-6 text-osso-2 md:text-[17px] md:leading-[26px]">
          {visibile ? (e.infoArrivo ?? 'Parcheggio e navetta: te li diciamo qui appena confermati.') : 'La location è segreta: la trovi qui 48 ore prima della serata.'}
        </p>
        {visibile && <ApriInMaps lat={e.lat} lng={e.lng} location={e.location} comune={e.comune} />}
      </div>
      {dati && variante === 'attuale' ? (
        <MappaSerata lat={dati.lat} lng={dati.lng} location={e.location} comune={e.comune} etichetta={luogo.toUpperCase()} />
      ) : dati && variante === '1' ? (
        <Scatola><MappaVera d={dati} /><Indicazioni d={dati} className="absolute right-3 top-3 z-20" /></Scatola>
      ) : dati && variante === '2' && inMaremma(dati.lat, dati.lng) ? (
        <div>
          <CartinaMaremma d={dati}><Indicazioni d={dati} className="absolute right-3 top-3 z-20" /></CartinaMaremma>
          <RigaDistanze lat={dati.lat} lng={dati.lng} />
        </div>
      ) : dati && variante === '3' ? (
        <MappaDoppia d={dati} />
      ) : (
        // Segnaposto: senza coordinate, con la location ancora segreta o (cartina) fuori dalla Maremma non si carica nessuna mappa.
        <div className="mm-curve relative h-[220px] border border-linea bg-[#0a0d11] bg-[position:-900px_-260px] md:h-[360px]">
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[10px]">
            <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-arancio md:h-14 md:w-14"><div className="h-[10px] w-[10px] rounded-full bg-arancio md:h-3 md:w-3" /></div>
            <span className="bg-notte px-2 py-[5px] font-mono text-[11px] leading-[14px] md:text-[12px]">{coordinate ?? (visibile ? (e.comune ?? 'LOCATION IN ARRIVO').toUpperCase() : 'LOCATION SEGRETA')}</span>
          </div>
          <span className="absolute bottom-[14px] left-4 font-mono text-[10px] leading-[14px] text-osso-3">MAPPA · SEGNAPOSTO</span>
        </div>
      )}
    </section>
  );
}
