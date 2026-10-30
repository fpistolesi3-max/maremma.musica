import 'server-only';
import { leggi, modifica } from './archivio';
import type { Archivio, MotivoRimborso } from './tipi';
import { bigliettoDi, type Biglietto } from './pubblico';
import { anniCompiuti, dataIso } from '../formato';
import { eventoPassato, giaIscritto, importoCorretto, inCentesimi, iscrizioneScaduta, motivoPagamentoIscrizioneNonValido, tienePosto, type PagamentoRicevuto } from '../regole';

// Pagamento online della prevendita in lista: stesso giro dei tavoli (lib/dati/tavoli.ts).
// L'iscrizione nasce "in attesa" con il posto tenuto per pochi minuti; vale (e il QR si vede) solo a pagamento ricevuto.

function faiScadere(d: Archivio, adesso = new Date()) {
  for (const i of d.iscrizioni) if (iscrizioneScaduta(i, adesso)) i.stato = 'scaduta';
}

/** Le iscrizioni non pagate in tempo lasciano il posto (il conto dei lotti lo fa già da solo, qui si segna lo stato). */
export async function applicaScadenzeIscrizioni() {
  const d = await leggi();
  if (d.iscrizioni.some((i) => iscrizioneScaduta(i))) await modifica((a) => { faiScadere(a); });
}

/** Giorni dopo la serata oltre i quali i dati personali di ogni iscrizione si cancellano. */
export const GIORNI_ANONIMIZZAZIONE = 30;

/**
 * Dopo `GIORNI_ANONIMIZZAZIONE` giorni dalla serata, per tutte le iscrizioni (anche gratis, annullate, in cassa storiche) si cancellano
 * nome, cognome, email e data di nascita. La riga resta anonima e utile per le analisi: età alla serata (calcolata prima di
 * cancellare), tipo di prevendita, importo, PR o sito, data e ora d'acquisto, ingresso sì/no con l'ora. Il consenso marketing
 * non si tocca. Idempotente: ritorna quante iscrizioni ha anonimizzato. Lo chiama il cron giornaliero.
 */
export async function anonimizzaIscrizioniVecchie(adesso = new Date()): Promise<number> {
  const limite = new Date(adesso.getTime() - GIORNI_ANONIMIZZAZIONE * 86_400_000);
  const da = (d: Readonly<Archivio>) => {
    const scadute = new Map(d.eventi.filter((e) => eventoPassato(e, limite)).map((e) => [e.id, e]));
    return d.iscrizioni.filter((i) => !i.anonimizzata && scadute.has(i.eventoId));
  };
  if (!da(await leggi()).length) return 0;
  return modifica((d) => {
    const lista = da(d);
    for (const i of lista) {
      const e = d.eventi.find((x) => x.id === i.eventoId)!;
      i.etaAllaSerata = i.dataNascita ? anniCompiuti(i.dataNascita, dataIso(e.data)) : null;
      i.nome = ''; i.cognome = ''; i.dataNascita = ''; i.email = '';
      i.anonimizzata = true; i.anonimizzataAt = adesso.toISOString();
    }
    return lista.length;
  });
}

/** Il cliente apre "Paga": solo un'iscrizione sua (id + email) ancora in attesa e nel termine. */
export async function iscrizioneDaPagare(id: string, email: string | null | undefined): Promise<Biglietto | null> {
  if (!email) return null;
  await applicaScadenzeIscrizioni();
  const d = await leggi();
  const i = d.iscrizioni.find((x) => x.id === id);
  if (!i || i.email !== email.trim().toLowerCase() || i.stato !== 'in_attesa' || !i.pagamentoOnline) return null;
  return bigliettoDi(d, i);
}

/** Ricorda l'ultima pagina di pagamento aperta: al ritorno del cliente si controlla quella. */
export async function salvaSessioneIscrizione(id: string, sessione: string) {
  await modifica((d) => {
    const i = d.iscrizioni.find((x) => x.id === id);
    if (i?.pagamentoOnline && i.stato === 'in_attesa') i.pagamentoOnline.sessione = sessione;
  });
}

export type EsitoPagamentoIscrizione =
  | { esito: 'confermata'; biglietto: Biglietto }    // appena pagata: parte l'email con il QR
  | { esito: 'gia' }                                 // già registrato (webhook ripetuto, ritorno del cliente)
  | { esito: 'da_rimborsare'; biglietto: Biglietto; motivo: MotivoRimborso; importo: number } // non vale: i soldi vanno restituiti
  | { esito: 'sconosciuta' };

/**
 * Pagamento online riuscito (webhook di Stripe, ritorno del cliente, controllo giornaliero o pagina di prova).
 * Si può chiamare più volte per lo stesso pagamento. Arrivato dopo il termine vale lo stesso se nel lotto c'è ancora
 * posto (regola in pagamentoIscrizioneValido); altrimenti si registra come da rimborsare e lo vede l'admin.
 * `ricevuto`: importo e valuta pagati, come li dice Stripe; se non coincidono col prezzo il pagamento non conferma niente.
 * Un pagamento in più su un ordine che ne ha già uno non sovrascrive quello vero: si registra a parte, da rimborsare.
 */
export async function confermaPagamentoIscrizione(id: string, pagamento: string, adesso = new Date(), ricevuto?: PagamentoRicevuto | null): Promise<EsitoPagamentoIscrizione> {
  return modifica((d): EsitoPagamentoIscrizione => {
    const i = d.iscrizioni.find((x) => x.id === id);
    if (!i) return { esito: 'sconosciuta' };
    const evento = d.eventi.find((e) => e.id === i.eventoId);
    if (!evento) return { esito: 'sconosciuta' };
    const po = (i.pagamentoOnline ??= { sessione: null, pagamento: null, daRimborsare: false });
    if (po.pagamento === pagamento || po.inPiu?.some((x) => x.pagamento === pagamento)) return { esito: 'gia' };
    const inPiu = (motivo: MotivoRimborso): EsitoPagamentoIscrizione => {
      const centesimi = ricevuto?.centesimi ?? inCentesimi(i.importo);
      (po.inPiu ??= []).push({ pagamento, centesimi, valuta: ricevuto?.valuta ?? 'eur', motivo, at: adesso.toISOString() });
      return { esito: 'da_rimborsare', biglietto: bigliettoDi(d, i)!, motivo, importo: centesimi / 100 };
    };
    if (!importoCorretto(i.importo, ricevuto)) return inPiu('importo');
    // Ha già un pagamento (due pagine di pagamento aperte, pagate entrambe): il QR resta com'è e il pagamento in più
    // non sovrascrive quello vero.
    if (po.pagamento) return inPiu('secondo_pagamento');
    const lotto = i.lottoId ? d.lotti.find((l) => l.id === i.lottoId) ?? null : null;
    const altri = d.iscrizioni.filter((x) => x.id !== i.id && x.lottoId != null && x.lottoId === i.lottoId && tienePosto(x, adesso)).length;
    const doppione = Boolean(giaIscritto(d.iscrizioni.filter((x) => x.id !== i.id), i.eventoId, i.cognome, i.dataNascita));
    const motivo = motivoPagamentoIscrizioneNonValido({ iscrizione: i, evento, lotto, altriNelLotto: altri, doppione, adesso });
    i.pagatoAt = adesso.toISOString();
    i.metodoPagamento = 'online';
    po.pagamento = pagamento;
    if (motivo) {
      po.daRimborsare = true;
      po.motivo = motivo;
      return { esito: 'da_rimborsare', biglietto: bigliettoDi(d, i)!, motivo, importo: i.importo };
    }
    i.stato = 'pagato';
    i.scade = null;
    return { esito: 'confermata', biglietto: bigliettoDi(d, i)! };
  });
}

/** Pagine di pagamento aperte senza un pagamento registrato, degli ultimi `giorni`: il cron chiede a Stripe se sono state pagate. */
export async function iscrizioniDaVerificare(giorni = 3, adesso = new Date()): Promise<{ id: string; sessione: string }[]> {
  const da = adesso.getTime() - giorni * 86_400_000;
  return (await leggi()).iscrizioni
    .filter((i) => i.pagamentoOnline?.sessione && !i.pagamentoOnline.pagamento && (i.stato === 'in_attesa' || i.stato === 'scaduta')
      && new Date(i.createdAt).getTime() >= da)
    .map((i) => ({ id: i.id, sessione: i.pagamentoOnline!.sessione! }));
}

/** Il cliente lascia il posto prima di pagare (dalla pagina del biglietto): torna subito libero per gli altri. */
export async function lasciaPosto(id: string, email: string): Promise<boolean> {
  return modifica((d) => {
    const i = d.iscrizioni.find((x) => x.id === id);
    if (!i || i.email !== email.trim().toLowerCase() || i.stato !== 'in_attesa') return false;
    i.stato = 'annullato';
    i.annullatoAt = new Date().toISOString();
    return true;
  });
}
