import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eventoPerSlug, locationVisibile, usatiPerLotto } from '@/lib/dati/pubblico';
import { leggi } from '@/lib/dati/archivio';
import { tavoliPubblici } from '@/lib/dati/tavoli';
import { chipLista, prezzoDaTipi, testoPrezzoTipi, tipiVista } from '@/lib/regole';
import { dataPunti, esceTra, euro, giornoSett, giornoSettLungo, meseCorto, meseLungo, numeroEvento, orari, giorno2 } from '@/lib/formato';
import { BottoneLista, Locandina, PuoIscriversi } from '@/components/evento';
import { Disco, Freccia } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ep = await eventoPerSlug((await params).slug);
  if (!ep) return { title: 'Serata non trovata' };
  const e = ep.evento;
  return {
    title: `${e.nome} · ${dataPunti(e.data)}`,
    description: [e.highlight, e.dressCode && `Dress code ${e.dressCode.toLowerCase()}`, 'Mettiti in lista, il QR arriva subito.'].filter(Boolean).join('. '),
    openGraph: e.locandinaUrl ? { images: [e.locandinaUrl] } : undefined,
  };
}

export default async function PaginaEvento({ params }: Props) {
  const ep = await eventoPerSlug((await params).slug);
  if (!ep) notFound();
  const e = ep.evento;
  const visibile = locationVisibile(e);
  const coordinate = visibile && e.lat != null && e.lng != null ? `${e.lat.toFixed(4)} N ${e.lng.toFixed(4)} E` : null;
  const maps = visibile && (e.lat != null ? `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}` : e.location || e.comune ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.location, e.comune].filter(Boolean).join(', '))}` : null);
  const usati = usatiPerLotto(await leggi(), e.id);
  const chip = chipLista(ep.stato);
  const tipi = tipiVista(e, ep.lotti, usati, {});
  const prezzo = ep.stato.tipo === 'aperta' ? euro(ep.stato.prezzo) : ep.stato.tipo === 'libero' ? 'Libero' : ep.lotti.length ? testoPrezzoTipi(prezzoDaTipi(ep.lotti)) : e.prezzoLista ? euro(e.prezzoLista) : 'Libero';
  const puo = PuoIscriversi(ep.stato);
  const tavoli = (await tavoliPubblici(e.slug))?.tavoli ?? [];
  const tavoliLiberi = tavoli.filter((t) => t.libero);

  const domande = [
    ...(e.highlight?.toLowerCase().includes('premio') ? [{ d: `Come si vince il ${e.highlight.toLowerCase().replace(/ alla.*$/, '')}?`, r: 'Regolamento in arrivo: chi vota, a che ora si premia e come si ritira il premio.' /* TODO: cliente — regolamento premio */ }] : []),
    { d: 'Ho perso il QR, come lo recupero?', r: 'Vai su “Il mio QR” e scrivi l’email che hai usato per iscriverti: ti rimandiamo il link al biglietto. Alla porta basta anche il codice di 8 caratteri scritto sotto il QR.' },
    { d: 'Devo stampare il QR?', r: 'No, basta mostrarlo dal telefono con la luminosità al massimo. Porta un documento: il nome deve combaciare con il QR.' },
    { d: 'Come si paga?', r: e.tipoIngresso === 'libero' ? 'L’ingresso è libero: il QR serve solo a passare prima.'
      : `Prevendita online: ${prezzo}, con carta, Apple Pay o Google Pay. Il QR arriva subito dopo il pagamento. ${e.cassaAttiva ? `Senza prevendita si entra pagando in cassa: ${euro(e.prezzoCassa ?? e.prezzoLista)}.` : 'Ingresso solo in prevendita: alla porta non si vendono ingressi.'}` },
    ...(e.dressCode ? [{ d: `Devo per forza venire ${e.dressCode.toLowerCase()}?`, r: `Il dress code della serata è ${e.dressCode.toLowerCase()}: vieni a tema, è metà della festa.` /* TODO: cliente — regola dress code alla porta */ }] : []),
  ];

  return (
    <div className="pb-24 md:pb-0">
      <div className="contenitore flex justify-between border-b border-linea font-mono text-[11px] tracking-[.04em] md:text-[12px]">
        <Link href="/eventi" className="py-3 text-osso-2 no-underline">← TUTTE LE DATE</Link>
        <span className="py-3 text-osso-3">{numeroEvento(e.numero)}{coordinate ? ` · ${coordinate}` : ''}</span>
      </div>

      <section className="contenitore flex flex-col gap-8 pb-10 pt-5 md:flex-row md:items-start md:gap-12 md:pb-24 md:pt-8 xl:gap-24">
        <div className="relative h-[520px] w-full overflow-hidden md:h-[820px] md:w-[520px] md:flex-none md:overflow-visible">
          <Disco className="absolute left-[130px] top-0 h-[280px] w-[280px] md:left-[150px] md:h-[440px] md:w-[440px]" etichetta={['MAREMMA<br>MUSICA', `LATO A<br>${numeroEvento(e.numero)}`]} />
          <Locandina e={e} className="absolute left-0 top-[50px] h-[470px] w-[313px] shadow-pannello md:top-[60px] md:h-[760px] md:w-[506px]"
            alt={`Locandina: ${e.nome}, ${dataPunti(e.data)}${e.highlight ? ` — ${e.highlight}` : ''}`} />
        </div>

        <div className="flex min-w-0 flex-grow flex-col gap-8 md:gap-10 md:pt-4">
          <div className="flex flex-col gap-[14px] md:gap-[18px]">
            <span className="font-mono text-[11px] leading-none tracking-[.06em] text-arancio md:text-[12px]">✦ {giornoSett(e.data)} {giorno2(e.data)} {meseCorto(e.data).toUpperCase()} · {orari(e.data, e.dataFine)}</span>
            <h1 className="m-0 font-display text-[min(84px,19vw)] font-black uppercase leading-[.84] md:text-[96px] xl:text-[128px]">{e.nome}</h1>
            <span className="font-mono text-[11px] leading-4 text-osso-2 md:text-[13px] md:leading-[18px]">{numeroEvento(e.numero)}{e.dressCode ? ` · DRESS CODE ${e.dressCode.toUpperCase()}` : ''}</span>
          </div>

          {e.descrizione && <p className="m-0 max-w-[640px] text-[17px] leading-[26px] md:text-[18px] md:leading-7">{e.descrizione}</p>}

          <div className="flex flex-col">
            <span className="etichetta pb-[10px] md:pb-3">La serata</span>
            {e.highlight && (
              <Riga grande={<span className="text-arancio">{e.highlight.match(/\d[\d.,]*\s?€/)?.[0] ?? e.highlight}</span>} piccolo={<span className="text-arancio">{e.highlight.replace(/\d[\d.,]*\s?€\s?/, '').toUpperCase()}</span>} />
            )}
            {e.dressCode && <Riga grande={e.dressCode} piccolo="DRESS CODE" />}
            <Riga grande="Line-up" piccolo={e.lineup.length ? e.lineup.join(' · ').toUpperCase() : 'IN ARRIVO'} ultima />
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-7 md:gap-x-10 md:gap-y-8">
            <Info titolo="Quando" valore={`${giorno2(e.data)} ${meseLungo(e.data)}`} nota={<span className="font-mono text-[11px] leading-4 md:text-[13px]">{giornoSettLungo(e.data)} · {orari(e.data, e.dataFine)}</span>} />
            <Info titolo="Ingresso" valore={prezzo} nota={e.tipoIngresso === 'libero' ? 'Ingresso libero. Col QR passi prima.'
              : e.cassaAttiva ? `Prevendita online. Prezzo in cassa ${euro(e.prezzoCassa ?? e.prezzoLista)}.` : 'Ingresso solo in prevendita: alla porta non si paga.'} />
            <Info largo titolo="Dove" valore={visibile ? e.location || e.comune || 'In arrivo' : 'Location segreta'}
              nota={<span className="font-mono text-[11px] leading-4 md:text-[13px]">{visibile ? [e.location && e.comune, coordinate].filter(Boolean).join(' · ') || 'Te la diciamo presto' : 'Svelata 48 ore prima'}</span>} />
            <Info largo titolo="Età" valore={e.etaMinima > 0 ? `${e.etaMinima}+` : 'Per tutti'} nota={e.senzaTelefono ? 'Serata senza telefono: alla porta serve un documento con lo stesso nome e la stessa data di nascita.' : 'Porta un documento: il nome deve combaciare con il QR.'} />
          </div>

          {(tipi.length > 1 || tipi.some((t) => t.lotto.categoria)) && (
            <div className="flex flex-col">
              <span className="etichetta pb-3">Prevendite</span>
              {tipi.map((t) => {
                const attivo = t.stato === 'in_vendita';
                const l = t.lotto;
                const nota = t.stato === 'esaurito' ? 'esaurito' : t.stato === 'chiuso' ? 'chiuso'
                  : t.stato === 'presto' ? `${esceTra(t.dal!)} · ${euro(l.prezzo)}`
                  : t.stato === 'dopo_precedente' ? `esce quando finisce la precedente · ${euro(l.prezzo)}`
                  : `in vendita ora · ${euro(l.prezzo)} online`;
                return (
                  <div key={l.id} className="flex items-baseline justify-between gap-4 border-t border-linea py-3 last:border-b">
                    <span className={`font-display text-[22px] font-extrabold uppercase ${attivo ? 'text-osso' : 'text-osso-2'} ${t.stato === 'esaurito' || t.stato === 'chiuso' ? 'line-through' : ''}`}>
                      {l.nome}{l.categoria && l.categoria !== l.nome && <small className="ml-2 font-mono text-[11px] font-normal">{l.categoria.toUpperCase()}</small>}
                    </span>
                    <span className="dato text-right text-osso-2"><span className={attivo ? 'text-arancio' : ''}>{nota}</span></span>
                  </div>
                );
              })}
              {tipi.some((t) => t.lotto.categoria) && <span className="pt-3 text-[13px] leading-5 text-osso-2">Le prevendite con una categoria (es. Donne) sono riservate: alla porta si controlla il documento.</span>}
            </div>
          )}

          {tavoli.length > 0 && (
            <div className="flex flex-col gap-4 border border-linea bg-notte-2 px-5 py-5 md:flex-row md:items-center md:gap-7 md:px-8 md:py-7">
              <div className="flex flex-grow flex-col gap-2">
                <span className="font-display text-[32px] font-black uppercase leading-none">Tavoli</span>
                <span className="text-[15px] leading-[22px] text-osso-2">
                  {tavoliLiberi.length > 0
                    ? `${tavoliLiberi.length} ${tavoliLiberi.length === 1 ? 'libero' : 'liberi'}, spesa minima da ${euro(Math.min(...tavoliLiberi.map((t) => t.spesaMinima)))}. Scegli il tuo sulla mappa.`
                    : 'Tutti presi, per ora. Se una prenotazione decade il tavolo torna libero.'}
                </span>
              </div>
              <Link href={`/tavoli/${e.slug}`} className="mm-btn mm-btn--clip mm-btn--linea flex-none" style={{ minHeight: 52 }}>{tavoliLiberi.length > 0 ? 'Prenota un tavolo' : 'Vedi i tavoli'} <Freccia /></Link>
            </div>
          )}

          <div className="hidden items-center gap-7 border border-linea bg-notte-2 px-8 py-7 md:flex">
            <div className="flex flex-grow flex-col gap-2">
              <span className="font-display text-[32px] font-black uppercase leading-none">{chip.testo}</span>
              <span className="text-[15px] leading-[22px] text-osso-2">{puo ? 'Nome, cognome, data di nascita. Il QR arriva subito, anche per email.' : 'Segui Instagram per sapere quando si apre.'}</span>
            </div>
            <BottoneLista ep={ep} className="flex-none" style={{ minHeight: 60, padding: '0 32px', fontSize: 16 }} />
          </div>
        </div>
      </section>

      {/* COME ARRIVARE */}
      <section className="contenitore grid gap-4 pb-10 md:grid-cols-[520px_minmax(0,1fr)] md:gap-12 md:pb-24 xl:gap-24">
        <div className="flex flex-col gap-4 md:gap-5">
          <h2 className="m-0 font-display text-[48px] font-black uppercase leading-[.86] md:text-[72px]">Come<br className="hidden md:block" /> arrivare</h2>
          <p className="m-0 text-[16px] leading-6 text-osso-2 md:text-[17px] md:leading-[26px]">
            {visibile ? (e.infoArrivo ?? 'Parcheggio e navetta: te li diciamo qui appena confermati.') : 'La location è segreta: la trovi qui 48 ore prima della serata.'}
          </p>
          {maps && <a href={maps} className="link-sottolineato self-start py-3" target="_blank" rel="noopener noreferrer">Apri in Maps →</a>}
        </div>
        {/* Mappa segnaposto: niente mappe esterne (il sito deve funzionare anche offline). */}
        <div className="mm-curve relative h-[220px] border border-linea bg-[#0a0d11] bg-[position:-900px_-260px] md:h-[360px]">
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[10px]">
            <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-arancio md:h-14 md:w-14"><div className="h-[10px] w-[10px] rounded-full bg-arancio md:h-3 md:w-3" /></div>
            <span className="bg-notte px-2 py-[5px] font-mono text-[11px] leading-[14px] md:text-[12px]">{coordinate ?? (visibile ? (e.comune ?? 'LOCATION IN ARRIVO').toUpperCase() : 'LOCATION SEGRETA')}</span>
          </div>
          <span className="absolute bottom-[14px] left-4 font-mono text-[10px] leading-[14px] text-osso-3">MAPPA · SEGNAPOSTO</span>
        </div>
      </section>

      {/* DOMANDE */}
      <section className="contenitore grid gap-4 pb-14 md:grid-cols-[520px_minmax(0,1fr)] md:gap-12 md:pb-[120px] xl:gap-24">
        <h2 className="m-0 font-display text-[48px] font-black uppercase leading-[.86] md:text-[72px]">Domande</h2>
        <div className="flex flex-col">
          {domande.map((q, i) => (
            <details key={q.d} className={`group border-t border-linea py-[18px] md:py-6 ${i === domande.length - 1 ? 'border-b' : ''}`} open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="text-[17px] font-semibold leading-6 md:text-[20px] md:leading-7">{q.d}</span>
                <span className="font-mono text-[18px] text-osso-2 group-open:text-arancio md:text-[20px]" aria-hidden="true"><span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span></span>
              </summary>
              <p className="m-0 mt-[10px] max-w-[620px] text-[15px] leading-[22px] text-osso-2 md:mt-3 md:text-[16px] md:leading-6">{q.r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Barra fissa in basso su telefono */}
      <div className={`fixed inset-x-0 bottom-0 z-20 flex items-center border-t ${tavoli.length > 0 ? 'gap-2' : 'gap-[14px]'} border-linea bg-notte px-4 pt-3 md:hidden`} style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="whitespace-nowrap font-display text-[24px] font-black uppercase leading-none">{giorno2(e.data)} {meseCorto(e.data)}</span>
          <span className="truncate font-mono text-[10px] leading-[14px] text-osso-2">{e.nome.toUpperCase()}</span>
        </div>
        {/* Su telefono le due strade stanno qui, una accanto all'altra. */}
        {tavoli.length > 0 && <Link href={`/tavoli/${e.slug}`} className="mm-btn mm-btn--clip mm-btn--linea flex-none" style={{ minHeight: 52, padding: '0 12px', fontSize: 13 }}>Tavolo <Freccia /></Link>}
        <BottoneLista ep={ep} className="flex-none" style={{ minHeight: 52, padding: tavoli.length > 0 ? '0 12px' : '0 16px', fontSize: tavoli.length > 0 ? 13 : undefined }} />
      </div>
    </div>
  );
}

function Riga({ grande, piccolo, ultima }: { grande: React.ReactNode; piccolo: React.ReactNode; ultima?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-t border-linea py-[14px] md:py-4 ${ultima ? 'border-b' : ''}`}>
      <span className="font-display text-[32px] font-black uppercase leading-none md:text-[44px]">{grande}</span>
      <span className="text-right font-mono text-[10px] leading-[14px] text-osso-2 md:text-[11px]">{piccolo}</span>
    </div>
  );
}

function Info({ titolo, valore, nota, largo }: { titolo: string; valore: string; nota: React.ReactNode; largo?: boolean }) {
  return (
    <div className={`flex flex-col gap-[6px] md:gap-2 ${largo ? 'col-span-2 md:col-span-1' : ''}`}>
      <span className="etichetta text-[11px] md:text-[12px]">{titolo}</span>
      <span className="font-display text-[22px] font-extrabold uppercase leading-none md:text-[28px]">{valore}</span>
      <span className="text-[14px] leading-5 text-osso-2 md:text-[16px] md:leading-[22px]">{nota}</span>
    </div>
  );
}

