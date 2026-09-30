import type { Metadata } from 'next';
import Link from 'next/link';
import { eventiPubblici } from '@/lib/dati/pubblico';
import { chipLista } from '@/lib/regole';
import { dataPunti, giorno2, giornoSett, meseCorto, numeroEvento, orari, parti } from '@/lib/formato';
import { Locandina, luogo } from '@/components/evento';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Date', description: 'Le prossime serate techno di Maremma Musica e l’archivio di quelle passate.' };

export default async function Eventi() {
  const { prossimi, passati } = await eventiPubblici();
  return (
    <>
      <section className="contenitore flex flex-col gap-6 pb-14 pt-8 md:gap-10 md:pb-24 md:pt-14">
        <div className="flex items-end justify-between">
          <h1 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[96px]">Prossime<br />date</h1>
          <span className="text-right font-mono text-[11px] leading-4 text-osso-2 md:text-[13px]">{String(prossimi.length).padStart(2, '0')} SERATE</span>
        </div>
        {prossimi.length === 0 && <p className="border-y border-linea py-6 text-osso-2">Nessuna data in calendario, per ora. Seguici su Instagram.</p>}
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {prossimi.map(({ evento: e, stato }) => {
            const chip = chipLista(stato, true);
            return (
              <Link key={e.id} href={`/e/${e.slug}`} className="mm-riga-data group flex flex-col gap-4 text-osso no-underline hover:text-osso">
                <div className="relative aspect-[3/4] w-full overflow-hidden">
                  <Locandina e={e} className="absolute inset-0 h-full w-full" alt={`Locandina: ${e.nome}, ${dataPunti(e.data)}`} />
                </div>
                <div className="flex items-end justify-between gap-4">
                  <span className="font-display text-[56px] font-black uppercase leading-[.8]">{giorno2(e.data)} <span className="text-arancio">{meseCorto(e.data)}</span></span>
                  <span className="dato-s pb-1 text-osso-2">{giornoSett(e.data)} · {numeroEvento(e.numero)}</span>
                </div>
                <span className="font-display text-[32px] font-black uppercase leading-[.9]">{e.nome}</span>
                <span className="dato text-osso-2">{luogo(e)} · {orari(e.data, e.dataFine)}</span>
                <div className="flex items-center justify-between">
                  <span className={chip.classe}>{chip.testo}</span>
                  <span className="mm-freccia font-mono text-[22px] text-arancio" aria-hidden="true">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="archivio" className="border-t border-linea">
        <div className="contenitore flex flex-col gap-6 pb-14 pt-12 md:gap-10 md:pb-24 md:pt-16">
          <h2 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[96px]">Serate<br />passate</h2>
          {passati.length === 0 && <p className="text-osso-2">L’archivio si riempie dopo la prima serata.</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {passati.map((e) => (
              <Link key={e.id} href={`/e/${e.slug}`} className="mm-riga-data flex flex-col gap-2 text-osso no-underline hover:text-osso">
                <div className="relative aspect-[3/4] w-full overflow-hidden"><Locandina e={e} className="absolute inset-0 h-full w-full" alt={`Locandina: ${e.nome}`} /></div>
                <span className="dato-s text-osso-2">{dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)} · {numeroEvento(e.numero)}</span>
                <span className="font-display text-[22px] font-extrabold uppercase leading-none">{e.nome}</span>
                <span className="dato-s text-osso-2">{luogo(e)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
