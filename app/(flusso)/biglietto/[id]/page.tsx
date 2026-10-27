import type { Metadata } from 'next';
import Link from 'next/link';
import { bigliettoPubblico, type Biglietto } from '@/lib/dati/pubblico';
import { applicaScadenzeIscrizioni } from '@/lib/dati/prevendita';
import { verificaRitornoIscrizione } from '@/lib/pagamento-prevendita';
import { linkPagaBiglietto, testoCassa } from '@/lib/biglietto-email';
import { lasciaPostoAzione } from '@/app/azioni/prevendita';
import { origineRichiesta } from '@/lib/sessione';
import { isAttiva } from '@/lib/regole';
import { euro, numeroEvento, ora } from '@/lib/formato';
import { BigliettoQr } from '@/components/biglietto';
import { CampoLink, RicordaBiglietto } from '@/components/client';
import { ModuloRecupero } from '@/components/modulo-recupero';
import { Monogramma } from '@/components/ui';

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
  // Il QR (anche barrato, se annullato dopo) c'è solo per chi è stato davvero in lista: pagato, gratis o entrato.
  const conQr = Boolean(b && (isAttiva(b.iscrizione) || b.iscrizione.metodoPagamento || (b.iscrizione.stato === 'annullato' && !b.iscrizione.pagamentoOnline)));
  const appenaPagato = Boolean(nuovo || pagato);

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
      ) : !conQr || b.iscrizione.pagamentoOnline?.daRimborsare ? (
        <SenzaQr b={b} pagato={Boolean(pagato)} annullato={Boolean(annullato)} errore={Boolean(errore)} />
      ) : (
        <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col md:max-w-[960px] md:flex-row md:items-start md:gap-16 md:px-8 md:pt-10">
          <RicordaBiglietto id={b.iscrizione.id} email={b.iscrizione.email} evento={b.evento.nome} data={b.evento.data} nome={`${b.iscrizione.nome} ${b.iscrizione.cognome}`} />
          <div className="flex flex-col md:w-[420px] md:flex-none md:pt-6">
            <section className="flex flex-col gap-[14px] px-4 pb-8 pt-6 md:px-0">
              {appenaPagato ? (
                <>
                  <span className="font-mono text-[11px] leading-none tracking-[.06em] text-ok">{b.iscrizione.importo > 0 ? `✓ PAGAMENTO RICEVUTO · ${euro(b.iscrizione.importo)}` : '✓ ISCRIZIONE CONFERMATA'}</span>
                  <h1 className="m-0 font-display text-[96px] font-black uppercase leading-[.82]">Sei<br /><span className="text-arancio">in lista.</span></h1>
                  <p className="m-0 text-[18px] leading-[27px]">
                    Ci vediamo sotto cassa, {b.iscrizione.nome}.{b.evento.dressCode ? ` Dress code: ${b.evento.dressCode.toLowerCase()}.` : ''} {b.evento.senzaTelefono ? 'Serata senza telefono: alla porta porta un documento.' : 'Alla porta mostra questo QR con un documento.'}
                  </p>
                </>
              ) : (
                <>
                  <span className="font-mono text-[11px] leading-none tracking-[.06em] text-arancio">✦ IL TUO QR</span>
                  <h1 className="m-0 font-display text-[72px] font-black uppercase leading-[.84]">{b.iscrizione.nome},<br />eccolo.</h1>
                  <p className="m-0 text-[17px] leading-[26px] text-osso-2">Alla porta mostralo con un documento. Luminosità al massimo.</p>
                </>
              )}
            </section>
            <section className="hidden flex-col gap-3 md:flex">
              <Azioni id={b.iscrizione.id} email={b.iscrizione.email} nuovo={appenaPagato} senzaTelefono={b.evento.senzaTelefono} />
            </section>
          </div>

          <div className="flex flex-col">
            <section className="flex justify-center px-4 md:px-0"><BigliettoQr b={b} appenaPagato={appenaPagato} /></section>
            <section className="flex flex-col gap-3 px-4 pt-7 md:hidden">
              <Azioni id={b.iscrizione.id} email={b.iscrizione.email} nuovo={appenaPagato} senzaTelefono={b.evento.senzaTelefono} />
            </section>
            <section className="mx-4 mt-9 flex flex-col gap-[14px] border border-linea bg-notte-2 px-5 py-6 md:mx-0">
              <span className="font-display text-[30px] font-black uppercase leading-[.95]">Porta la tua gente</span>
              <span className="text-[15px] leading-[22px] text-osso-2">
                Manda questo link agli amici{b.prHandle ? `: finiscono anche loro nella lista di ${b.lista}.` : ': si mettono in lista in un minuto.'}
                {testoCassa(b.evento) ? ` ${testoCassa(b.evento)}` : ''}
              </span>
              <CampoLink link={b.prHandle ? `/e/${b.evento.slug}/${b.prHandle}` : `/e/${b.evento.slug}`} />
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
  const etichetta = daRimborsare ? 'PAGAMENTO DA RESTITUIRE' : i.stato === 'scaduta' ? 'TEMPO SCADUTO' : i.stato === 'rimborsato' ? 'RIMBORSATO' : 'POSTO LASCIATO';
  const spiega = daRimborsare
    ? 'Il pagamento è arrivato quando il posto non era più tuo: ti restituiamo i soldi sulla stessa carta, non devi fare niente.'
    : i.stato === 'rimborsato' ? 'Ti abbiamo restituito i soldi sulla carta con cui hai pagato.'
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
              <a href={linkPagaBiglietto('', i.id, i.email)} className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 56 }}>
                Paga {euro(i.importo)} <span className="mm-btn__freccia" aria-hidden="true">→</span>
              </a>
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
          <h1 className="m-0 font-display text-[56px] font-black uppercase leading-[.86]">Niente <span className="text-arancio">QR.</span></h1>
          <p className="m-0 text-[17px] leading-[26px] text-osso-2">{spiega}</p>
          {!daRimborsare && i.stato !== 'rimborsato' && (
            <Link href={`/e/${b.evento.slug}${b.prHandle ? `/${b.prHandle}` : ''}`} className="mm-btn mm-btn--linea self-start">Torna alla serata</Link>
          )}
        </>
      )}
    </main>
  );
}

function Azioni({ id, email, nuovo, senzaTelefono }: { id: string; email: string; nuovo: boolean; senzaTelefono: boolean }) {
  const q = `?email=${encodeURIComponent(email)}`;
  return (
    <>
      {nuovo && <span className="text-[14px] leading-5 text-osso-2">{senzaTelefono ? 'Ti abbiamo mandato la conferma a' : 'Ti abbiamo mandato il QR a'} <span className="text-osso">{email}</span>.</span>}
      {!senzaTelefono && <a className="mm-btn mm-btn--linea mm-btn--pieno" href={`/api/biglietto/${id}/pdf${q}`} target="_blank" rel="noopener">Scarica PDF</a>}
      {/* Fase 2: Apple/Google Wallet */}
      <button type="button" className="mm-btn mm-btn--linea mm-btn--pieno" disabled>Salva nel Wallet · in arrivo</button>
      <a className="mm-btn mm-btn--muto self-center" href={`/api/biglietto/${id}/calendario${q}`}>Aggiungi al calendario</a>
    </>
  );
}
