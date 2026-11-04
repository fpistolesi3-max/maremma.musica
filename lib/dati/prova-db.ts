import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// Postgres vero (PGlite, in memoria) per provare le migrazioni e le funzioni SQL senza toccare Supabase.
// Solo per i test: non lo importa nessun file dell'app.
//
// Cosa NON prova: PGlite lavora con una sola connessione, quindi due richieste "insieme" si mettono in fila invece di
// intrecciarsi davvero. Le regole (indici unici, esiti delle funzioni, atomicità di una transazione) si provano; l'attesa
// reciproca dei blocchi `for update` tra connessioni diverse no (serve un Postgres vero, vedi PIANO-SCHEMA.md).

const CARTELLA = path.join(process.cwd(), 'supabase', 'migrations');

/** Fino alla tappa 1 (anagrafiche), nell'ordine in cui si applicano online (la riga unica prima, perché le funzioni la leggono). */
export const MIGRAZIONI_ANAGRAFICHE = [
  '20261005000000_archivio_mvp.sql',
  '20261104000000_schema_anagrafiche.sql',
];

/** Fino alla tappa 2 (vendite). Si allunga a ogni tappa. */
export const MIGRAZIONI_SCHEMA = [
  ...MIGRAZIONI_ANAGRAFICHE,
  '20261105000000_schema_vendite.sql',
];

/** Un database vuoto con i ruoli di Supabase e le migrazioni indicate applicate. */
export async function creaDb(migrazioni: readonly string[] = MIGRAZIONI_SCHEMA): Promise<PGlite> {
  const db = new PGlite();
  // Su Supabase questi ruoli e lo schema `storage` ci sono già; qui bastano segnaposto.
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  for (const file of migrazioni) await db.exec(readFileSync(path.join(CARTELLA, file), 'utf8'));
  return db;
}

/** Scrive la riga unica come fa lib/dati/archivio-remoto.ts. */
export async function scriviRiga(db: PGlite, dati: unknown, versione = 1) {
  await db.query(
    `insert into public.archivio_mvp (id, versione, dati) values (1, $1, $2::jsonb)
     on conflict (id) do update set versione = excluded.versione, dati = excluded.dati`,
    [versione, JSON.stringify(dati)],
  );
}
