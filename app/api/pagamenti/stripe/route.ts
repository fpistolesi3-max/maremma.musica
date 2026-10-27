import { NextResponse } from 'next/server';
import { firmaStripeValida } from '@/lib/pagamenti';
import { registraPagamento } from '@/lib/pagamento-tavolo';
import { registraPagamentoIscrizione } from '@/lib/pagamento-prevendita';

export const dynamic = 'force-dynamic';

interface EventoStripe {
  type: string;
  data: { object: { id: string; payment_status?: string; payment_intent?: string | null; client_reference_id?: string | null; metadata?: Record<string, string> } };
}

/**
 * POST /api/pagamenti/stripe — webhook di Stripe (Dashboard → Webhook, evento checkout.session.completed).
 * Senza la firma giusta (STRIPE_WEBHOOK_SECRET) non fa niente. Lo stesso evento può arrivare più volte: la
 * conferma conta una volta sola.
 */
export async function POST(req: Request) {
  const corpo = await req.text();
  if (!firmaStripeValida(corpo, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET ?? '')) {
    return NextResponse.json({ errore: 'firma' }, { status: 400 });
  }
  const evento = JSON.parse(corpo) as EventoStripe;
  const s = evento.data.object;
  const pagata = (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') && s.payment_status === 'paid';
  // Nei metadati c'è cosa si è pagato: una prevendita in lista (iscrizione) o un tavolo (prenotazione).
  const origine = process.env.SITO_URL || new URL(req.url).origin;
  const iscrizione = s.metadata?.iscrizione;
  const prenotazione = iscrizione ? null : s.metadata?.prenotazione ?? s.client_reference_id;
  if (pagata && s.payment_intent) {
    if (iscrizione) await registraPagamentoIscrizione(iscrizione, s.payment_intent, origine);
    else if (prenotazione) await registraPagamento(prenotazione, s.payment_intent, origine);
  }
  return NextResponse.json({ ricevuto: true });
}
