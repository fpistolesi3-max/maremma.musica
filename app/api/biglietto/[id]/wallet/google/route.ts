import { bigliettoPubblico } from '@/lib/dati/pubblico';
import { campiPass, esitoPass, googleConfigurato } from '@/lib/wallet';
import { chiaviGoogleDaEnv, linkSalvaGoogle } from '@/lib/wallet-google';
import { origineRichiesta } from '@/lib/sessione';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** "Salva in Google Wallet": porta al link firmato di Google. Stessi controlli del PDF; senza le chiavi risponde 404 e il pulsante non c'è. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!googleConfigurato()) return new Response('Non trovato', { status: 404 });
  const { id } = await params;
  const email = new URL(req.url).searchParams.get('email');
  const b = await bigliettoPubblico(id, email);
  if (!b) return new Response('Biglietto non trovato', { status: 404 });
  const esito = esitoPass(b);
  if (!esito.ok) return new Response(esito.messaggio, { status: esito.stato });
  try {
    const link = linkSalvaGoogle(campiPass(b), chiaviGoogleDaEnv(await origineRichiesta()));
    return new Response(null, { status: 302, headers: { Location: link, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (err) {
    console.error('[wallet google]', err instanceof Error ? err.message : err);
    return new Response('Google Wallet non è disponibile in questo momento', { status: 503 });
  }
}
