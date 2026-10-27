import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { modoPagamentoTavoli } from '@/lib/pagamenti';
import { daPagareOnline } from '@/lib/dati/tavoli';
import { linkTavolo } from '@/lib/tavolo-email';
import { euro } from '@/lib/formato';
import { pagaProvaAzione } from '@/app/azioni/pagamento-prova';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pagamento di prova', robots: { index: false } };

/**
 * Al posto di Stripe finché non c'è la chiave (sviluppo e istanza di prova): stessa strada del pagamento vero,
 * dalla richiesta al QR, senza soldi.
 */
export default async function PagamentoDiProva({ searchParams }: { searchParams: Promise<{ s?: string; p?: string; email?: string }> }) {
  if (modoPagamentoTavoli() !== 'prova') notFound();
  const { s = '', p = '', email = '' } = await searchParams;
  const v = await daPagareOnline(p, email);
  const ritorno = linkTavolo('', p, email);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-6 px-4 py-10">
      <span className="font-mono text-[11px] text-arancio">✦ SOLO PROVA · NESSUN ADDEBITO</span>
      <h1 className="m-0 font-display text-[48px] font-black uppercase leading-[.9]">Pagamento <span className="text-arancio">di prova.</span></h1>
      {v && v.prenotazione.pagamentoOnline?.sessione === s ? (
        <>
          <div className="flex flex-col gap-2 border border-linea bg-notte-2 p-5">
            <span className="text-[15px] text-osso-2">Tavolo {v.tavolo.nome} · {v.evento.nome}</span>
            <span className="font-display text-[44px] font-black leading-none">{euro(v.prenotazione.spesaMinima)}</span>
            <span className="text-[14px] text-osso-2">Qui ci sarebbe la pagina di Stripe: carta, Apple Pay, Google Pay.</span>
          </div>
          <form action={pagaProvaAzione} className="flex flex-col gap-3">
            <input type="hidden" name="s" value={s} />
            <input type="hidden" name="p" value={p} />
            <input type="hidden" name="email" value={email} />
            <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 56 }}>Paga {euro(v.prenotazione.spesaMinima)} (prova)</button>
          </form>
          <Link href={`${ritorno}&annullato=1`} className="mm-btn mm-btn--linea">Torna indietro senza pagare</Link>
        </>
      ) : (
        <>
          <p className="m-0 text-osso-2">Questa pagina di pagamento non vale più: la prenotazione è già pagata, è chiusa, oppure ne è stata aperta una più recente.</p>
          <Link href={ritorno} className="mm-btn mm-btn--linea self-start">Vai alla prenotazione</Link>
        </>
      )}
    </main>
  );
}
