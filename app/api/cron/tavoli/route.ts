import { NextResponse } from 'next/server';
import { applicaScadenze, chiuseDaAvvisare, promemoriaDaMandare } from '@/lib/dati/tavoli';
import { inviaChiusuraTavolo, inviaPromemoriaTavolo } from '@/lib/tavolo-email';
import { modalitaProva } from '@/lib/prova';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/tavoli — una volta al giorno (vercel.json): fa decadere le prenotazioni non pagate
 * e manda il promemoria a chi ha il termine entro 36 ore (così arriva sempre il giorno prima);
 * a chi l'ha persa per il termine passato manda l'avviso che il tavolo è tornato libero.
 * Vercel chiama con "Authorization: Bearer <CRON_SECRET>"; senza il segreto giusto non parte (in sviluppo sì).
 */
export async function GET(req: Request) {
  const segreto = process.env.CRON_SECRET;
  const autorizzato = segreto ? req.headers.get('authorization') === `Bearer ${segreto}` : modalitaProva();
  if (!autorizzato) return NextResponse.json({ errore: 'accesso' }, { status: 401 });

  await applicaScadenze();
  const origine = process.env.SITO_URL || new URL(req.url).origin;
  let inviati = 0;
  for (const v of await promemoriaDaMandare()) {
    try { await inviaPromemoriaTavolo(v, origine); inviati += 1; } catch (e) { console.error('[tavoli] promemoria non inviato', e); }
  }
  let avvisati = 0;
  for (const v of await chiuseDaAvvisare()) {
    try { await inviaChiusuraTavolo(v, origine); avvisati += 1; } catch (e) { console.error('[tavoli] avviso di chiusura non inviato', e); }
  }
  return NextResponse.json({ ok: true, promemoria: inviati, decadute: avvisati }, { headers: { 'Cache-Control': 'no-store' } });
}
