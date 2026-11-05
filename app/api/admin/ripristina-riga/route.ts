import { sessioneCorrente } from '@/lib/sessione';
import { ripristinaRiga } from '@/lib/dati/verifica-archivio';

export const dynamic = 'force-dynamic';

const json = (stato: number, corpo: unknown) => Response.json(corpo, { status: stato, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/admin/ripristina-riga — solo admin, il ritorno indietro del passaggio alle tabelle. Riscrive la riga unica con quello che c'è
 * nelle tabelle; poi si riporta MM_ARCHIVIO a "riga" su Vercel. Serve il corpo `{"conferma":"ripristina"}` (un clic per sbaglio non basta)
 * e l'interruttore deve essere acceso.
 */
export async function POST(req: Request) {
  const s = await sessioneCorrente();
  if (!s) return json(401, { errore: 'Devi entrare con il tuo accesso da admin.' });
  if (s.utente.ruolo !== 'admin') return json(403, { errore: 'Solo per l’admin.' });
  const corpo = await req.json().catch(() => null) as { conferma?: unknown } | null;
  if (corpo?.conferma !== 'ripristina') return json(400, { errore: 'Per confermare invia {"conferma":"ripristina"}.' });
  try {
    return json(200, { ok: true, ...(await ripristinaRiga(s)) });
  } catch (e) {
    return json(409, { ok: false, errore: (e as Error).message });
  }
}
