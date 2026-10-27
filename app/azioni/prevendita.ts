'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_CANALE, canaleDaUserAgent, normalizzaCanale } from '@/lib/canali';
import { bigliettoPubblico, bigliettiPerEmail, creaIscrizione } from '@/lib/dati/pubblico';
import { inviaBiglietto, inviaRecupero, linkBiglietto } from '@/lib/biglietto-email';
import { componiData, EMAIL_RE } from '@/lib/regole';
import { origineRichiesta } from '@/lib/sessione';
import { prenotazioniPerEmail } from '@/lib/dati/tavoli';
import { lasciaPosto } from '@/lib/dati/prevendita';
import { apriPagamentoIscrizione } from '@/lib/pagamento-prevendita';

export interface StatoModulo {
  errori: Partial<Record<'nome' | 'cognome' | 'nascita' | 'email' | 'privacy' | 'generale', string>>;
  valori: Record<string, string>;
  recupero?: string;
}

const testo = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function iscriviti(_prima: StatoModulo, f: FormData): Promise<StatoModulo> {
  const valori = {
    nome: testo(f, 'nome'), cognome: testo(f, 'cognome'),
    giorno: testo(f, 'giorno'), mese: testo(f, 'mese'), anno: testo(f, 'anno'),
    email: testo(f, 'email'), marketing: f.get('marketing') ? '1' : '', privacy: f.get('privacy') ? '1' : '',
  };
  const slug = testo(f, 'slug');
  const handlePr = testo(f, 'pr') || null;
  const errori: StatoModulo['errori'] = {};

  if (!valori.nome) errori.nome = 'Scrivi il nome, come sul documento.';
  else if (valori.nome.length > 80) errori.nome = 'Nome troppo lungo.';
  if (!valori.cognome) errori.cognome = 'Scrivi il cognome, come sul documento.';
  else if (valori.cognome.length > 80) errori.cognome = 'Cognome troppo lungo.';
  const dataNascita = componiData(valori.giorno, valori.mese, valori.anno);
  if (!dataNascita) errori.nascita = 'Controlla la data: giorno, mese e anno (es. 14 05 2001).';
  if (!EMAIL_RE.test(valori.email)) errori.email = 'Serve un’email valida: ti mandiamo lì il QR.';
  if (!f.get('privacy')) errori.privacy = 'Per metterti in lista devi accettare l’informativa privacy.';
  if (Object.keys(errori).length) return { errori, valori };

  // Canale: cookie lasciato all'arrivo, altrimenti il browser interno del social da cui sta compilando.
  const canale = normalizzaCanale((await cookies()).get(COOKIE_CANALE)?.value) ?? canaleDaUserAgent((await headers()).get('user-agent')) ?? 'diretto';
  const esito = await creaIscrizione({
    slug, handlePr, canale, nome: valori.nome, cognome: valori.cognome, dataNascita: dataNascita!, email: valori.email, marketing: Boolean(valori.marketing),
  });
  if (!esito.ok) {
    const campo = (esito.campo ?? 'generale') as keyof StatoModulo['errori'];
    return { errori: { [campo]: esito.errore }, valori, recupero: esito.esistente ? valori.email : undefined };
  }

  const origine = await origineRichiesta();
  const b = await bigliettoPubblico(esito.iscrizione.id, esito.iscrizione.email);
  const biglietto = linkBiglietto('', esito.iscrizione.id, esito.iscrizione.email);
  // A pagamento: il posto è tenuto e si va subito alla pagina di pagamento; il QR arriva dopo.
  if (b && b.iscrizione.stato === 'in_attesa') {
    let url: string;
    try {
      url = await apriPagamentoIscrizione(b, origine);
    } catch (e) {
      console.error('[prevendita] pagina di pagamento non aperta', e);
      redirect(`${biglietto}&errore=pagamento`);
    }
    redirect(url);
  }
  try {
    if (b) await inviaBiglietto(b, origine);
  } catch (e) {
    // L'iscrizione c'è comunque: il QR è a schermo e recuperabile. Non blocchiamo la persona.
    console.error('[prevendita] invio email non riuscito', e);
  }
  redirect(`${biglietto}&nuovo=1`);
}

export interface StatoRecupero { inviata: boolean; errore?: string; email?: string }

/** Rimanda per email i link a tutti i QR di quell'indirizzo. Stessa risposta anche se non ce ne sono. */
export async function recuperaQr(_prima: StatoRecupero, f: FormData): Promise<StatoRecupero> {
  const email = testo(f, 'email').toLowerCase();
  if (!EMAIL_RE.test(email)) return { inviata: false, errore: 'Scrivi l’email che hai usato per iscriverti.', email };
  const biglietti = await bigliettiPerEmail(email);
  const tavoli = await prenotazioniPerEmail(email);
  if (biglietti.length || tavoli.length) await inviaRecupero(email, biglietti, await origineRichiesta(), tavoli);
  return { inviata: true, email };
}

/** Il cliente lascia il posto prima di pagare: torna libero per gli altri. */
export async function lasciaPostoAzione(f: FormData) {
  const id = testo(f, 'id');
  const email = testo(f, 'email');
  await lasciaPosto(id, email);
  redirect(linkBiglietto('', id, email));
}
