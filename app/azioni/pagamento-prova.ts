'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { modoPagamentoOnline } from '@/lib/pagamenti';
import { daPagareOnline, prenotazionePubblica } from '@/lib/dati/tavoli';
import { registraPagamento } from '@/lib/pagamento-tavolo';
import { origineRichiesta } from '@/lib/sessione';
import { linkTavolo } from '@/lib/tavolo-email';
import { iscrizioneDaPagare } from '@/lib/dati/prevendita';
import { bigliettoPubblico } from '@/lib/dati/pubblico';
import { inCentesimi } from '@/lib/regole';
import { registraPagamentoIscrizione } from '@/lib/pagamento-prevendita';
import { linkBiglietto } from '@/lib/biglietto-email';

/** Pagina di pagamento di prova: "Paga" fa quello che farebbe il webhook di Stripe, senza soldi veri. */
export async function pagaProvaAzione(f: FormData) {
  if (modoPagamentoOnline() !== 'prova') throw new Error('non_autorizzato');
  const id = String(f.get('p') ?? '');
  const email = String(f.get('email') ?? '');
  const sessione = String(f.get('s') ?? '');
  if (f.get('t') === 'i') {
    const b = await iscrizioneDaPagare(id, email);
    if (b && b.iscrizione.pagamentoOnline?.sessione === sessione) await registraPagamentoIscrizione(id, sessione, await origineRichiesta());
    redirect(`${linkBiglietto('', id, email)}&pagato=1`);
  }
  // Solo la sessione aperta per questa prenotazione (id + email giusti) si può "pagare".
  const v = await daPagareOnline(id, email);
  if (v && v.prenotazione.pagamentoOnline?.sessione === sessione) await registraPagamento(id, sessione, await origineRichiesta());
  redirect(`${linkTavolo('', id, email)}&pagato=1`);
}

/**
 * Solo prova: un pagamento in più per un ordine già pagato, o con un importo diverso dal prezzo. Quello che Stripe vero potrebbe mandare
 * (secondo clic su "Paga" con due pagine aperte, importo manomesso): non conferma niente e compare tra i rimborsi da fare.
 */
export async function pagaProvaInPiuAzione(f: FormData) {
  if (modoPagamentoOnline() !== 'prova') throw new Error('non_autorizzato');
  const id = String(f.get('p') ?? '');
  const email = String(f.get('email') ?? '');
  const sbagliato = f.get('modo') === 'importo';
  const pagamento = `prova_${randomUUID()}`;
  const origine = await origineRichiesta();
  if (f.get('t') === 'i') {
    const b = await bigliettoPubblico(id, email);
    if (b) await registraPagamentoIscrizione(id, pagamento, origine, sbagliato ? { centesimi: inCentesimi(b.iscrizione.importo) - 100, valuta: 'eur' } : undefined);
    redirect(`${linkBiglietto('', id, email)}&pagato=1`);
  }
  const v = await prenotazionePubblica(id, email);
  if (v) await registraPagamento(id, pagamento, origine, sbagliato ? { centesimi: inCentesimi(v.prenotazione.spesaMinima) - 100, valuta: 'eur' } : undefined);
  redirect(`${linkTavolo('', id, email)}&pagato=1`);
}
