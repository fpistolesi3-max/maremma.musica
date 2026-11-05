import { sessioneCorrente } from '@/lib/sessione';
import { allineaSegreto } from '@/lib/dati/allinea-segreto';

export const dynamic = 'force-dynamic';

const json = (stato: number, corpo: unknown) => Response.json(corpo, { status: stato, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/admin/allinea-segreto — solo admin. Copia il valore di `MM_SEGRETO` (variabile di Vercel) nel segreto del database attivo, così
 * i QR restano validi anche se la variabile sparisse. Senza variabile, o con il database già uguale, non scrive niente.
 * Risponde solo `{ ok, allineato, motivo }`: il valore del segreto non compare mai, né qui né nei log.
 */
export async function POST() {
  const s = await sessioneCorrente();
  if (!s) return json(401, { errore: 'Devi entrare con il tuo accesso da admin.' });
  if (s.utente.ruolo !== 'admin') return json(403, { errore: 'Solo per l’admin.' });
  const esito = await allineaSegreto(s);
  return json(esito.ok ? 200 : 503, esito);
}
