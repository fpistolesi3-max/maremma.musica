import type { Metadata } from 'next';
import Link from 'next/link';
import { Disco } from '@/components/ui';

export const metadata: Metadata = { title: 'Chi siamo', description: 'La crew di Maremma Musica: techno in giro per la Maremma, dai campi sportivi alle pinete.' };

// TODO: cliente — storia vera, nomi dei residenti, contatti booking.
const RESIDENTI = [
  { nome: '[Resident 1]', ruolo: 'Resident · techno' },
  { nome: '[Resident 2]', ruolo: 'Resident · hard groove' },
  { nome: '[Resident 3]', ruolo: 'Resident · live set' },
];

export default function ChiSiamo() {
  return (
    <>
      <section className="mm-curve overflow-hidden bg-[position:-600px_-200px]">
        <div className="contenitore flex flex-col gap-6 pb-14 pt-8 md:flex-row md:items-center md:gap-16 md:pb-24 md:pt-16">
          <div className="flex flex-grow flex-col gap-6">
            <span className="font-mono text-[11px] tracking-[.06em] text-arancio md:text-[12px]">✦ LA CREW</span>
            <h1 className="m-0 font-display text-[72px] font-black uppercase leading-[.84] md:text-[120px]">Techno dove<br /><span className="text-arancio">non te lo</span><br />aspetti.</h1>
            <p className="m-0 max-w-[620px] text-[17px] leading-[26px] md:text-[18px] md:leading-7">
              Campi sportivi, pinete, casali. Portiamo la cassa dritta nei posti della Maremma dove di solito d&apos;estate si sentono solo le cicale.
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo-maremma-musica.png" alt="Logo Maremma Musica" className="h-[280px] w-[280px] self-center md:h-[400px] md:w-[400px] md:flex-none" />
        </div>
      </section>

      <section className="border-t border-linea">
        <div className="contenitore grid gap-8 py-14 md:grid-cols-[400px_minmax(0,1fr)] md:gap-24 md:py-24">
          <h2 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[80px]">La storia</h2>
          <div className="flex max-w-[680px] flex-col gap-5 text-[17px] leading-[26px] text-osso-2 md:text-[18px] md:leading-7">
            {/* TODO: cliente — testo della storia */}
            <p className="m-0 text-osso">Maremma Musica nasce da un gruppo di amici con un impianto e una fissa: far ballare la Maremma senza doverla lasciare.</p>
            <p className="m-0">Ogni serata cambia posto. La location la scegliamo per come suona e per come si vede all&apos;alba, poi ci portiamo tutto: cassa, luci, bar. La lista serve a sapere quanti siamo e a farti entrare in fretta.</p>
            <p className="m-0">[Storia della crew da completare con il cliente: anno di nascita, prime serate, collaborazioni.]</p>
          </div>
        </div>
      </section>

      <section className="border-t border-linea">
        <div className="contenitore flex flex-col gap-8 py-14 md:py-24">
          <h2 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[80px]">Residenti</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RESIDENTI.map((r) => (
              <div key={r.nome} className="flex flex-col gap-4">
                <div className="mm-foto aspect-[4/5]">Foto · da fornire</div>
                <span className="font-display text-[32px] font-black uppercase leading-none">{r.nome}</span>
                <span className="dato text-osso-2">{r.ruolo}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="booking" className="border-t border-linea bg-notte-2">
        <div className="contenitore flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between md:py-20">
          <div className="flex flex-col gap-4">
            <h2 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[80px]">Booking</h2>
            <p className="m-0 max-w-[520px] text-[17px] leading-[26px] text-osso-2">Hai un posto che suonerebbe bene? Vuoi portarci a suonare da te? Scrivici.</p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <a href="mailto:maremmamusica@gmail.com?subject=Booking" className="mm-btn mm-btn--primario">Scrivi per il booking</a>
            <Link href="/eventi" className="link-sottolineato py-3">Vedi le prossime date →</Link>
          </div>
          <Disco className="hidden h-[160px] w-[160px] lg:block" />
        </div>
      </section>
    </>
  );
}
