import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { modoPagamentoOnline } from '@/lib/pagamenti';
import { daPagareOnline } from '@/lib/dati/tavoli';
import { linkTavolo } from '@/lib/tavolo-email';
import { iscrizioneDaPagare } from '@/lib/dati/prevendita';
import { linkBiglietto } from '@/lib/biglietto-email';
import { euro } from '@/lib/formato';
import { pagaProvaAzione, pagaProvaInPiuAzione } from '@/app/azioni/pagamento-prova';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pagamento di prova', robots: { index: false } };

/**
 * Al posto di Stripe finché non c'è la chiave (sviluppo e istanza di prova): stessa strada del pagamento vero,
 * dalla richiesta al QR, senza soldi.
 */
export default async function PagamentoDiProva({ searchParams }: { searchParams: Promise<{ s?: string; p?: string; email?: string; t?: string; doppio?: string }> }) {
  if (modoPagamentoOnline() !== 'prova') notFound();
  const { s = '', p = '', email = '', t, doppio } = await searchParams;
  // t=i: prevendita in lista; altrimenti un tavolo.
  const lista = t === 'i';
  const daPagare = lista
    ? await iscrizioneDaPagare(p, email).then((b) => b && { sessione: b.iscrizione.pagamentoOnline?.sessione, cosa: `Prevendita · ${b.evento.nome}`, importo: b.iscrizione.importo })
    : await daPagareOnline(p, email).then((v) => v && { sessione: v.prenotazione.pagamentoOnline?.sessione, cosa: `Tavolo ${v.tavolo.nome} · ${v.evento.nome}`, importo: v.prenotazione.spesaMinima });
  const ritorno = lista ? linkBiglietto('', p, email) : linkTavolo('', p, email);
  // Prove di rimborso: pagamenti che Stripe vero manderebbe in più (secondo clic su "Paga", importo diverso). Solo in prova.
  if (doppio === '1') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-6 px-4 py-10">
        <span className="font-mono text-[11px] text-arancio">✦ SOLO PROVA · NESSUN ADDEBITO</span>
        <h1 className="m-0 font-display text-[40px] font-black uppercase leading-[.9]">Pagamenti <span className="text-arancio">in più.</span></h1>
        <p className="m-0 text-osso-2">Simula cosa farebbe Stripe se per {lista ? 'questa prevendita' : 'questa prenotazione'} arrivasse un altro pagamento: finisce tra i rimborsi da fare, l&apos;ordine non cambia.</p>
        <form action={pagaProvaInPiuAzione} className="flex flex-col gap-3">
          <input type="hidden" name="p" value={p} />
          <input type="hidden" name="email" value={email} />
          {lista && <input type="hidden" name="t" value="i" />}
          <button type="submit" name="modo" value="doppio" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 56 }}>Secondo pagamento (prova)</button>
          <button type="submit" name="modo" value="importo" className="mm-btn mm-btn--linea mm-btn--pieno" style={{ minHeight: 56 }}>Pagamento con importo sbagliato (prova)</button>
        </form>
        <Link href={ritorno} className="mm-btn mm-btn--linea">{lista ? 'Vai al biglietto' : 'Vai alla prenotazione'}</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-6 px-4 py-10">
      <span className="font-mono text-[11px] text-arancio">✦ SOLO PROVA · NESSUN ADDEBITO</span>
      <h1 className="m-0 font-display text-[48px] font-black uppercase leading-[.9]">Pagamento <span className="text-arancio">di prova.</span></h1>
      {daPagare && daPagare.sessione === s ? (
        <>
          <div className="flex flex-col gap-2 border border-linea bg-notte-2 p-5">
            <span className="text-[15px] text-osso-2">{daPagare.cosa}</span>
            <span className="font-display text-[44px] font-black leading-none">{euro(daPagare.importo)}</span>
            <span className="text-[14px] text-osso-2">Qui ci sarebbe la pagina di Stripe: carta, Apple Pay, Google Pay.</span>
          </div>
          <form action={pagaProvaAzione} className="flex flex-col gap-3">
            <input type="hidden" name="s" value={s} />
            <input type="hidden" name="p" value={p} />
            <input type="hidden" name="email" value={email} />
            {lista && <input type="hidden" name="t" value="i" />}
            <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 56 }}>Paga {euro(daPagare.importo)} (prova)</button>
          </form>
          <Link href={`${ritorno}&annullato=1`} className="mm-btn mm-btn--linea">Torna indietro senza pagare</Link>
        </>
      ) : (
        <>
          <p className="m-0 text-osso-2">Questa pagina di pagamento non vale più: è già pagata, è chiusa, oppure ne è stata aperta una più recente.</p>
          <Link href={ritorno} className="mm-btn mm-btn--linea self-start">{lista ? 'Vai al biglietto' : 'Vai alla prenotazione'}</Link>
        </>
      )}
    </main>
  );
}
