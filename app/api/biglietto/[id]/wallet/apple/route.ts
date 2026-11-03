import { bigliettoPubblico } from '@/lib/dati/pubblico';
import { appleConfigurato, campiPass, esitoPass } from '@/lib/wallet';
import { chiaviAppleDaEnv, creaPkpass } from '@/lib/wallet-apple';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Biglietto per Apple Wallet (.pkpass firmato). Stessi controlli del PDF; senza le chiavi di Apple risponde 404 e il pulsante non c'è. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!appleConfigurato()) return new Response('Non trovato', { status: 404 });
  const { id } = await params;
  const email = new URL(req.url).searchParams.get('email');
  const b = await bigliettoPubblico(id, email);
  if (!b) return new Response('Biglietto non trovato', { status: 404 });
  const esito = esitoPass(b);
  if (!esito.ok) return new Response(esito.messaggio, { status: esito.stato });
  try {
    const pkpass = await creaPkpass(campiPass(b), chiaviAppleDaEnv());
    return new Response(new Uint8Array(pkpass), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${b.evento.slug}-${b.iscrizione.codice}.pkpass"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    // Certificato scaduto, chiave sbagliata, password errata: si legge nei log, il cliente vede solo che non è disponibile.
    console.error('[wallet apple]', err instanceof Error ? err.message : err);
    return new Response('Apple Wallet non è disponibile in questo momento', { status: 503 });
  }
}
