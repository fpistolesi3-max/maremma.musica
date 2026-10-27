import 'server-only';
import type { Biglietto } from './dati/pubblico';
import { confermaPagamentoIscrizione, iscrizioniDaVerificare, salvaSessioneIscrizione } from './dati/prevendita';
import { emailAdmin } from './dati/tavoli';
import { creaCheckout, statoCheckout } from './pagamenti';
import { inviaBiglietto, inviaRimborsoDovuto, linkBiglietto } from './biglietto-email';
import { dataPunti } from './formato';

// Il giro del pagamento online della prevendita in lista, come lib/pagamento-tavolo.ts per i tavoli.
// Lo usano il modulo della prevendita, il pulsante "Paga" del biglietto, il webhook di Stripe, il cron e la pagina di prova.

/** Apre una pagina di pagamento per l'iscrizione in attesa e la ricorda. Restituisce dove mandare il cliente. */
export async function apriPagamentoIscrizione(b: Biglietto, origine: string): Promise<string> {
  const { iscrizione: i, evento: e } = b;
  const ritorno = linkBiglietto(origine, i.id, i.email);
  const c = await creaCheckout({
    rif: { tipo: 'iscrizione', id: i.id }, email: i.email, importo: i.importo, scade: new Date(i.scade ?? Date.now()),
    descrizione: `Prevendita · ${e.nome} ${dataPunti(e.data)} · ${i.nome} ${i.cognome}`,
    successo: `${ritorno}&pagato=1`, annullato: `${ritorno}&annullato=1`,
  });
  await salvaSessioneIscrizione(i.id, c.id);
  return c.url;
}

/** Pagamento riuscito: l'iscrizione vale e parte l'email con il QR (una volta sola); se va rimborsato lo sanno gli admin. */
export async function registraPagamentoIscrizione(id: string, pagamento: string, origine: string) {
  const r = await confermaPagamentoIscrizione(id, pagamento);
  try {
    if (r.esito === 'confermata') await inviaBiglietto(r.biglietto, origine);
    if (r.esito === 'da_rimborsare') await inviaRimborsoDovuto(r.biglietto, await emailAdmin(), origine);
  } catch (e) {
    console.error('[prevendita] email dopo il pagamento non inviata', e);
  }
  return r.esito;
}

/** Il cliente torna dalla pagina di pagamento: se il webhook non è ancora arrivato si chiede direttamente a Stripe. */
export async function verificaRitornoIscrizione(b: Biglietto, origine: string) {
  const i = b.iscrizione;
  const sessione = i.pagamentoOnline?.sessione;
  if ((i.stato !== 'in_attesa' && i.stato !== 'scaduta') || !sessione || i.pagamentoOnline?.pagamento) return;
  try {
    const s = await statoCheckout(sessione);
    if (s.pagato && s.pagamento) await registraPagamentoIscrizione(i.id, s.pagamento, origine);
  } catch (e) {
    console.error('[prevendita] verifica del pagamento non riuscita', e);
  }
}

/** Rete di sicurezza del cron: registra le pagine di pagamento pagate che il webhook non ha portato. */
export async function verificaSospesiIscrizioni(origine: string) {
  let registrati = 0;
  for (const { id, sessione } of await iscrizioniDaVerificare()) {
    try {
      const s = await statoCheckout(sessione);
      if (s.pagato && s.pagamento && (await registraPagamentoIscrizione(id, s.pagamento, origine)) !== 'gia') registrati += 1;
    } catch (e) {
      console.error('[prevendita] verifica del pagamento non riuscita', id, e);
    }
  }
  return registrati;
}
