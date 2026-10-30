import 'server-only';
import type { Sessione } from './sessione';
import { avviaRimborso, concludiRimborso, registraRimborsoEsterno, rimborsoRespinto, type Bersaglio, type Chiusura } from './dati/rimborsi';
import { rimborsa } from './pagamenti';
import { inviaChiusuraTavolo } from './tavolo-email';

// Il giro di un rimborso, dal clic dell'admin alla carta del cliente. Come lib/pagamento-tavolo.ts per i pagamenti:
// i dati stanno in lib/dati/rimborsi.ts, qui c'è la chiamata a Stripe e le email.

async function avvisaCliente(c: Chiusura | null, origine: string) {
  if (c?.tipo !== 'tavolo') return;
  try {
    await inviaChiusuraTavolo(c.vista, origine);
  } catch (e) {
    console.error('[rimborsi] email al cliente non inviata', e);
  }
}

/**
 * Restituisce i soldi di un pagamento e, se è quello principale dell'ordine, chiude l'ordine ("Annulla e rimborsa").
 * Sicuro da ripetere: lo stesso pagamento non parte mai due volte (stato nei dati + chiave di idempotenza per Stripe).
 * Se il rimborso non va a buon fine l'ordine resta com'è. Restituisce `gia: true` se era già stato rimborsato.
 */
export async function rimborsaPagamento(s: Sessione, b: Bersaglio, origine: string): Promise<{ gia: boolean }> {
  const a = await avviaRimborso(s, b);
  if (a.esito === 'gia') return { gia: true };
  if (a.esito === 'avviato') {
    const r = await rimborsa(a.pagamento, a.chiave);
    if (r.esito === 'respinto') {
      await rimborsoRespinto(s, b);
      throw new Error(r.errore);
    }
    if (r.esito === 'incerto') {
      throw new Error(`${r.errore}. Non so se il rimborso è partito: ricontrolla tra poco e riprova, il cliente non sarà rimborsato due volte.`);
    }
  }
  // 'manuale': pagato fuori dal sito, i soldi si restituiscono a mano e qui si registra soltanto.
  await avvisaCliente(await concludiRimborso(s, b), origine);
  return { gia: false };
}

/** Webhook `charge.refunded` (rimborso totale fatto da noi o dalla Dashboard di Stripe): lo registra una volta sola. */
export async function registraRimborsoStripe(pagamento: string, origine: string) {
  const r = await registraRimborsoEsterno(pagamento);
  if (r.esito === 'registrato') await avvisaCliente(r.chiusura, origine);
  return r.esito;
}
