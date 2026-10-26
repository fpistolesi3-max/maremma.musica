import { NextResponse } from 'next/server';
import { daPagareOnline } from '@/lib/dati/tavoli';
import { apriPagamento } from '@/lib/pagamento-tavolo';
import { origineRichiesta } from '@/lib/sessione';
import { linkTavolo } from '@/lib/tavolo-email';

export const dynamic = 'force-dynamic';

/**
 * GET /tavolo/[id]/paga?email=… — apre una pagina di pagamento nuova e ci manda il cliente.
 * È il link dopo la richiesta, nell'email del PR e sul pulsante "Paga" della prenotazione.
 * Già pagata, chiusa o email sbagliata: si torna alla pagina della prenotazione, che dice com'è.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = new URL(req.url).searchParams.get('email') ?? '';
  const origine = await origineRichiesta();
  const v = await daPagareOnline(id, email);
  if (!v) return NextResponse.redirect(linkTavolo(origine, id, email), 303);
  try {
    const url = await apriPagamento(v, origine);
    return NextResponse.redirect(url.startsWith('/') ? `${origine}${url}` : url, 303);
  } catch (e) {
    console.error('[tavoli] pagina di pagamento non aperta', e);
    return NextResponse.redirect(`${linkTavolo(origine, id, email)}&errore=pagamento`, 303);
  }
}
