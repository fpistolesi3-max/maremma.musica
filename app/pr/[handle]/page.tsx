import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sessioneCorrente } from '@/lib/sessione';
import { eventiPubblici, prValido } from '@/lib/dati/pubblico';
import { serateDelPr, totaliPr } from '@/lib/dati/area-pr';
import { tavoliDelPr } from '@/lib/dati/tavoli';
import { modoPagamentoTavoli } from '@/lib/pagamenti';
import { linkPagamento, quandoScade } from '@/lib/tavolo-email';
import { AzioniPrenotazione } from '@/components/tavoli-azioni';
import { chipLista, isAttiva } from '@/lib/regole';
import { dataPunti, euro, giorno2, giornoSett, meseCorto, numeroEvento, orari, quandoRelativo } from '@/lib/formato';
import { luogoTesto } from '@/lib/luogo';
import { CampoLink } from '@/components/client';
import { CondividiLink, ListaPr, MandaLinkPagamento } from '@/components/area-pr-client';
import { CampoLista, Monogramma } from '@/components/ui';
import { Locandina } from '@/components/evento';
import { esci } from '@/app/azioni/accesso';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ serata?: string; tavolo?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pr = await prValido((await params).handle);
  return { title: pr ? `Lista: ${pr.nomeDisplay}` : 'Lista non trovata', robots: { index: false } };
}

/**
 * /pr/[handle]
 * - per chi apre il link del PR: le prossime serate, tutte con la Lista del PR già bloccata;
 * - per il PR che ha fatto l'accesso: la sua area (link, lista personale, totali, classifica).
 */
export default async function PaginaPr({ params, searchParams }: Props) {
  const { handle } = await params;
  const pr = await prValido(handle);
  if (!pr) notFound();
  const s = await sessioneCorrente();
  const { serata, tavolo } = await searchParams;
  if (s?.utente.ruolo === 'pr' && s.pr?.id === pr.id) return <AreaPr sessioneHandle={pr.handle} serataScelta={serata} nuovoTavolo={tavolo} />;
  return <LinkGenerico handle={pr.handle} nome={pr.nomeDisplay} />;
}

async function LinkGenerico({ handle, nome }: { handle: string; nome: string }) {
  const { prossimi } = await eventiPubblici();
  return (
    <div className="mm-grana flex min-h-dvh flex-col">
      <header className="flex h-16 items-center gap-[10px] border-b border-linea px-4 md:px-10">
        <Link href="/" className="flex flex-grow items-center gap-[10px] no-underline"><Monogramma /><span className="font-sans text-[11px] font-semibold tracking-logo">MAREMMA MUSICA</span></Link>
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 pb-16 pt-8">
        <div className="flex flex-col gap-4">
          <span className="font-mono text-[11px] tracking-[.06em] text-arancio">✦ PROSSIME DATE</span>
          <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84] md:text-[88px]">Scegli<br />la serata.</h1>
          <CampoLista nome={nome} ufficiale={false} nota={`Sei entrato dal link di ${nome}: resti nella sua lista.`} />
        </div>
        <div className="flex flex-col">
          {prossimi.map(({ evento: e, stato }, i) => {
            const chip = chipLista(stato, true);
            return (
              <Link key={e.id} href={`/e/${e.slug}/${handle}`} className={`mm-riga-data grid grid-cols-[84px_minmax(0,1fr)] gap-4 border-t border-linea py-5 text-osso no-underline hover:text-osso ${i === prossimi.length - 1 ? 'border-b' : ''}`}>
                <Locandina e={e} className="h-[126px] w-[84px]" />
                <div className="flex min-w-0 flex-col gap-[6px]">
                  <span className="font-mono text-[10px] text-osso-2">{giornoSett(e.data)} · {numeroEvento(e.numero)}</span>
                  <span className="font-display text-[40px] font-black uppercase leading-[.86]">{giorno2(e.data)} <span className="text-arancio">{meseCorto(e.data)}</span></span>
                  <span className="font-display text-[20px] font-extrabold uppercase leading-[1.05]">{e.nome}</span>
                  <span className="font-mono text-[11px] leading-4 text-osso-2">{luogoTesto(e)} · {orari(e.data, e.dataFine)}</span>
                  <span className={`${chip.classe} mt-1 self-start`}>{chip.testo}</span>
                </div>
              </Link>
            );
          })}
          {prossimi.length === 0 && <p className="border-y border-linea py-6 text-osso-2">Nessuna serata in calendario, per ora.</p>}
        </div>
      </main>
    </div>
  );
}

/** `nuovoTavolo`: id della richiesta appena inserita dal PR per un cliente, da confermare a schermo. */
async function AreaPr({ sessioneHandle, serataScelta, nuovoTavolo }: { sessioneHandle: string; serataScelta?: string; nuovoTavolo?: string }) {
  const s = (await sessioneCorrente())!;
  const pr = s.pr!;
  const serate = await serateDelPr(s);
  const totali = await totaliPr(s);
  const serata = serate.find((x) => x.evento.slug === serataScelta) ?? serate[0];
  const iniziali = pr.nomeDisplay.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const max = serata ? Math.max(1, ...serata.perGiorno.map((g) => g.n)) : 1;
  const inLista = serata ? serata.mie.filter(isAttiva).length : 0;
  const primo = serata?.classifica[0];
  const mio = serata?.classifica.find((r) => r.sonoIo);
  const GIORNI = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
  const tavoli = serata ? await tavoliDelPr(s, serata.evento.id) : null;
  // I tavoli si pagano con Stripe: finché il pagamento online non è attivo non si prenotano.
  const tavoliOnline = modoPagamentoTavoli() !== null;
  const appena = nuovoTavolo ? tavoli?.mie.find((v) => v.prenotazione.id === nuovoTavolo && v.prenotazione.stato === 'in_attesa') : undefined;

  return (
    <div className="mm-grana flex min-h-dvh flex-col">
      <header className="flex h-16 flex-none items-center gap-[10px] border-b border-linea px-4 md:px-10">
        <Link href="/" aria-label="Sito Maremma Musica"><Monogramma /></Link>
        <span className="flex-grow font-sans text-[11px] font-semibold leading-none tracking-logo">AREA PR</span>
        <form action={esci}><button type="submit" className="mm-btn mm-btn--muto" style={{ minHeight: 40 }}>Esci</button></form>
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full border border-linea-forte bg-notte-3 font-display text-[16px] font-black">{iniziali}</span>
      </header>

      <main className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-x-12 px-4 pb-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-10">
        <div className="flex flex-col">
          <section className="flex flex-col gap-[10px] pb-6 pt-7">
            <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84] md:text-[88px]">Ciao,<br />{pr.nomeDisplay.split(' ')[0]}.</h1>
            <span className="font-mono text-[11px] leading-4 text-osso-2">LISTA: {pr.nomeDisplay.toUpperCase()} · {totali.iscritti} ISCRITTI IN {totali.serate} SERATE · {totali.entrati} ENTRATI</span>
          </section>

          {serate.length > 1 && (
            <nav aria-label="Serate" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-4">
              {serate.map((x) => (
                <Link key={x.evento.id} href={`/pr/${sessioneHandle}?serata=${x.evento.slug}`}
                  className={`mm-chip flex-none no-underline ${x.evento.id === serata?.evento.id ? 'mm-chip--lista' : 'mm-chip--libero'}`}>
                  {dataPunti(x.evento.data)} {x.evento.nome}
                </Link>
              ))}
            </nav>
          )}

          {serata ? (
            <section className="flex flex-col border border-linea bg-notte-2">
              <div className="flex flex-col gap-[6px] px-5 pb-4 pt-5">
                <span className="font-mono text-[11px] leading-[14px] text-arancio">✦ {serata === serate[0] ? 'PROSSIMA' : 'SERATA'} · {giornoSett(serata.evento.data)} {dataPunti(serata.evento.data)} · {numeroEvento(serata.evento.numero)}</span>
                <span className="font-display text-[40px] font-black uppercase leading-[.9]">{serata.evento.nome}</span>
                <span className="font-mono text-[11px] leading-4 text-osso-2">{luogoTesto(serata.evento).toUpperCase()} · {serata.evento.prezzoLista ? `LISTA ${euro(serata.evento.prezzoLista)} ALLA PORTA` : 'INGRESSO LIBERO'}</span>
              </div>
              <div className="grid grid-cols-3 border-t border-linea">
                <Stat valore={String(inLista)} etichetta="In lista" />
                <Stat valore={`+${serata.oggi}`} etichetta="Oggi" arancio bordo />
                <Stat valore={serata.posizione ? `${serata.posizione}ª` : '—'} etichetta="In classifica" bordo />
              </div>
              <div className="flex flex-col gap-[10px] border-t border-linea px-5 pb-5 pt-4">
                <span className="text-[11px] font-semibold leading-[14px] tracking-[.12em] text-osso-2">ISCRITTI AL GIORNO · ULTIMI 7</span>
                <div className="grid h-[72px] grid-cols-7 items-end gap-2" role="img" aria-label={serata.perGiorno.map((g) => `${g.n}`).join(', ')}>
                  {serata.perGiorno.map((g, i) => (
                    <div key={g.giorno} style={{ height: `${Math.max(4, (g.n / max) * 100)}%` }} className={i === 6 ? 'bg-arancio' : 'bg-barra'} title={`${g.n}`} />
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2 text-center font-mono text-[10px] leading-3 text-osso-3">
                  {serata.perGiorno.map((g, i) => <span key={g.giorno} className={i === 6 ? 'text-arancio' : ''}>{i === 6 ? 'OGGI' : GIORNI[new Date(`${g.giorno}T12:00:00`).getDay()]}</span>)}
                </div>
              </div>
            </section>
          ) : (
            <p className="border border-linea bg-notte-2 p-5 text-osso-2">Nessuna serata in calendario per la tua lista.</p>
          )}

          {serata && (
            <section className="flex flex-col gap-[14px] pt-8">
              <h2 className="m-0 font-display text-[36px] font-black uppercase leading-[.9]">Il tuo link</h2>
              <CampoLink link={`/e/${serata.evento.slug}/${pr.handle}`} />
              <CondividiLink link={`/e/${serata.evento.slug}/${pr.handle}`} testo={`${serata.evento.nome} ${dataPunti(serata.evento.data)}: mettiti nella mia lista`} />
              <span className="text-[14px] leading-5 text-osso-2">Chi apre questo link trova &quot;Lista: {pr.nomeDisplay}&quot; già scritto e bloccato. Ogni iscrizione conta per te.</span>
            </section>
          )}
        </div>

        <div className="flex flex-col">
          {serata && (
            <section className="flex flex-col gap-[14px] pt-9 md:pt-7">
              <div className="flex items-end justify-between">
                <h2 className="m-0 font-display text-[36px] font-black uppercase leading-[.9]">La tua lista</h2>
                <span className="font-mono text-[11px] text-osso-2">{inLista} NOMI</span>
              </div>
              <ListaPr righe={serata.mie.map((i) => ({
                id: i.id, nome: `${i.nome} ${i.cognome}`, quando: quandoRelativo(i.createdAt), stato: i.stato,
                daPagare: i.stato === 'in_lista' && i.importo > 0, pagatoAlPr: i.stato === 'pagato' && i.metodoPagamento === 'pr' && !i.consegnaId,
              }))} />
              <span className="text-[13px] leading-5 text-osso-3">&quot;Ha pagato&quot; se ti ha già dato i soldi: alla porta risulterà pagato.</span>
              {(serata.soldi.daConsegnare > 0 || serata.soldi.consegnato > 0) && (
                <div className="flex items-center justify-between gap-4 border border-linea bg-notte-2 px-4 py-3">
                  <span className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold tracking-[.12em] text-osso-2">DA CONSEGNARE ALLA CREW</span>
                    <span className={`font-display text-[32px] font-black leading-none ${serata.soldi.daConsegnare ? 'text-attesa' : ''}`}>{euro(serata.soldi.daConsegnare)}</span>
                  </span>
                  <span className="text-right font-mono text-[11px] leading-4 text-ok">GIÀ CONSEGNATI<br />{euro(serata.soldi.consegnato)}</span>
                </div>
              )}
            </section>
          )}

          {serata && tavoli && (tavoli.affidati > 0 || tavoli.mie.length > 0) && (
            <section id="tavoli" className="flex scroll-mt-4 flex-col gap-[14px] pt-8">
              <div className="flex items-end justify-between">
                <h2 className="m-0 font-display text-[36px] font-black uppercase leading-[.9]">Tavoli</h2>
                <span className="font-mono text-[11px] text-osso-2">{tavoli.liberi} LIBERI SU {tavoli.affidati}</span>
              </div>
              {appena && (
                <p role="status" className="m-0 border border-ok px-4 py-3 text-[14px] leading-5 text-ok">
                  ✓ Richiesta inserita: tavolo {appena.tavolo.nome} per {appena.prenotazione.nome} {appena.prenotazione.cognome}, fermo fino a {quandoScade(appena.prenotazione.scade)}. Al cliente arriva l&apos;email con il link.
                </p>
              )}
              {tavoli.aperte && tavoliOnline && tavoli.liberi > 0 && <Link href={`/tavoli/${serata.evento.slug}`} className="mm-btn mm-btn--linea self-start">Prenota per un cliente</Link>}
              {tavoli.aperte && tavoliOnline ? (
                <>
                  <span className="text-[14px] leading-5 text-osso-2">{tavoli.liberi > 0 ? 'Oppure manda questo link' : 'Manda questo link'}: chi prenota da qui finisce nei tuoi tavoli.</span>
                  <CampoLink link={`/tavoli/${serata.evento.slug}?pr=${pr.handle}`} />
                </>
              ) : <span className="text-[14px] leading-5 text-osso-2">{tavoli.aperte ? 'La prenotazione online dei tavoli non è ancora attiva.' : 'La serata è iniziata: i tavoli non si chiedono più dal sito.'}</span>}
              <div className="flex flex-col">
                {tavoli.mie.map((v) => {
                  const p = v.prenotazione;
                  const chip = { in_attesa: ['mm-chip--incassare', 'In attesa di pagamento'], confermata: ['mm-chip--entrato', 'Pagato'], annullata: ['mm-chip--annullato', 'Annullata'], rimborsata: ['mm-chip--annullato', 'Rimborsata'], scaduta: ['mm-chip--annullato', 'Scaduta'] }[p.stato];
                  return (
                    <div key={p.id} className="flex flex-col gap-2 border-t border-linea py-4 last:border-b">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-display text-[24px] font-extrabold uppercase leading-none">{v.tavolo.nome}</span>
                        <span className={`mm-chip ${chip[0]}`}>{chip[1]}</span>
                        <span className="flex-grow text-right font-display text-[22px] font-extrabold leading-none">{euro(p.spesaMinima)}</span>
                      </div>
                      <span className="font-mono text-[11px] leading-4 text-osso-2">
                        {`${p.nome} ${p.cognome}`.toUpperCase()} · {p.persone} PERSONE · {p.telefono}{p.stato === 'in_attesa' ? ` · DECADE ${quandoScade(p.scade).toUpperCase()}` : ''}
                      </span>
                      {/* Richiesta fermata dal PR con il pagamento online: può rimandare il link al cliente. */}
                      {p.stato === 'in_attesa' && p.pagamentoOnline && p.inseritaDa === 'pr' && (
                        <MandaLinkPagamento link={linkPagamento('', p.id, p.email)} telefono={p.telefono}
                          testo={`Ciao ${p.nome}, ti ho fermato il tavolo ${v.tavolo.nome} per ${serata.evento.nome}: paga qui ${euro(p.spesaMinima)} entro ${quandoScade(p.scade)} e ti arriva il QR.`} />
                      )}
                      {p.stato === 'in_attesa' && <AzioniPrenotazione id={p.id} nome={`${p.nome} ${p.cognome}`} conferma={false} />}
                    </div>
                  );
                })}
              </div>
              <span className="text-[13px] leading-5 text-osso-3">Il cliente paga online: appena paga, il tavolo è confermato e il QR arriva per email. I soldi non passano da te. Se non paga in tempo il tavolo torna libero.</span>
            </section>
          )}

          {serata && (
            <section className="flex flex-col gap-[14px] pt-8">
              <h2 className="m-0 font-display text-[36px] font-black uppercase leading-[.9]">Classifica</h2>
              <div className="mm-scroll">
                <table className="mm-classifica">
                  <thead><tr><th>#</th><th>PR</th><th className="mm-num">Lista</th><th className="mm-num">Entrati</th></tr></thead>
                  <tbody>
                    {serata.classifica.map((r, i) => (
                      <tr key={r.prId ?? 'mm'} className={r.sonoIo ? 'mm-tu' : undefined}>
                        <td className="mm-classifica__pos">{i + 1}</td>
                        <td><span className="mm-classifica__nome">{r.nome}</span>{r.sonoIo && <span className="mm-classifica__tu">TU</span>}</td>
                        <td className="mm-num">{r.inLista}</td>
                        <td className="mm-num">{r.entrati}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className="text-[14px] leading-5 text-osso-2">
                {mio && primo && !mio.sonoIo && primo !== mio ? `Ti mancano ${primo.inLista - mio.inLista + 1} iscritti per il primo posto.` : mio && primo === mio ? 'Sei primo. Tieni duro.' : ''}
              </span>
            </section>
          )}
        </div>
      </main>

      <footer className="mt-auto flex flex-col gap-2 border-t border-linea px-4 py-8 md:px-10">
        <span className="text-[11px] font-semibold leading-[14px] tracking-[.12em] text-osso-2">LINK PER TUTTE LE SERATE</span>
        <div className="max-w-[520px]"><CampoLink link={`/pr/${pr.handle}`} /></div>
      </footer>
    </div>
  );
}

function Stat({ valore, etichetta, arancio, bordo }: { valore: string; etichetta: string; arancio?: boolean; bordo?: boolean }) {
  return (
    <div className={`flex flex-col gap-[6px] px-5 py-4 ${bordo ? 'border-l border-linea' : ''}`}>
      <span className={`font-display text-[44px] font-black leading-[.9] ${arancio ? 'text-arancio' : ''}`}>{valore}</span>
      <span className="text-[11px] font-semibold leading-[14px] tracking-[.12em] text-osso-2">{etichetta.toUpperCase()}</span>
    </div>
  );
}
