import Link from 'next/link';
import { eventiPubblici } from '@/lib/dati/pubblico';
import { chipLista } from '@/lib/regole';
import { giorno2, giornoSettLungo, meseCorto, numeroEvento, orari, dataPunti } from '@/lib/formato';
import { ConCifraArancio, Locandina, Nastro, RigaEvento, luogo } from '@/components/evento';
import { Disco, Freccia } from '@/components/ui';
import { Rivela } from '@/components/rivela';
import { CopertinaViva } from '@/components/copertina-viva';
import { TitoloDecodifica } from '@/components/titolo-decodifica';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { prossimi, passati } = await eventiPubblici();
  const [primo] = prossimi;

  return (
    <>
      {/* HERO: il prossimo evento a tutto schermo */}
      {primo ? (
        <section className="mm-curve overflow-hidden bg-[position:-700px_-160px] md:bg-[position:380px_-120px]">
          <div className="contenitore flex flex-col gap-6 pb-10 pt-6 md:min-h-[calc(100dvh-96px)] md:flex-row md:gap-10 md:pb-16 md:pt-[72px]">
            <div className="relative z-[2] flex flex-col gap-6 md:w-[58%] md:flex-none md:gap-7">
              <div className="flex items-center gap-3 font-mono text-[11px] leading-none tracking-[.06em] md:gap-4 md:text-[12px]">
                <span className="text-arancio">✦ PROSSIMA DATA</span>
                <span className="h-px w-7 bg-linea-forte md:w-10" />
                <span className="text-osso-2">{numeroEvento(primo.evento.numero)}</span>
              </div>

              {/* locandina + disco: su telefono prima della data */}
              <CopertinaHero ep={primo} className="md:hidden" />

              <div className="mt-7 flex items-end gap-[14px] md:gap-[22px]">
                <TitoloDecodifica testo={giorno2(primo.evento.data)} className="font-display text-[196px] font-black leading-[.74] tracking-[-.02em] lg:text-[280px] xl:text-[360px]" />
                <div className="flex flex-col gap-[10px] pb-1 md:gap-[14px] md:pb-2">
                  <TitoloDecodifica testo={meseCorto(primo.evento.data)} ritardo={150} className="font-display text-[72px] font-black uppercase leading-[.8] text-arancio xl:text-[128px]" />
                  <span className="font-mono text-[12px] leading-[1.5] text-osso-2 md:text-[14px]">
                    {giornoSettLungo(primo.evento.data).toUpperCase()}<br className="hidden md:block" /><span className="md:hidden"> · </span>{orari(primo.evento.data, primo.evento.dataFine)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3 md:gap-[14px]">
                <TitoloDecodifica as="h1" testo={primo.evento.nome} ritardo={300} className="m-0 font-display text-[72px] font-black uppercase leading-[.86] md:text-[96px] xl:text-[124px]" />
                {(primo.evento.highlight || primo.evento.lineup.length > 0) && (
                  <span className="font-display text-[26px] font-extrabold uppercase leading-none text-osso-2 md:text-[40px]">
                    <ConCifraArancio testo={primo.evento.highlight ?? primo.evento.lineup.join(' · ')} />
                  </span>
                )}
                <span className="font-mono text-[12px] leading-[18px] text-osso-2 md:text-[13px]">
                  {primo.evento.dressCode && <>DRESS CODE: {primo.evento.dressCode.toUpperCase()} · </>}{luogo(primo.evento).toUpperCase()}
                </span>
              </div>
              <div className="mt-1 flex flex-col gap-[14px] md:mt-3 md:flex-row md:items-center md:gap-6">
                {/* Porta alla pagina della serata: lì si sceglie tra lista e tavolo. */}
                <Link href={`/e/${primo.evento.slug}`} className="mm-btn mm-btn--primario mm-btn--pieno md:w-auto" style={{ minHeight: 56, fontSize: 16, padding: '0 36px' }}>
                  Partecipa <Freccia />
                </Link>
                <span className={`${chipLista(primo.stato).classe} self-start md:self-auto`}>{chipLista(primo.stato).testo}</span>
              </div>
            </div>
            <CopertinaHero ep={primo} className="hidden md:block md:flex-grow" />
          </div>
        </section>
      ) : (
        <section className="mm-curve">
          <div className="contenitore flex flex-col gap-6 py-16 md:py-24">
            <span className="font-mono text-[12px] text-arancio">✦ PROSSIME DATE</span>
            <h1 className="m-0 font-display text-[72px] font-black uppercase leading-[.86] md:text-[124px]">Nuove date<br />in arrivo.</h1>
            <p className="m-0 max-w-xl text-[18px] leading-7 text-osso-2">Seguici su Instagram per sapere dove suoniamo la prossima volta.</p>
          </div>
        </section>
      )}

      {prossimi.length > 0 && <Nastro eventi={prossimi.map((p) => p.evento)} />}

      {/* PROSSIME DATE */}
      <section id="date" className="contenitore flex flex-col gap-6 pb-14 pt-8 md:gap-10 md:pb-24 md:pt-14">
        <div className="flex items-end justify-between">
          <h2 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[96px]">Prossime<br /><span className="text-arancio">date</span></h2>
          <span className="text-right font-mono text-[11px] leading-4 text-osso-2 md:text-[13px] md:leading-[18px]">
            {String(prossimi.length).padStart(2, '0')} SERATE
            {prossimi.length > 1 && <span className="hidden md:inline"><br />{meseCorto(prossimi[0].evento.data).toUpperCase()} → {meseCorto(prossimi[prossimi.length - 1].evento.data).toUpperCase()}</span>}
          </span>
        </div>
        <div className="flex flex-col">
          {prossimi.map((ep, i) => <Rivela key={ep.evento.id} indice={i}><RigaEvento ep={ep} ultima={i === prossimi.length - 1} /></Rivela>)}
          {prossimi.length === 0 && <p className="border-y border-linea py-6 text-osso-2">Nessuna data in calendario, per ora.</p>}
        </div>
      </section>

      {/* MANIFESTO */}
      <section id="crew" className="border-t border-linea">
        <div className="contenitore flex flex-col gap-6 pb-14 pt-12 md:flex-row md:items-center md:gap-20 md:pb-[120px] md:pt-16">
          <div className="flex flex-grow flex-col gap-6 md:gap-9">
            <span className="font-mono text-[11px] leading-none tracking-[.06em] text-arancio md:text-[12px]">✦ LA CREW</span>
            <h2 className="m-0 font-display text-[72px] font-black uppercase leading-[.84] md:text-[96px] xl:text-[120px]">Techno dove<br /><span className="text-arancio">non te lo</span><br />aspetti.</h2>
            <div className="flex max-w-[760px] flex-col gap-6 md:flex-row md:gap-12">
              <p className="m-0 flex-1 text-[17px] leading-[26px] md:text-[18px] md:leading-7">Campi sportivi, pinete, casali. Portiamo la cassa dritta nei posti della Maremma dove di solito d&apos;estate si sentono solo le cicale.</p>
              <p className="m-0 flex-1 text-[17px] leading-[26px] text-osso-2 md:text-[18px] md:leading-7">Ogni serata ha la sua location, la sua locandina e la sua lista. Mettiti in lista dal link del tuo PR o da qui: il QR ti arriva subito.</p>
            </div>
            <Link href="/chi-siamo" className="link-sottolineato self-start py-3">Chi siamo →</Link>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/logo-maremma-musica.png" alt="Logo Maremma Musica" className="mt-4 h-[300px] w-[300px] self-center md:mt-0 md:h-[440px] md:w-[440px] md:flex-none" />
        </div>
      </section>

      {/* SERATE PASSATE */}
      <section id="serate" className="contenitore flex flex-col gap-5 pb-14 md:gap-10 md:pb-[120px]">
        <div className="flex items-end justify-between">
          <h2 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[96px]">Serate<br /><span className="text-arancio">passate</span></h2>
          <Link href="/galleria" className="link-sottolineato hidden md:inline">Tutte le foto →</Link>
        </div>
        <div className="grid grid-cols-2 grid-rows-[220px_150px] gap-2 md:grid-cols-[2fr_1fr_1fr] md:grid-rows-[260px_260px] md:gap-4">
          <div className="mm-foto col-span-2 md:col-span-1 md:row-span-2">Foto serata · consolle · da fornire</div>
          <div className="mm-foto">Foto · pubblico</div>
          {passati[0] ? (
            <Link href={`/e/${passati[0].slug}`} className="relative overflow-hidden md:row-span-2">
              <Locandina e={passati[0]} className="absolute inset-0 h-full w-full" alt={`Locandina della serata del ${dataPunti(passati[0].data)}: ${passati[0].nome}`} />
              <span className="absolute inset-x-0 bottom-0 bg-vinile px-[10px] py-2 font-mono text-[10px] leading-3 text-osso md:p-[14px] md:text-[11px] md:leading-[14px]">
                {dataPunti(passati[0].data)} · {passati[0].nome.toUpperCase()}
              </span>
            </Link>
          ) : <div className="mm-foto">Foto · location</div>}
          <div className="mm-foto hidden md:flex">Foto · location di giorno</div>
        </div>
        <Link href="/galleria" className="link-sottolineato py-3 md:hidden">Tutte le foto →</Link>
      </section>
    </>
  );
}

function CopertinaHero({ ep, className = '' }: { ep: Awaited<ReturnType<typeof eventiPubblici>>['prossimi'][number]; className?: string }) {
  const e = ep.evento;
  return (
    <CopertinaViva className={`relative ${className}`}>
      <div className="relative h-[470px] md:h-[760px]">
        <Disco
          className="mm-viva-disco absolute left-[180px] top-0 h-[280px] w-[280px] md:left-[190px] md:top-[86px] md:h-[520px] md:w-[520px]"
          etichetta={['MAREMMA<br>MUSICA', `LATO A<br>${numeroEvento(e.numero)}`]}
        />
        <Locandina
          e={e}
          className="mm-viva-locandina absolute left-0 top-[38px] h-[432px] w-[288px] shadow-pannello md:top-10 md:h-[585px] md:w-[390px]"
          alt={`Locandina: ${e.nome}, ${dataPunti(e.data)}${e.highlight ? ` — ${e.highlight}` : ''}`}
        />
        <span className="absolute left-0 top-[645px] hidden font-mono text-[11px] leading-[14px] tracking-[.04em] text-osso-3 md:block">
          LOCANDINA · {dataPunti(e.data)} · {e.nome.toUpperCase()}
        </span>
      </div>
    </CopertinaViva>
  );
}
