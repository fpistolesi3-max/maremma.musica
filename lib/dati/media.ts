import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { CARTELLA_MEDIA } from './archivio';

// Salvataggio delle locandine: su disco in sviluppo (servite da /media/…), su Supabase Storage
// (bucket pubblico "locandine") sull'istanza online, dove il disco non resta.

const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL_SB = process.env.SUPABASE_URL;
const BUCKET = 'locandine';

/** Restituisce l'indirizzo con cui la locandina si vedrà nel sito. */
export async function salvaMedia(nome: string, contenuto: Buffer, tipo: string): Promise<string> {
  if (URL_SB && CHIAVE) {
    const sb = createClient(URL_SB, CHIAVE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await sb.storage.from(BUCKET).upload(nome, contenuto, { contentType: tipo, cacheControl: '31536000', upsert: false });
    if (error) throw new Error(`Caricamento locandina non riuscito (${error.message})`);
    return sb.storage.from(BUCKET).getPublicUrl(nome).data.publicUrl;
  }
  await fs.mkdir(CARTELLA_MEDIA, { recursive: true });
  await fs.writeFile(path.join(CARTELLA_MEDIA, nome), contenuto);
  return `/media/${nome}`;
}
