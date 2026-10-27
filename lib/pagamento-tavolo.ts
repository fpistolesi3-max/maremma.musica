import 'server-only';
import { confermaPagamentoOnline, emailAdmin, pagamentiDaVerificare, salvaSessionePagamento, type PrenotazioneVista } from './dati/tavoli';
import { chiudiCheckout, creaCheckout, statoCheckout } from './pagamenti';
import { inviaAvvisoAdmin, inviaConfermaTavolo, linkTavolo } from './tavolo-email';
import { dataPunti } from './formato';

// Il giro del pagamento online di un tavolo, dalla pagina di pagamento alle email.
// Lo usano la richiesta del cliente, il link mandato dal PR, il webhook di Stripe e la pagina di prova.

/** Apre una pagina di pagamento per la prenotazione e la ricorda. Restituisce l'indirizzo dove mandare il cliente. */
export async function apriPagamento(v: PrenotazioneVista, origine: string): Promise<string> {
  const { prenotazione: p, evento: e, tavolo: t } = v;
  const ritorno = linkTavolo(origine, p.id, p.email);
  await chiudiCheckout(p.pagamentoOnline?.sessione);
  const c = await creaCheckout({
    rif: { tipo: 'prenotazione', id: p.id }, email: p.email, importo: p.spesaMinima, scade: new Date(p.scade),
    descrizione: `Tavolo ${t.nome} · ${e.nome} ${dataPunti(e.data)} · spesa minima`,
    successo: `${ritorno}&pagato=1`, annullato: `${ritorno}&annullato=1`,
  });
  await salvaSessionePagamento(p.id, c.id);
  return c.url;
}

/** Pagamento riuscito: conferma la prenotazione e manda il QR al cliente e l'avviso agli admin (una volta sola). */
export async function registraPagamento(prenotazioneId: string, pagamento: string, origine: string) {
  const r = await confermaPagamentoOnline(prenotazioneId, pagamento);
  if (r.esito !== 'confermata' && r.esito !== 'da_rimborsare') return r.esito;
  try {
    if (r.esito === 'confermata') await inviaConfermaTavolo(r.vista, origine);
    await inviaAvvisoAdmin(r.vista, await emailAdmin(), origine, r.esito === 'confermata' ? 'pagato_online' : 'da_rimborsare');
  } catch (e) {
    console.error('[tavoli] email dopo il pagamento non inviata', e);
  }
  return r.esito;
}

/** Il cliente torna dalla pagina di pagamento: se il webhook non è ancora arrivato si chiede direttamente a Stripe. */
export async function verificaRitorno(v: PrenotazioneVista, origine: string) {
  const sessione = v.prenotazione.pagamentoOnline?.sessione;
  // Anche scaduta: il pagamento può essere arrivato pochi secondi dopo il termine.
  if ((v.prenotazione.stato !== 'in_attesa' && v.prenotazione.stato !== 'scaduta') || !sessione || v.prenotazione.pagamentoOnline?.pagamento) return;
  try {
    const s = await statoCheckout(sessione);
    if (s.pagato && s.pagamento) await registraPagamento(v.prenotazione.id, s.pagamento, origine);
  } catch (e) {
    console.error('[tavoli] verifica del pagamento non riuscita', e);
  }
}

/**
 * Rete di sicurezza del cron: per ogni pagina di pagamento rimasta senza esito chiede a Stripe se è stata pagata
 * e registra quelle pagate (che il webhook, per un problema di configurazione o di rete, non ha portato).
 * Restituisce quante ne ha registrate.
 */
export async function verificaSospesi(origine: string) {
  let registrati = 0;
  for (const { id, sessione } of await pagamentiDaVerificare()) {
    try {
      const s = await statoCheckout(sessione);
      if (s.pagato && s.pagamento && (await registraPagamento(id, s.pagamento, origine)) !== 'gia') registrati += 1;
    } catch (e) {
      console.error('[tavoli] verifica del pagamento non riuscita', id, e);
    }
  }
  return registrati;
}
