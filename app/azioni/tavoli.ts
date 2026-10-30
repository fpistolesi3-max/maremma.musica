'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { COOKIE_PR } from '@/lib/costanti';
import { origineRichiesta, sessioneCorrente } from '@/lib/sessione';
import {
  adminPrenotaTavolo, annullaPrenotazione, daPagareOnline, lasciaTavolo, prPrenotaTavolo, prenotaTavolo,
  prenotazionePubblica, type DatiPrenotazione,
} from '@/lib/dati/tavoli';
import { inviaChiusuraTavolo, inviaRichiestaTavolo, linkTavolo } from '@/lib/tavolo-email';
import { modoPagamentoOnline } from '@/lib/pagamenti';
import { rimborsaPagamento } from '@/lib/rimborso';
import { apriPagamento } from '@/lib/pagamento-tavolo';

export interface StatoTavoloModulo {
  errori: Partial<Record<'nome' | 'cognome' | 'email' | 'telefono' | 'persone' | 'tavolo' | 'privacy' | 'generale', string>>;
  valori: Record<string, string>;
}

const testo = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/**
 * Richiesta di un tavolo. Dal sito è del cliente (attribuita al PR del link, qualunque tavolo scelga);
 * se chi invia è un PR con la sessione aperta la inserisce lui a nome del cliente.
 */
export async function prenotaTavoloAzione(_prima: StatoTavoloModulo, f: FormData): Promise<StatoTavoloModulo> {
  const valori = {
    tavoloId: testo(f, 'tavoloId'), nome: testo(f, 'nome'), cognome: testo(f, 'cognome'), email: testo(f, 'email'),
    telefono: testo(f, 'telefono'), persone: testo(f, 'persone'), privacy: f.get('privacy') ? '1' : '',
  };
  // Campo trappola, invisibile alle persone: se arriva compilato è un programma, non un cliente.
  if (testo(f, 'sito')) return { errori: { generale: 'Richiesta non valida.' }, valori };
  if (!valori.tavoloId) return { errori: { tavolo: 'Scegli un tavolo dalla mappa o dall’elenco.' }, valori };
  if (!valori.privacy) return { errori: { privacy: 'Per prenotare devi accettare l’informativa privacy.' }, valori };
  const dati: DatiPrenotazione = {
    tavoloId: valori.tavoloId, nome: valori.nome, cognome: valori.cognome, email: valori.email, telefono: valori.telefono, persone: Number(valori.persone),
  };

  const s = await sessioneCorrente();
  const handle = testo(f, 'pr') || (await cookies()).get(COOKIE_PR)?.value || null;
  const prSessione = s?.utente.ruolo === 'pr' && s.pr ? s.pr : null;
  // L'admin che compila il modulo inserisce un tavolo venduto a voce: il cliente paga dal link che gli arriva.
  const adminSessione = s?.utente.ruolo === 'admin' ? s : null;
  // Le prevendite si pagano con Stripe: senza pagamento online attivo i tavoli non si prenotano dal sito.
  const online = modoPagamentoOnline() !== null;
  if (!online) return { errori: { generale: 'La prenotazione online dei tavoli non è ancora attiva.' }, valori };
  const esito = prSessione ? await prPrenotaTavolo(s!, dati) : adminSessione ? await adminPrenotaTavolo(adminSessione, dati) : await prenotaTavolo(dati, handle);
  if (!esito.ok) return { errori: { [esito.campo ?? 'generale']: esito.errore }, valori };

  const p = esito.prenotazione;
  // Dal sito il cliente va subito alla pagina di pagamento, aperta qui: passando dal link /paga il redirect
  // di un'azione lascerebbe nel browser l'indirizzo sbagliato. Email e avviso agli admin partono a pagamento fatto.
  if (!prSessione && !adminSessione) {
    revalidatePath('/', 'layout');
    let url = `${linkTavolo('', p.id, p.email)}&errore=pagamento`;
    try {
      const daPagare = await daPagareOnline(p.id, p.email);
      if (daPagare) url = await apriPagamento(daPagare, await origineRichiesta());
    } catch (e) {
      console.error('[tavoli] pagina di pagamento non aperta', e);
    }
    redirect(url);
  }
  const v = await prenotazionePubblica(p.id, p.email);
  try {
    if (v) {
      const origine = await origineRichiesta();
      // Inserita dal PR o dalla crew: il cliente riceve il link per pagare; gli admin sapranno a pagamento fatto.
      await inviaRichiestaTavolo(v, origine);
    }
  } catch (e) {
    // La prenotazione c'è comunque e si vede a schermo: non blocchiamo la persona.
    console.error('[tavoli] invio email non riuscito', e);
  }
  revalidatePath('/', 'layout');
  // Il PR torna nella sua area, con la conferma: la pagina della prenotazione è del cliente (gli arriva per email).
  if (prSessione && v) redirect(`/pr/${prSessione.handle}?serata=${v.evento.slug}&tavolo=${p.id}#tavoli`);
  if (adminSessione) redirect(`/admin/eventi/${p.eventoId}/modifica?richiesta=${p.id}#tavoli`);
  redirect(`${linkTavolo('', p.id, p.email)}&nuovo=1`);
}

/** Annulla una prenotazione non pagata (l'admin sempre, il PR la sua in attesa). Al cliente arriva l'email. Quella pagata si chiude con `annullaERimborsaTavoloAzione`. */
export async function annullaPrenotazioneAzione(id: string): Promise<{ ok?: string; errore?: string }> {
  const s = await sessioneCorrente();
  if (!s) return { errore: 'Sessione scaduta: rientra.' };
  try {
    const v = await annullaPrenotazione(s, id);
    if (v) { try { await inviaChiusuraTavolo(v, await origineRichiesta()); } catch (e) { console.error('[tavoli] invio email non riuscito', e); } }
  } catch (e) {
    return { errore: (e as Error).message === 'non_autorizzato' ? 'Non puoi annullare questa prenotazione.' : (e as Error).message };
  }
  revalidatePath('/', 'layout');
  return { ok: 'Prenotazione annullata: il tavolo è di nuovo libero.' };
}

/**
 * "Annulla e rimborsa" (solo admin): prima si restituiscono i soldi, poi la prenotazione si chiude come rimborsata, il tavolo
 * torna libero e il cliente riceve l'email. Se il rimborso non va a buon fine resta com'è; ripetuto non parte due volte.
 */
export async function annullaERimborsaTavoloAzione(id: string): Promise<{ ok?: string; errore?: string }> {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'admin') return { errore: 'Sessione scaduta: rientra.' };
  try {
    const r = await rimborsaPagamento(s, { tipo: 'tavolo', id }, await origineRichiesta());
    revalidatePath('/', 'layout');
    return { ok: r.gia ? 'Era già rimborsato.' : 'Rimborsato: il tavolo è di nuovo libero.' };
  } catch (e) { return { errore: (e as Error).message }; }
}

/** Il cliente lascia libero il tavolo prima di pagare, dalla sua pagina. */
export async function lasciaTavoloAzione(f: FormData) {
  const id = testo(f, 'id');
  const email = testo(f, 'email');
  const v = await lasciaTavolo(id, email);
  revalidatePath('/', 'layout');
  redirect(v ? `/tavoli/${v.evento.slug}` : linkTavolo('', id, email));
}
