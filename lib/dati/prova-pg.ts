import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import type { Db } from './prova-vendite';

// Un Postgres vero per i test di gara (richieste davvero simultanee, con più connessioni): il database di PROVA su Supabase.
// Solo per i test: non lo importa nessun file dell'app. Come si usa: README, "Test di gara".
//
// Protezioni:
// - si parte solo se c'è MM_TEST_PG_URL (dal file `.env.test.local`, ignorato da git, o dall'ambiente);
// - si rifiuta di partire se l'indirizzo contiene il progetto del sito vero;
// - si lavora in uno schema dedicato, creato a ogni giro e cancellato alla fine: mai in `public`, mai sui dati di nessuno.

/** L'identificativo del progetto Supabase del sito vero: nessun test deve mai toccarlo. */
export const PROGETTO_VERO = 'iowbljhcjfppjjwbumsm';

const CARTELLA_MIGRAZIONI = path.join(process.cwd(), 'supabase', 'migrations');
/** Quali migrazioni si applicano nello schema di prova (la riga unica `archivio_mvp` si crea a mano, senza toccare lo Storage). */
export const MIGRAZIONI_GARA = ['20261104000000_schema_anagrafiche.sql', '20261105000000_schema_vendite.sql', '20261106000000_schema_tavoli.sql', '20261107000000_leggi_tutto.sql', '20261108000000_applica_anagrafiche.sql', '20261109000000_operazioni_vendite.sql', '20261110000000_operazioni_tavoli_porta.sql'];

/** Legge MM_TEST_PG_URL dall'ambiente o da `.env.test.local` (una riga `MM_TEST_PG_URL=…`). Mai stampare il valore: ha la password. */
export function leggiUrlProva(env: Record<string, string | undefined> = process.env, cartella = process.cwd()): string | null {
  if (env.MM_TEST_PG_URL?.trim()) return env.MM_TEST_PG_URL.trim();
  const file = path.join(cartella, '.env.test.local');
  if (!existsSync(file)) return null;
  for (const riga of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?MM_TEST_PG_URL\s*=\s*(.*?)\s*$/.exec(riga);
    if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2') || null;
  }
  return null;
}

/** Se l'indirizzo è quello del sito vero, o non è un indirizzo Postgres, si ferma subito. */
export function controllaUrlProva(url: string): void {
  if (url.toLowerCase().includes(PROGETTO_VERO)) {
    throw new Error('MM_TEST_PG_URL punta al database del sito vero: i test di gara non partono. Usa il progetto di prova.');
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) throw new Error('MM_TEST_PG_URL deve cominciare con postgres:// o postgresql://');
}

export interface Ambiente extends Db {
  /** Il nome dello schema di prova (si può stampare: non ha segreti). */
  schema: string;
  pool: Pool;
  /** Cancella lo schema e chiude le connessioni. Sempre in un `finally`. */
  chiudi(): Promise<void>;
}

/**
 * Se Supabase rifiuta le connessioni perché sono troppe, dice cosa cambiare: il "Session pooler" (porta 5432) ne permette al massimo 15
 * e i test di gara ne aprono fino a 40; il "Transaction pooler" (porta 6543) regge.
 */
export function spiegaErrore(e: unknown): unknown {
  const testo = `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? ''}`;
  if (/EMAXCONNSESSION|max clients reached|too many clients|remaining connection slots/i.test(testo)) {
    return new Error(
      'Troppe connessioni: il "Session pooler" di Supabase (porta 5432) ne accetta al massimo 15, i test di gara ne aprono fino a 40. '
      + 'In MM_TEST_PG_URL usa il "Transaction pooler" (porta 6543, host del tipo aws-1-…pooler.supabase.com, utente <ruolo>.<progetto>). Vedi il README, sezione "Test di gara".',
    );
  }
  return e;
}

/** Dentro le migrazioni e nei test le tabelle si chiamano `public.x`: nello schema di prova diventano `<schema>.x`. */
export const nelloSchema = (sql: string, schema: string) => sql.replace(/\bpublic\./g, `${schema}.`);

/** Crea lo schema di prova, ci applica le migrazioni e restituisce un Db che lavora solo lì. */
export async function creaAmbiente(url: string, connessioni = 30): Promise<Ambiente> {
  controllaUrlProva(url);
  const locale = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(url);
  // Supabase vuole SSL; il certificato non è nei CA di Node, e qui non passa nessun dato vero: si accetta.
  const pool = new Pool({
    connectionString: url.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, ''),
    ssl: locale ? false : { rejectUnauthorized: false },
    max: connessioni,
    connectionTimeoutMillis: 20_000,
  });
  // Il nome porta l'ora di creazione: gli avanzi si riconoscono dall'età, e due file di prova insieme non si cancellano a vicenda.
  const schema = `prova_gara_${Math.floor(Date.now() / 1000)}_${randomBytes(4).toString('hex')}`;
  const db: Ambiente = {
    schema,
    pool,
    query: (sql, params) => (pool.query(nelloSchema(sql, schema), params as unknown[]) as Promise<never>).catch((e) => { throw spiegaErrore(e); }),
    async chiudi() {
      try { await pool.query(`drop schema if exists ${schema} cascade`); } finally { await pool.end(); }
    },
  };
  try {
    // Gli avanzi di giri interrotti (stesso prefisso, mai usato per altro, più vecchi di mezz'ora) si tolgono prima di cominciare.
    const { rows } = await pool.query<{ nspname: string }>("select nspname from pg_namespace where nspname ~ '^prova_gara_[0-9]+_[0-9a-f]{8}$'");
    const vecchio = Math.floor(Date.now() / 1000) - 30 * 60;
    for (const r of rows) {
      const quando = Number(/^prova_gara_(\d+)_/.exec(r.nspname)?.[1]);
      if (Number.isFinite(quando) && quando < vecchio) await pool.query(`drop schema if exists ${r.nspname} cascade`);
    }
    // Su Supabase questi ruoli ci sono già; su un Postgres semplice servono i segnaposto.
    await pool.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$`);
    await pool.query(`create schema ${schema}`);
    await pool.query(`create table ${schema}.archivio_mvp (id integer primary key check (id = 1), versione bigint not null default 1, dati jsonb not null, updated_at timestamptz not null default now())`);
    for (const file of MIGRAZIONI_GARA) await pool.query(nelloSchema(readFileSync(path.join(CARTELLA_MIGRAZIONI, file), 'utf8'), schema));
    return db;
  } catch (e) {
    await db.chiudi().catch(() => undefined);
    throw spiegaErrore(e);
  }
}
