import { NextResponse } from 'next/server';
import { applicaScadenze, chiuseDaAvvisare, emailDelPr, promemoriaDaMandare, promemoriaRichiestePr } from '@/lib/dati/tavoli';
import { inviaChiusuraTavolo, inviaPromemoriaRichiestaPr, inviaPromemoriaTavolo, inviaScadutaAlPr } from '@/lib/tavolo-email';
import { verificaSospesi } from '@/lib/pagamento-tavolo';
import { modalitaProva } from '@/lib/prova';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/tavoli — una volta al giorno (vercel.json): chiede a Stripe l'esito dei pagamenti online rimasti in
 * sospeso (se il webhook non li ha portati), fa decadere le prenotazioni non pagate
 * e manda il promemoria a chi ha il termine entro 36 ore (così arriva sempre il giorno prima) e, per le richieste
 * inserite dal PR e non ancora pagate, al cliente e al PR;
 * a chi l'ha persa per il termine passato manda l'avviso che il tavolo è tornato libero.
 * Vercel chiama con "Authorization: Bearer <CRON_SECRET>"; senza il segreto giusto non parte (in sviluppo sì).
 */
export async function GET(req: Request) {
  const segreto = process.env.CRON_SECRET;
  const autorizzato = segreto ? req.headers.get('authorization') === `Bearer ${segreto}` : modalitaProva();
  if (!autorizzato) return NextResponse.json({ errore: 'accesso' }, { status: 401 });

  const origine = process.env.SITO_URL || new URL(req.url).origin;
  // Prima i pagamenti online senza esito: un tavolo pagato non deve tornare libero perché il webhook non è arrivato.
  const pagamenti = await verificaSospesi(origine);
  await applicaScadenze();
  let inviati = 0;
  for (const v of await promemoriaDaMandare()) {
    try { await inviaPromemoriaTavolo(v, origine); inviati += 1; } catch (e) { console.error('[tavoli] promemoria non inviato', e); }
  }
  // Richieste inserite dal PR non ancora pagate: promemoria al cliente e avviso al PR.
  for (const { vista, emailPr } of await promemoriaRichiestePr()) {
    try { await inviaPromemoriaRichiestaPr(vista, emailPr, origine); inviati += 1; } catch (e) { console.error('[tavoli] promemoria della richiesta del PR non inviato', e); }
  }
  let avvisati = 0;
  for (const v of await chiuseDaAvvisare()) {
    try {
      await inviaChiusuraTavolo(v, origine);
      avvisati += 1;
      // Richiesta inserita dal PR e mai pagata: lo sa anche lui.
      const emailPr = v.prenotazione.inseritaDa === 'pr' ? await emailDelPr(v.prenotazione.prId) : null;
      if (emailPr) await inviaScadutaAlPr(v, emailPr, origine);
    } catch (e) { console.error('[tavoli] avviso di chiusura non inviato', e); }
  }
  return NextResponse.json({ ok: true, pagamenti, promemoria: inviati, decadute: avvisati }, { headers: { 'Cache-Control': 'no-store' } });
}
