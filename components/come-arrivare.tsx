import { locationVisibile } from '@/lib/dati/pubblico';
import type { Evento } from '@/lib/dati/tipi';
import { giorno2, giornoSett, meseCorto } from '@/lib/formato';
import { sceltaMappa } from '@/lib/mappa';
import { MappaUnica } from '@/components/mappa/mappa-unica';
import { Navigatori } from '@/components/mappa/navigatori';
import type { DatiMappa } from '@/components/mappa/tipi';

/**
 * La sezione "Come arrivare" della pagina serata: testo, una sola mappa che si muove con i gesti e, sotto, le indicazioni
 * (Google Maps, Apple Maps, Waze). Senza coordinate o con la location segreta resta il segnaposto; con la location segreta
 * niente indicazioni.
 */
export function ComeArrivare({ e, coordinate, visibile = locationVisibile(e), zoom }: { e: Evento; coordinate: string | null; visibile?: boolean; zoom?: number }) {
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
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {dati ? (
          <MappaUnica d={dati} zoom={zoom} />
        ) : (
          // Segnaposto: senza coordinate o con la location ancora segreta non si carica nessuna mappa.
          <div className="mm-curve relative h-[220px] border border-linea bg-[#0a0d11] bg-[position:-900px_-260px] md:h-[360px]">
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[10px]">
              <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-arancio md:h-14 md:w-14"><div className="h-[10px] w-[10px] rounded-full bg-arancio md:h-3 md:w-3" /></div>
              <span className="bg-notte px-2 py-[5px] font-mono text-[11px] leading-[14px] md:text-[12px]">{coordinate ?? (visibile ? (e.comune ?? 'LOCATION IN ARRIVO').toUpperCase() : 'LOCATION SEGRETA')}</span>
            </div>
            <span className="absolute bottom-[14px] left-4 font-mono text-[10px] leading-[14px] text-osso-3">MAPPA · SEGNAPOSTO</span>
          </div>
        )}
        <Navigatori d={{ lat: e.lat, lng: e.lng, location: e.location, comune: e.comune }} visibile={visibile} />
      </div>
    </section>
  );
}
