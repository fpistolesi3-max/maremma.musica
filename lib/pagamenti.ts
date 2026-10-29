import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { modalitaProva } from './prova';

// Pagamento online di tavoli e prevendite: le prevendite si pagano sempre con Stripe, alla serata si paga solo da bere.
// Con STRIPE_SECRET_KEY si usa Stripe Checkout (carta, Apple Pay, Google Pay); senza chiave, in sviluppo e
// sull'istanza di prova, una pagina di pagamento finta (/dev/pagamento) che fa tutto il giro senza soldi veri.
// Sul sito vero senza chiave tavoli e prevendite non si vendono (null): niente pagamenti a mano dal sito.
// Niente libreria: bastano tre chiamate all'API di Stripe e la verifica della firma del webhook.

export type ModoPagamento = 'stripe' | 'prova';

export function modoPagamentoOnline(): ModoPagamento | null {
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  return modalitaProva() ? 'prova' : null;
}

const API = 'https://api.stripe.com/v1';

async function stripe<T>(metodo: 'GET' | 'POST', percorso: string, campi?: Record<string, string>): Promise<T> {
  const r = await fetch(`${API}${percorso}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: campi ? new URLSearchParams(campi).toString() : undefined,
    cache: 'no-store',
  });
  const dati = (await r.json()) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Pagamento: ${dati.error?.message ?? r.status}`);
  return dati;
}

export interface Checkout { id: string; url: string }

/** Cosa si paga: la prenotazione di un tavolo o una prevendita in lista. Il webhook lo legge dai metadati. */
export type Riferimento = { tipo: 'prenotazione' | 'iscrizione'; id: string };

/** Apre la pagina di pagamento. `scade`: fino a quando vale (Stripe chiede almeno 30 minuti e al massimo 24 ore). */
export async function creaCheckout(o: {
  rif: Riferimento; email: string; descrizione: string; importo: number; scade: Date; successo: string; annullato: string;
}): Promise<Checkout> {
  const modo = modoPagamentoOnline();
  if (modo === 'prova') {
    const id = `prova_${randomUUID()}`;
    const q = new URLSearchParams({ s: id, p: o.rif.id, email: o.email, ...(o.rif.tipo === 'iscrizione' ? { t: 'i' } : {}) });
    return { id, url: `/dev/pagamento?${q}` };
  }
  if (modo !== 'stripe') throw new Error('Il pagamento online non è attivo');
  const adesso = Date.now();
  const scade = Math.round(Math.min(Math.max(o.scade.getTime(), adesso + 31 * 60_000), adesso + 23.9 * 3_600_000) / 1000);
  const s = await stripe<Checkout>('POST', '/checkout/sessions', {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(Math.round(o.importo * 100)),
    'line_items[0][price_data][product_data][name]': o.descrizione,
    customer_email: o.email,
    client_reference_id: o.rif.id,
    [`metadata[${o.rif.tipo}]`]: o.rif.id,
    [`payment_intent_data[metadata][${o.rif.tipo}]`]: o.rif.id,
    expires_at: String(scade),
    success_url: o.successo,
    cancel_url: o.annullato,
    locale: 'it',
  });
  return { id: s.id, url: s.url };
}

/** La pagina di pagamento è stata pagata? Serve al ritorno del cliente, se il webhook non è ancora arrivato. */
export async function statoCheckout(id: string): Promise<{ pagato: boolean; pagamento: string | null }> {
  if (id.startsWith('prova_') || modoPagamentoOnline() !== 'stripe') return { pagato: false, pagamento: null };
  const s = await stripe<{ payment_status: string; payment_intent: string | null }>('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
  return { pagato: s.payment_status === 'paid', pagamento: s.payment_intent };
}

/** Chiude una pagina di pagamento ancora aperta (se ne apre una nuova: due pagine pagate sarebbero un doppio addebito). Se è già chiusa o pagata non fa niente. */
export async function chiudiCheckout(id: string | null | undefined) {
  if (!id || id.startsWith('prova_') || modoPagamentoOnline() !== 'stripe') return;
  try { await stripe('POST', `/checkout/sessions/${encodeURIComponent(id)}/expire`, {}); } catch { /* già chiusa o pagata */ }
}

/** Restituisce i soldi di un pagamento online (intero). Quelli di prova non vanno da nessuna parte. */
export async function rimborsa(pagamento: string) {
  if (pagamento.startsWith('prova_')) return;
  if (modoPagamentoOnline() !== 'stripe') throw new Error('Per rimborsare un pagamento online serve la chiave di Stripe');
  await stripe('POST', '/refunds', { payment_intent: pagamento });
}

/**
 * Firma del webhook di Stripe: intestazione "t=…,v1=…", HMAC-SHA256 di "t.corpo" con il segreto del webhook.
 * Fuori tolleranza (5 minuti) non vale: un messaggio vecchio rimandato non conta.
 */
export function firmaStripeValida(corpo: string, intestazione: string | null, segreto: string, adesso = Date.now()) {
  if (!intestazione || !segreto) return false;
  const parti = intestazione.split(',').map((x) => x.trim().split('='));
  const t = parti.find(([k]) => k === 't')?.[1];
  const firme = parti.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || firme.length === 0 || Math.abs(adesso / 1000 - Number(t)) > 300) return false;
  const attesa = Buffer.from(createHmac('sha256', segreto).update(`${t}.${corpo}`).digest('hex'));
  return firme.some((f) => { const b = Buffer.from(f); return b.length === attesa.length && timingSafeEqual(b, attesa); });
}
