import { sessioneCorrente } from '@/lib/sessione';
import { verificaArchivio } from '@/lib/dati/verifica-archivio';

export const dynamic = 'force-dynamic';

const json = (stato: number, corpo: unknown) => Response.json(corpo, { status: stato, headers: { 'Cache-Control': 'no-store' } });

/**
 * GET /api/admin/verifica-archivio — solo admin. Confronta la riga unica con le tabelle del nuovo schema e restituisce solo numeri e nomi
 * di campi (mai valori: ci sono dati personali). Serve prima del passaggio: `ok: true` e `differenze: []` = si può girare l'interruttore.
 */
export async function GET() {
  const s = await sessioneCorrente();
  if (!s) return json(401, { errore: 'Devi entrare con il tuo accesso da admin.' });
  if (s.utente.ruolo !== 'admin') return json(403, { errore: 'Solo per l’admin.' });
  try {
    return json(200, await verificaArchivio(s));
  } catch (e) {
    return json(503, { ok: false, errore: (e as Error).message });
  }
}
