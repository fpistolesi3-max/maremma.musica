import type { Metadata } from 'next';
import Link from 'next/link';
import { eventiPubblici } from '@/lib/dati/pubblico';
import { dataPunti, parti } from '@/lib/formato';
import { Locandina } from '@/components/evento';
import { Parallasse } from '@/components/parallasse';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Galleria', description: 'Foto e video delle serate passate di Maremma Musica.' };

// TODO: cliente — foto e video veri delle serate (per ora segnaposto).
const SEGNAPOSTO = ['Consolle', 'Pubblico', 'Location di giorno', 'Alba', 'Luci', 'Sotto cassa', 'Backstage', 'Pubblico', 'Location di notte'];

export default async function Galleria() {
  const { passati } = await eventiPubblici();
  return (
    <section className="contenitore flex flex-col gap-8 pb-16 pt-8 md:gap-12 md:pb-24 md:pt-14">
      <div className="flex items-end justify-between gap-4">
        <h1 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[96px]">Galleria</h1>
        <a href="https://www.instagram.com/maremma.musica/" className="link-sottolineato hidden py-3 md:inline">Tutto su Instagram →</a>
      </div>
      {passati.map((e) => (
        <div key={e.id} className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between border-t border-linea pt-4">
            <Link href={`/e/${e.slug}`} className="font-display text-[32px] font-black uppercase leading-none no-underline md:text-[44px]">{e.nome}</Link>
            <span className="dato text-osso-2">{dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
            <Parallasse className="aspect-[3/4]" velocita={0.1}><Locandina e={e} className="absolute inset-0 h-full w-full" alt={`Locandina: ${e.nome}`} /></Parallasse>
            {SEGNAPOSTO.slice(0, 3).map((s, i) => <Parallasse key={i} className="mm-foto aspect-[3/4]" velocita={i % 2 ? 0.06 : -0.06}>Foto · {s}</Parallasse>)}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-4">
        <div className="border-t border-linea pt-4 font-display text-[32px] font-black uppercase leading-none md:text-[44px]">Archivio</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-4">
          {SEGNAPOSTO.map((s, i) => <Parallasse key={i} className={`mm-foto ${i % 4 === 0 ? 'aspect-square md:row-span-2 md:aspect-auto' : 'aspect-[4/3]'}`} velocita={i % 3 === 0 ? 0.12 : i % 3 === 1 ? -0.05 : 0.07}>Foto · {s} · da fornire</Parallasse>)}
        </div>
      </div>
      <a href="https://www.instagram.com/maremma.musica/" className="link-sottolineato self-start py-3 md:hidden">Tutto su Instagram →</a>
    </section>
  );
}
