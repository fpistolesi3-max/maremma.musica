import { NextResponse } from 'next/server';
import { iscrizioneDaPagare } from '@/lib/dati/prevendita';
import { apriPagamentoIscrizione } from '@/lib/pagamento-prevendita';
import { linkBiglietto } from '@/lib/biglietto-email';
import { origineRichiesta } from '@/lib/sessione';

export const dynamic = 'force-dynamic';

/**
 * GET /biglietto/[id]/paga?email=… — apre una pagina di pagamento nuova per la prevendita in attesa e ci manda il cliente.
 * Già pagata, scaduta o email sbagliata: si torna al biglietto, che dice com'è.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = new URL(req.url).searchParams.get('email') ?? '';
  const origine = await origineRichiesta();
  const b = await iscrizioneDaPagare(id, email);
  if (!b) return NextResponse.redirect(linkBiglietto(origine, id, email), 303);
  try {
    const url = await apriPagamentoIscrizione(b, origine);
    return NextResponse.redirect(url.startsWith('/') ? `${origine}${url}` : url, 303);
  } catch (e) {
    console.error('[prevendita] pagina di pagamento non aperta', e);
    return NextResponse.redirect(`${linkBiglietto(origine, id, email)}&errore=pagamento`, 303);
  }
}
