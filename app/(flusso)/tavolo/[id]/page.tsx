import type { Metadata } from 'next';
import Link from 'next/link';
import { prenotazionePubblica } from '@/lib/dati/tavoli';
import { linkPagamento, quandoScade } from '@/lib/tavolo-email';
import { verificaRitorno } from '@/lib/pagamento-tavolo';
import { origineRichiesta } from '@/lib/sessione';
import { lasciaTavoloAzione } from '@/app/azioni/tavoli';
import { euro, giorno2, giornoSett, meseCorto, numeroEvento, ora, orari } from '@/lib/formato';
import { mostraCodice } from '@/lib/qr-token';
import { luogoTesto } from '@/lib/luogo';
import { QrBiglietto } from '@/components/client';
import { Monogramma } from '@/components/ui';
import { PulsanteMorph } from '@/components/pulsante-morph';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Il tuo tavolo', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string; nuovo?: string; pagato?: string; annullato?: string; errore?: string }> };

const STATI = {
  in_attesa: { chip: 'mm-chip mm-chip--incassare', testo: 'In attesa di pagamento' },
  confermata: { chip: 'mm-chip mm-chip--entrato', testo: 'Pagato' },
  annullata: { chip: 'mm-chip mm-chip--annullato', testo: 'Annullata' },
  rimborsata: { chip: 'mm-chip mm-chip--annullato', testo: 'Rimborsata' },
  scaduta: { chip: 'mm-chip mm-chip--annullato', testo: 'Scaduta' },
} as const;

/** /tavolo/[id]?email=… — stato della prenotazione; il QR del tavolo compare a pagamento ricevuto. */
export default async function PaginaTavolo({ params, searchParams }: Props) {
  const { id } = await params;
  const { email, nuovo, pagato, annullato, errore } = await searchParams;
  let v = await prenotazionePubblica(id, email);
  // Di ritorno dal pagamento online: se il webhook non è ancora arrivato si chiede a Stripe e si rilegge.
  if (v && (v.prenotazione.stato === 'in_attesa' || v.prenotazione.stato === 'scaduta') && v.prenotazione.pagamentoOnline && pagato) {
    await verificaRitorno(v, await origineRichiesta());
    v = await prenotazionePubblica(id, email);
  }
  const online = Boolean(v?.prenotazione.pagamentoOnline);
  // Pagato ma la conferma non è ancora arrivata: la pagina si ricarica da sola tra qualche secondo.
  const inVerifica = Boolean(v && online && pagato && v.prenotazione.stato === 'in_attesa');

  return (
    <div className="mm-grana mm-curve flex min-h-dvh flex-col bg-notte bg-[position:-1000px_-80px]">
      <header className="flex h-16 flex-none items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-[10px] no-underline">
          <Monogramma />
          <span className="font-sans text-[11px] font-semibold leading-none tracking-logo">MAREMMA MUSICA</span>
        </Link>
        {v && <span className="font-mono text-[11px] text-osso-2">{numeroEvento(v.evento.numero)}</span>}
      </header>

      {!v ? (
        <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col gap-6 px-4 pb-16 pt-6">
          <h1 className="m-0 font-display text-[56px] font-black uppercase leading-[.86]">Prenotazione <span className="text-arancio">non trovata.</span></h1>
          <p className="m-0 text-[17px] leading-[26px] text-osso-2">Il link è incompleto o l&apos;email non corrisponde. Riapri il link che ti abbiamo mandato per email.</p>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col gap-7 px-4 pb-16 pt-6">
          <section className="flex flex-col gap-[14px]">
            {inVerifica && <meta httpEquiv="refresh" content="3" />}
            {v.prenotazione.stato === 'in_attesa' && online && (
              <>
                <span className="font-mono text-[11px] leading-none tracking-[.06em] text-attesa">{inVerifica ? '✦ PAGAMENTO IN VERIFICA' : annullato ? '✕ PAGAMENTO NON COMPLETATO' : '✦ MANCA SOLO IL PAGAMENTO'}</span>
                <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84]">{inVerifica ? <>Un <span className="text-arancio">attimo.</span></> : <>Tavolo <span className="text-arancio">fermo.</span></>}</h1>
                {inVerifica ? (
                  <p className="m-0 text-[17px] leading-[26px]">Stiamo ricevendo la conferma del pagamento: la pagina si aggiorna da sola e ti arriva anche l&apos;email con il QR.</p>
                ) : (
                  <>
                    <p className="m-0 text-[17px] leading-[26px]">
                      Il tavolo {v.tavolo.nome} è tenuto per te fino {v.prenotazione.inseritaDa !== 'cliente' ? 'a ' : ''}<strong>{v.prenotazione.inseritaDa !== 'cliente' ? quandoScade(v.prenotazione.scade) : `alle ${ora(v.prenotazione.scade)}`}</strong>. Paga online la spesa minima di <strong>{euro(v.prenotazione.spesaMinima)}</strong> e ti arriva subito il QR del tavolo.
                    </p>
                    {errore && <p role="alert" className="m-0 border border-stop-testo px-4 py-3 text-[14px] leading-5 text-stop-testo">Non siamo riusciti ad aprire il pagamento. Riprova tra poco.</p>}
                    <PulsanteMorph href={linkPagamento('', v.prenotazione.id, v.prenotazione.email)} esterno className="mm-btn--pieno">
                      Paga {euro(v.prenotazione.spesaMinima)} <span className="mm-btn__freccia" aria-hidden="true">→</span>
                    </PulsanteMorph>
                    <span className="text-center font-mono text-[11px] leading-4 text-osso-2">CARTA · APPLE PAY · GOOGLE PAY · SE NON PAGHI IN TEMPO IL TAVOLO TORNA LIBERO</span>
                    <form action={lasciaTavoloAzione} className="self-center">
                      <input type="hidden" name="id" value={v.prenotazione.id} />
                      <input type="hidden" name="email" value={v.prenotazione.email} />
                      <button type="submit" className="mm-btn mm-btn--muto">Lascia libero il tavolo</button>
                    </form>
                  </>
                )}
              </>
            )}
            {/* Prenotazione segnata a mano prima che tutti i pagamenti passassero dal sito. */}
            {v.prenotazione.stato === 'in_attesa' && !online && (
              <>
                <span className="font-mono text-[11px] leading-none tracking-[.06em] text-attesa">✦ IN ATTESA DI PAGAMENTO</span>
                <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84]">Tavolo <span className="text-arancio">fermo.</span></h1>
                <p className="m-0 text-[17px] leading-[26px]">Il tavolo {v.tavolo.nome} è fermo a tuo nome fino a <strong>{quandoScade(v.prenotazione.scade)}</strong>, in attesa del pagamento di <strong>{euro(v.prenotazione.spesaMinima)}</strong>.</p>
              </>
            )}
            {v.prenotazione.stato === 'confermata' && (
              <>
                <span className="font-mono text-[11px] leading-none tracking-[.06em] text-ok">✓ PAGAMENTO RICEVUTO</span>
                <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84]">Tavolo <span className="text-arancio">vostro.</span></h1>
                <p className="m-0 text-[17px] leading-[26px]">Alla porta basta questo QR per tutto il gruppo. Luminosità al massimo.</p>
              </>
            )}
            {(v.prenotazione.stato === 'scaduta' || v.prenotazione.stato === 'annullata' || v.prenotazione.stato === 'rimborsata') && (
              <>
                <span className="font-mono text-[11px] leading-none tracking-[.06em] text-stop-testo">✕ {{ scaduta: 'TERMINE PASSATO', annullata: 'PRENOTAZIONE ANNULLATA', rimborsata: 'PRENOTAZIONE RIMBORSATA' }[v.prenotazione.stato]}</span>
                <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84]">Tavolo <span className="text-arancio">libero.</span></h1>
                <p className="m-0 text-[17px] leading-[26px] text-osso-2">
                  {{ scaduta: 'Il pagamento non è arrivato in tempo e il tavolo è tornato libero.', annullata: 'Questa prenotazione è stata annullata.', rimborsata: 'Questa prenotazione è stata annullata e la spesa minima ti è stata restituita.' }[v.prenotazione.stato]} Puoi chiederne un altro, se ce ne sono.
                </p>
                <Link href={`/tavoli/${v.evento.slug}`} className="mm-btn mm-btn--linea self-start">Vedi i tavoli liberi</Link>
              </>
            )}
          </section>

          <article className="mm-biglietto" aria-label="La tua prenotazione">
            <div className="mm-biglietto__testa">
              <span className="font-mono text-[11px] leading-[14px] tracking-[.04em] text-osso-2">{numeroEvento(v.evento.numero)} · TAVOLO</span>
              <h2 className="mm-biglietto__titolo" style={{ fontSize: 44 }}>{v.evento.nome}</h2>
              <span className="mm-biglietto__meta">{giornoSett(v.evento.data)} {giorno2(v.evento.data)} {meseCorto(v.evento.data).toUpperCase()} · {orari(v.evento.data, v.evento.dataFine)} · {luogoTesto(v.evento)}</span>
            </div>
            <div className="mm-biglietto__strappo" aria-hidden="true" />
            {v.prenotazione.stato === 'confermata' && (
              <>
                <div className="mm-biglietto__qr"><QrBiglietto valore={v.prenotazione.tokenQr} etichetta={`QR del tavolo ${v.tavolo.nome}`} stampa={Boolean(nuovo || pagato)} /></div>
                <div className="mm-biglietto__codice">{mostraCodice(v.prenotazione.codice)}</div>
              </>
            )}
            <dl className="mm-biglietto__dati">
              <div><dt>Tavolo</dt><dd>{v.tavolo.nome}{v.tavolo.zona ? ` · ${v.tavolo.zona}` : ''}</dd></div>
              <div><dt>Persone</dt><dd>{v.prenotazione.persone}</dd></div>
              <div className="mm-biglietto__largo"><dt>A nome di</dt><dd>{v.prenotazione.nome} {v.prenotazione.cognome}</dd></div>
              <div className="mm-biglietto__largo"><dt>Lista</dt><dd>{v.lista}</dd></div>
            </dl>
            <div className="mm-biglietto__porta">
              <span className={STATI[v.prenotazione.stato].chip}>{STATI[v.prenotazione.stato].testo}</span>
              <span className="mm-biglietto__prezzo uppercase">{euro(v.prenotazione.spesaMinima)}</span>
            </div>
          </article>
        </main>
      )}

      <footer className="flex justify-between px-4 py-8 font-mono text-[10px] leading-[14px] text-osso-3 md:px-8">
        <span>MAREMMAMUSICA@GMAIL.COM</span><span>@MAREMMA.MUSICA</span>
      </footer>
    </div>
  );
}
