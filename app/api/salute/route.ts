import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { modalitaProva } from '@/lib/prova';

export const dynamic = 'force-dynamic';

/**
 * GET /api/salute — controllo dell'istanza online: quali variabili ci sono (mai i valori)
 * e se Supabase risponde. Solo in modalità di prova, altrimenti 404.
 */
export async function GET() {
  if (!modalitaProva()) return new NextResponse(null, { status: 404 });

  const url = process.env.SUPABASE_URL;
  const chiave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const variabili = {
    SUPABASE_URL: url ? (/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) ? 'ok' : 'presente ma strana: deve essere https://<id>.supabase.co, senza barra finale né /rest/v1') : 'MANCA',
    SUPABASE_SERVICE_ROLE_KEY: chiave ? (chiave.trim() !== chiave ? 'presente ma con spazi ai bordi' : 'ok') : 'MANCA',
    MM_SEGRETO: process.env.MM_SEGRETO ? 'ok' : 'MANCA',
    SITO_URL: process.env.SITO_URL ? 'ok' : 'manca (i link nelle email useranno l\'indirizzo della richiesta)',
    MM_MODALITA_PROVA: process.env.MM_MODALITA_PROVA ?? '(non impostata)',
  };

  let supabase: Record<string, unknown> = { stato: 'non provato (mancano URL o chiave)' };
  if (url && chiave) {
    try {
      const sb = createClient(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } });
      const t = await sb.from('archivio_mvp').select('versione,updated_at').eq('id', 1).maybeSingle();
      const b = await sb.storage.getBucket('locandine');
      supabase = {
        tabella_archivio_mvp: t.error
          ? { errore: t.error.message, codice: t.error.code, suggerimento: t.error.code === '42501' ? 'permessi: esegui grant all on table public.archivio_mvp to service_role;' : undefined }
          : { ok: true, riga: t.data ? `presente (versione ${t.data.versione})` : 'non ancora creata (si crea alla prima visita)' },
        bucket_locandine: b.error ? { errore: b.error.message } : { ok: true, pubblico: b.data.public },
      };
    } catch (e) {
      supabase = { errore: (e as Error).message };
    }
  }
  return NextResponse.json({ variabili, supabase }, { headers: { 'Cache-Control': 'no-store' } });
}
