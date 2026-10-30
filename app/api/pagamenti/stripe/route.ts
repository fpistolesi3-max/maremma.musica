import { NextResponse } from 'next/server';
import { firmaStripeValida, ricevutoDa } from '@/lib/pagamenti';
import { registraPagamento } from '@/lib/pagamento-tavolo';
import { registraPagamentoIscrizione } from '@/lib/pagamento-prevendita';
import { registraRimborsoStripe } from '@/lib/rimborso';

export const dynamic = 'force-dynamic';

interface EventoStripe {
  type: string;
  data: {
    object: {
      id: string; payment_status?: string; payment_intent?: string | null; client_reference_id?: string | null; metadata?: Record<string, string>;
      amount_total?: number | null; currency?: string | null;   // sessione di pagamento
      refunded?: boolean;                                       // charge.refunded: true solo se è stato restituito tutto
    };
  };
}

/**
 * POST /api/pagamenti/stripe — webhook di Stripe (Dashboard → Webhook, eventi checkout.session.completed e charge.refunded).
 * Senza la firma giusta (STRIPE_WEBHOOK_SECRET) non fa niente. Lo stesso evento può arrivare più volte: la
 * conferma e il rimborso contano una volta sola. Il pagamento conferma solo se importo e valuta coincidono col prezzo.
 */
export async function POST(req: Request) {
  const corpo = await req.text();
  if (!firmaStripeValida(corpo, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET ?? '')) {
    return NextResponse.json({ errore: 'firma' }, { status: 400 });
  }
  const evento = JSON.parse(corpo) as EventoStripe;
  const s = evento.data.object;
  const origine = process.env.SITO_URL || new URL(req.url).origin;
  // Rimborso totale (fatto dal sito o dalla Dashboard di Stripe): l'oggetto è l'addebito, `payment_intent` dice quale pagamento.
  if (evento.type === 'charge.refunded') {
    if (s.refunded && s.payment_intent) await registraRimborsoStripe(s.payment_intent, origine);
    return NextResponse.json({ ricevuto: true });
  }
  const pagata = (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') && s.payment_status === 'paid';
  // Nei metadati c'è cosa si è pagato: una prevendita in lista (iscrizione) o un tavolo (prenotazione).
  const iscrizione = s.metadata?.iscrizione;
  const prenotazione = iscrizione ? null : s.metadata?.prenotazione ?? s.client_reference_id;
  const ricevuto = ricevutoDa(s.amount_total, s.currency);
  if (pagata && s.payment_intent) {
    if (iscrizione) await registraPagamentoIscrizione(iscrizione, s.payment_intent, origine, ricevuto);
    else if (prenotazione) await registraPagamento(prenotazione, s.payment_intent, origine, ricevuto);
  }
  return NextResponse.json({ ricevuto: true });
}
