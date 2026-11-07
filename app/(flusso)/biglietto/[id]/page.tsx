import type { Metadata } from 'next';
import Link from 'next/link';
import { bigliettoPubblico, type Biglietto } from '@/lib/dati/pubblico';
import { applicaScadenzeIscrizioni } from '@/lib/dati/prevendita';
import { verificaRitornoIscrizione } from '@/lib/pagamento-prevendita';
import { linkPagaBiglietto } from '@/lib/biglietto-email';
import { qrMostrabile, testoLimite } from '@/lib/regole';
import { linkComeArrivare } from '@/lib/luogo';
import { linkSerataPr, linkWhatsAppAmici } from '@/lib/link-serata';
import { emailVereAttive } from '@/lib/posta';
import { lasciaPostoAzione } from '@/app/azioni/prevendita';
import { origineRichiesta } from '@/lib/sessione';
import { headers } from 'next/headers';
import { appleConfigurato, esitoPass, googleConfigurato } from '@/lib/wallet';
import { euro, numeroEvento, ora } from '@/lib/formato';
import { BigliettoQr } from '@/components/biglietto';
import { CampoLink, RicordaBiglietto } from '@/components/client';
import { ModuloRecupero } from '@/components/modulo-recupero';
import { Monogramma } from '@/components/ui';
import { PulsanteMorph } from '@/components/pulsante-morph';
import { PulsantiWallet, type WalletDisponibili } from '@/components/pulsanti-wallet';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Il tuo QR', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string; nuovo?: string; pagato?: string; annullato?: string; errore?: string }> };

/**
 * /biglietto/[ordine_id]?email=… — conferma dopo l'iscrizione e recupero del QR.
 * La prevendita a pagamento mostra il QR solo a pagamento ricevuto: prima c'è "Paga", oppure com'è finita.
 */
export default async function PaginaBiglietto({ params, searchParams }: Props) {
  const { id } = await params;
  const { email, nuovo, pagato, annullato, errore } = await searchParams;
  await applicaScadenzeIscrizioni();
  let b = await bigliettoPubblico(id, email);
  // Di ritorno dal pagamento online: se il webhook non è ancora arrivato si chiede a Stripe e si rilegge.
  if (b && pagato && (b.iscrizione.stato === 'in_attesa' || b.iscrizione.stato === 'scaduta')) {
    await verificaRitornoIscrizione(b, await origineRichiesta());
    b = await bigliettoPubblico(id, email);
  }
  // Il QR (anche barrato, se annullato dopo) c'è solo per chi è stato davvero in lista e non è stato rimborsato.
  const conQr = Boolean(b && qrMostrabile(b.iscrizione));
  const appenaPagato = Boolean(nuovo || pagato);
  // Pulsanti del Wallet: solo se le chiavi ci sono e il biglietto può avere il pass; per primo quello giusto per il telefono (su computer, Apple).
  const ua = (await headers()).get('user-agent') ?? '';
  const passPossibile = Boolean(b && conQr && esitoPass(b).ok);
  const wallet: WalletDisponibili = { apple: passPossibile && appleConfigurato(), google: passPossibile && googleConfigurato(), primaGoogle: /Android/i.test(ua) };
  // "Ti abbiamo mandato il QR a…" è vero solo con le email vere; "Come arrivare" solo se la pagina della serata rivelerebbe il posto.
  const emailVere = emailVereAttive();
  const comeArrivare = b ? linkComeArrivare(b.evento) : null;
  // Il link della serata da girare agli amici: quello del PR, se il biglietto arriva da un PR.
  const origine = b && conQr ? await origineRichiesta() : '';
  const linkAmici = b && conQr ? (b.prHandle ? linkSerataPr(origine, b.evento, b.prHandle) : `${origine.replace(/\/+$/, '')}/e/${b.evento.slug}`) : '';

  return (
    <div className="mm-grana mm-curve flex min-h-dvh flex-col bg-notte bg-[position:-1000px_-80px]">
      <header className="flex h-16 flex-none items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-[10px] no-underline">
          <Monogramma />
          <span className="font-sans text-[11px] font-semibold leading-none tracking-logo">MAREMMA MUSICA</span>
        </Link>
        {b && <span className="font-mono text-[11px] text-osso-2">{numeroEvento(b.evento.numero)}</span>}
      </header>

      {!b ? (
        <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col gap-6 px-4 pb-16 pt-6">
          <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84]">QR non<br />trovato.</h1>
          <p className="m-0 text-[17px] leading-[26px] text-osso-2">Il link è incompleto o l&apos;email non corrisponde. Scrivi l&apos;email con cui ti sei iscritto: ti rimandiamo i tuoi QR.</p>
          <ModuloRecupero email={email ?? ''} />
        </main>
      ) : !conQr ? (
        <SenzaQr b={b} pagato={Boolean(pagato)} annullato={Boolean(annullato)} errore={Boolean(errore)} />
      ) : (
        <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col md:max-w-[960px] md:flex-row md:items-start md:gap-16 md:px-8 md:pt-10">
          <RicordaBiglietto id={b.iscrizione.id} email={b.iscrizione.email} evento={b.evento.nome} data={b.evento.data} nome={`${b.iscrizione.nome} ${b.iscrizione.cognome}`} />
          <div className="flex flex-col md:w-[420px] md:flex-none md:pt-6">
            <section className="flex flex-col gap-[14px] px-4 pb-8 pt-6 md:px-0">
              {appenaPagato ? (
                <>
                  <span className="font-mono text-[11px] leading-none tracking-[.06em] text-ok">{b.iscrizione.importo > 0 ? '✓ PAGATO' : '✓ ISCRIZIONE CONFERMATA'}</span>
                  <h1 className="m-0 font-display text-[96px] font-black uppercase leading-[.82]">
                    {b.iscrizione.importo > 0 ? <>Ci<br /><span className="text-arancio">sei.</span></> : <>Sei<br /><span className="text-arancio">in lista.</span></>}
                  </h1>
                  <p className="m-0 text-[18px] leading-[27px]">
                    Ci vediamo sotto cassa, {b.iscrizione.nome}.{b.evento.dressCode ? ` Dress code: ${b.evento.dressCode.toLowerCase()}.` : ''} {b.evento.senzaTelefono ? 'Serata senza telefono: alla porta porta un documento.' : 'Alla porta mostra questo QR con un documento.'}{testoLimite(b.evento) ? ` ${testoLimite(b.evento)}` : ''}
                  </p>
                  {!b.evento.senzaTelefono && <a href="#qr" className="self-start font-mono text-[12px] leading-4 tracking-[.04em] text-osso-2 underline decoration-arancio underline-offset-4 md:hidden">Vedi il QR ↓</a>}
                </>
              ) : (
                <>
                  <span className="font-mono text-[11px] leading-none tracking-[.06em] text-arancio">✦ IL TUO QR</span>
                  <h1 className="m-0 font-display text-[72px] font-black uppercase leading-[.84]">{b.iscrizione.nome},<br />eccolo.</h1>
                  <p className="m-0 text-[17px] leading-[26px] text-osso-2">Alla porta mostralo con un documento. Luminosità al massimo.{testoLimite(b.evento) ? ` ${testoLimite(b.evento)}` : ''}</p>
                </>
              )}
            </section>
            <section className="hidden flex-col gap-3 md:flex">
              <Azioni id={b.iscrizione.id} email={b.iscrizione.email} nuovo={appenaPagato} senzaTelefono={b.evento.senzaTelefono} wallet={wallet} emailVere={emailVere} comeArrivare={comeArrivare} codice={b.iscrizione.codice} />
            </section>
          </div>

          <div className="flex flex-col">
            <section id="qr" className="flex justify-center px-4 md:px-0"><BigliettoQr b={b} appenaPagato={appenaPagato} /></section>
            <section className="flex flex-col gap-3 px-4 pt-7 md:hidden">
              <Azioni id={b.iscrizione.id} email={b.iscrizione.email} nuovo={appenaPagato} senzaTelefono={b.evento.senzaTelefono} wallet={wallet} emailVere={emailVere} comeArrivare={comeArrivare} codice={b.iscrizione.codice} />
            </section>
            <section className="mx-4 mt-9 flex flex-col gap-[14px] border border-linea bg-notte-2 px-5 py-6 md:mx-0">
              <span className="font-display text-[30px] font-black uppercase leading-[.95]">Porta la tua gente</span>
              <span className="text-[15px] leading-[22px] text-osso-2">
                Manda questo link agli amici{b.prHandle ? `: finiscono anche loro nella lista di ${b.lista}.` : ': si mettono in lista in un minuto.'}
              </span>
              <CampoLink link={b.prHandle ? `/e/${b.evento.slug}/${b.prHandle}` : `/e/${b.evento.slug}`} />
              <a className="mm-btn mm-btn--clip mm-btn--linea mm-btn--pieno" href={linkWhatsAppAmici(b.evento, linkAmici)} target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2Zm0 18.1c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.1 8.1 0 1 1 7.04 3.87Zm4.44-6.07c-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.1 3.64.57.25 1.02.4 1.37.5.58.18 1.1.16 1.52.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" /></svg>
                Manda su WhatsApp
              </a>
            </section>
          </div>
        </main>
      )}

      <footer className="flex justify-between px-4 py-8 font-mono text-[10px] leading-[14px] text-osso-3 md:px-8">
        <span>MAREMMAMUSICA@GMAIL.COM</span><span>@MAREMMA.MUSICA</span>
      </footer>
    </div>
  );
}

/** Prevendita non (ancora) valida: in attesa di pagamento, pagamento in verifica, scaduta, lasciata o da rimborsare. Niente QR. */
function SenzaQr({ b, pagato, annullato, errore }: { b: Biglietto; pagato: boolean; annullato: boolean; errore: boolean }) {
  const i = b.iscrizione;
  const attesa = i.stato === 'in_attesa';
  // Pagato ma la conferma non è ancora arrivata: la pagina si ricarica da sola tra qualche secondo.
  const inVerifica = attesa && pagato;
  const daRimborsare = Boolean(i.pagamentoOnline?.daRimborsare);
  const rimborsato = i.stato === 'rimborsato' || i.pagamentoOnline?.rimborso?.stato === 'fatto';
  const etichetta = daRimborsare ? 'PAGAMENTO DA RESTITUIRE' : rimborsato ? 'RIMBORSATO' : i.stato === 'scaduta' ? 'TEMPO SCADUTO' : 'POSTO LASCIATO';
  const spiega = daRimborsare
    ? 'Il pagamento è arrivato quando il posto non era più tuo: ti restituiamo i soldi sulla stessa carta, non devi fare niente.'
    : rimborsato
      ? (i.metodoPagamento === 'online'
        ? `Ti abbiamo restituito ${euro(i.importo)} sulla carta con cui hai pagato. Il QR non vale più. I tempi dipendono dalla banca: di solito i soldi si vedono entro 5–10 giorni lavorativi.`
        : `Ti abbiamo restituito ${euro(i.importo)}. Il QR non vale più.`)
      : i.stato === 'scaduta' ? 'Il pagamento non è arrivato in tempo e il posto è tornato libero. Se ci sono ancora posti puoi riprovare.'
        : 'Hai lasciato il posto senza pagare. Se ci sono ancora posti puoi riprovare.';
  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col gap-[14px] px-4 pb-16 pt-6">
      {inVerifica && <meta httpEquiv="refresh" content="3" />}
      {attesa && !daRimborsare ? (
        <>
          <span className="font-mono text-[11px] leading-none tracking-[.06em] text-attesa">{inVerifica ? '✦ PAGAMENTO IN VERIFICA' : annullato ? '✕ PAGAMENTO NON COMPLETATO' : '✦ MANCA SOLO IL PAGAMENTO'}</span>
          <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84]">{inVerifica ? <>Un <span className="text-arancio">attimo.</span></> : <>Posto <span className="text-arancio">fermo.</span></>}</h1>
          {inVerifica ? (
            <p className="m-0 text-[17px] leading-[26px]">Stiamo ricevendo la conferma del pagamento: la pagina si aggiorna da sola e ti arriva anche l&apos;email con il QR.</p>
          ) : (
            <>
              <p className="m-0 text-[17px] leading-[26px]">
                {i.nome}, il tuo posto per {b.evento.nome} è tenuto fino alle <strong>{ora(i.scade ?? new Date().toISOString())}</strong>. Paga online <strong>{euro(i.importo)}</strong> e ti arriva subito il QR.
              </p>
              {errore && <p role="alert" className="m-0 border border-stop-testo px-4 py-3 text-[14px] leading-5 text-stop-testo">Non siamo riusciti ad aprire il pagamento. Riprova tra poco.</p>}
              <PulsanteMorph href={linkPagaBiglietto('', i.id, i.email)} esterno className="mm-btn--pieno">
                Paga {euro(i.importo)}
              </PulsanteMorph>
              <span className="text-center font-mono text-[11px] leading-4 text-osso-2">CARTA · APPLE PAY · GOOGLE PAY · SE NON PAGHI IN TEMPO IL POSTO TORNA LIBERO</span>
              <form action={lasciaPostoAzione} className="self-center">
                <input type="hidden" name="id" value={i.id} />
                <input type="hidden" name="email" value={i.email} />
                <button type="submit" className="mm-btn mm-btn--muto">Lascia il posto</button>
              </form>
            </>
          )}
        </>
      ) : (
        <>
          <span className="font-mono text-[11px] leading-none tracking-[.06em] text-stop-testo">✕ {etichetta}</span>
          <h1 className="m-0 font-display text-[56px] font-black uppercase leading-[.86]">{rimborsato ? <>Soldi <span className="text-arancio">restituiti.</span></> : <>Niente <span className="text-arancio">QR.</span></>}</h1>
          <p className="m-0 text-[17px] leading-[26px] text-osso-2">{spiega}</p>
          {!daRimborsare && !rimborsato && (
            <Link href={`/e/${b.evento.slug}${b.prHandle ? `/${b.prHandle}` : ''}`} className="mm-btn mm-btn--clip mm-btn--linea self-start">Torna alla serata</Link>
          )}
        </>
      )}
    </main>
  );
}

const EMAIL_ASSISTENZA = 'maremmamusica@gmail.com';
const secondario = 'mm-btn mm-btn--clip mm-btn--linea min-h-[48px] flex-1 !px-3 text-center !text-[13px] !leading-4 !tracking-[.04em]';

function Azioni({ id, email, nuovo, senzaTelefono, wallet, emailVere, comeArrivare, codice }: { id: string; email: string; nuovo: boolean; senzaTelefono: boolean; wallet: WalletDisponibili; emailVere: boolean; comeArrivare: string | null; codice: string }) {
  const q = `?email=${encodeURIComponent(email)}`;
  return (
    <>
      {nuovo && (emailVere
        ? <span className="text-[14px] leading-5 text-osso-2">{senzaTelefono ? 'Ti abbiamo mandato la conferma a' : 'Ti abbiamo mandato il QR a'} <span className="text-osso">{email}</span>.</span>
        : !senzaTelefono && <span className="text-[14px] leading-5 text-osso-2">Salva il PDF o fai uno screenshot del QR.</span>)}
      {!senzaTelefono && <a className="mm-btn mm-btn--primario mm-btn--pieno" href={`/api/biglietto/${id}/pdf${q}`} target="_blank" rel="noopener">Scarica PDF</a>}
      <PulsantiWallet id={id} query={q} wallet={wallet} />
      <div className="flex gap-3">
        <a className={secondario} href={`/api/biglietto/${id}/calendario${q}`}>Aggiungi al calendario</a>
        {comeArrivare && <a className={secondario} href={comeArrivare} target="_blank" rel="noopener noreferrer">Come arrivare</a>}
      </div>
      <a className="self-center font-mono text-[11px] leading-4 text-osso-2 hover:text-osso" href={`mailto:${EMAIL_ASSISTENZA}?subject=${encodeURIComponent(`Dati sbagliati sul biglietto ${codice}`)}`}>Dati sbagliati? <span className="underline decoration-arancio underline-offset-4">Scrivici</span></a>
    </>
  );
}
