'use server';

import { redirect } from 'next/navigation';
import { modoPagamentoTavoli } from '@/lib/pagamenti';
import { daPagareOnline } from '@/lib/dati/tavoli';
import { registraPagamento } from '@/lib/pagamento-tavolo';
import { origineRichiesta } from '@/lib/sessione';
import { linkTavolo } from '@/lib/tavolo-email';

/** Pagina di pagamento di prova: "Paga" fa quello che farebbe il webhook di Stripe, senza soldi veri. */
export async function pagaProvaAzione(f: FormData) {
  if (modoPagamentoTavoli() !== 'prova') throw new Error('non_autorizzato');
  const id = String(f.get('p') ?? '');
  const email = String(f.get('email') ?? '');
  const sessione = String(f.get('s') ?? '');
  // Solo la sessione aperta per questa prenotazione (id + email giusti) si può "pagare".
  const v = await daPagareOnline(id, email);
  if (v && v.prenotazione.pagamentoOnline?.sessione === sessione) await registraPagamento(id, sessione, await origineRichiesta());
  redirect(`${linkTavolo('', id, email)}&pagato=1`);
}
