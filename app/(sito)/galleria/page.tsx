import type { Metadata } from 'next';
import Link from 'next/link';
import { serateConFoto } from '@/lib/dati/foto';
import { dataPunti, parti } from '@/lib/formato';
import { testoAltFoto } from '@/lib/foto';
import { Locandina } from '@/components/evento';
import { Parallasse } from '@/components/parallasse';
import { NotaFoto } from '@/components/foto-privacy';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Galleria', description: 'Le foto delle serate passate di Maremma Musica.' };

export default async function Galleria() {
  const serate = await serateConFoto();
  return (
    <section className="contenitore flex flex-col gap-8 pb-16 pt-8 md:gap-12 md:pb-24 md:pt-14">
      <div className="flex items-end justify-between gap-4">
        <h1 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[96px]">Galleria</h1>
        <a href="https://www.instagram.com/maremma.musica/" className="link-sottolineato hidden py-3 md:inline">Tutto su Instagram →</a>
      </div>
      {serate.length === 0 && (
        <p className="m-0 border-y border-linea py-6 text-[17px] leading-[26px] text-osso-2">
          Le foto delle serate arriveranno presto. Intanto seguici su <a href="https://www.instagram.com/maremma.musica/" className="link-sottolineato">Instagram</a>.
        </p>
      )}
      {serate.map(({ evento: e, foto, evidenza }) => (
        <div key={e.id} className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4 border-t border-linea pt-4">
            <Link href={`/e/${e.slug}`} className="font-display text-[32px] font-black uppercase leading-none no-underline md:text-[44px]">{e.nome}</Link>
            <span className="dato flex-none text-osso-2">{dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
            <Parallasse className="aspect-[3/4]" velocita={0.1}><Locandina e={e} className="absolute inset-0 h-full w-full" alt={`Locandina: ${e.nome}`} /></Parallasse>
            {evidenza.slice(0, 3).map((f, i) => (
              <Parallasse key={f.id} className="aspect-[3/4] bg-[#111419]" velocita={i % 2 ? 0.06 : -0.06}>
                <Link href={`/e/${e.slug}#foto`} className="absolute inset-0 block" aria-label={`Vedi le foto della serata ${e.nome}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.urlMini} alt={testoAltFoto(e.nome, dataPunti(e.data))} width={f.larghezza} height={f.altezza} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
                </Link>
              </Parallasse>
            ))}
          </div>
          <Link href={`/e/${e.slug}#foto`} className="link-sottolineato self-start py-2">Vedi tutte ({foto.length}) →</Link>
        </div>
      ))}
      {serate.length > 0 && <NotaFoto />}
      <a href="https://www.instagram.com/maremma.musica/" className="link-sottolineato self-start py-3 md:hidden">Tutto su Instagram →</a>
    </section>
  );
}
