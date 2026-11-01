import { sessioneCorrente } from '@/lib/sessione';
import { scriviFotoLocale } from '@/lib/dati/foto';

export const dynamic = 'force-dynamic';

/** Solo in sviluppo, senza Supabase: riceve il file di una foto e lo salva su disco (online si carica diretto su Storage). */
export async function POST(req: Request) {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'admin') return new Response('Accesso negato', { status: 401 });
  const u = new URL(req.url);
  try {
    await scriviFotoLocale(s, u.searchParams.get('evento') ?? '', u.searchParams.get('file') ?? '', Buffer.from(await req.arrayBuffer()));
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
  return new Response(null, { status: 204 });
}
