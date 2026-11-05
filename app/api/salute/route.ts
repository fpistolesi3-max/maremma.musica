import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { modalitaProva } from '@/lib/prova';
import { interruttoreArchivio } from '@/lib/dati/tabelle';

export const dynamic = 'force-dynamic';

/** Dove sta l'archivio e perché (mai il valore di una variabile che non sia l'interruttore stesso). */
function descriviInterruttore() {
  const { modalita, origine } = interruttoreArchivio();
  const dove = modalita === 'tabelle' ? 'tabelle' : 'riga unica';
  if (origine === 'senza_supabase') return `${dove} (Supabase non configurato)`;
  if (origine === 'produzione') return `${dove} (predefinito della produzione; MM_ARCHIVIO=riga lo spegne)`;
  if (origine === 'predefinito') return `${dove} (predefinito fuori dalla produzione; MM_ARCHIVIO=tabelle lo accende)`;
  const valore = process.env.MM_ARCHIVIO?.trim().toLowerCase();
  return valore === 'tabelle' || valore === 'riga' ? `${dove} (impostato da MM_ARCHIVIO)` : `${dove} (MM_ARCHIVIO ha un valore non riconosciuto: "${process.env.MM_ARCHIVIO}")`;
}

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
    MM_ARCHIVIO: descriviInterruttore(),
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
      // Con l'interruttore acceso si controlla anche che le tabelle rispondano (migrazioni applicate e dati copiati).
      if (interruttoreArchivio().modalita === 'tabelle') {
        const l = await sb.rpc('leggi_tutto');
        supabase.tabelle_nuovo_schema = l.error
          ? { errore: l.error.message, codice: l.error.code, suggerimento: 'le migrazioni 20261104… – 20261107… sono applicate?' }
          : { ok: true, serate: (l.data as { eventi?: unknown[] } | null)?.eventi?.length ?? 0 };
      }
    } catch (e) {
      supabase = { errore: (e as Error).message };
    }
  }
  return NextResponse.json({ variabili, supabase }, { headers: { 'Cache-Control': 'no-store' } });
}
