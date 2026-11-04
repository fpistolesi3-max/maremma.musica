import { randomUUID } from 'node:crypto';

// Piccoli aiuti per provare le funzioni delle vendite (supabase/migrations/20261105000000_schema_vendite.sql), uguali per i test
// su PGlite (casi singoli) e per quelli di gara su un Postgres vero. Solo per i test: non li importa nessun file dell'app.

/** Il minimo che serve: PGlite e il pool di `pg` (con lo schema dei test) lo rispettano entrambi. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export type Json = Record<string, unknown>;

export const ADESSO = new Date('2026-10-30T12:00:00Z');
const MIN = 60_000;
export const tra = (minuti: number, da: Date = ADESSO) => new Date(da.getTime() + minuti * MIN).toISOString();
export const istante = (v: unknown) => (v == null ? null : new Date(v as string).getTime());

export const q = async (db: Db, sql: string, p: unknown[] = []) => (await db.query<Json>(sql, p)).rows;
export const uno = async (db: Db, sql: string, p: unknown[] = []) => (await q(db, sql, p))[0];
export const importa = async (db: Db) => (await uno(db, 'select public.importa_archivio() as r')).r as Record<string, number>;
export const verifica = async (db: Db) =>
  (await uno(db, 'select public.verifica_importo() as r')).r as { ok: boolean; differenze: string[]; conteggi: Record<string, { riga: number; tabella: number }> };

export interface Nuova {
  id: string; eventoId: string; lottoId: string | null; nome: string; cognome: string; nascita: string; email: string; stato: string;
  scade: string | null; adesso: string; importo: number; prId: string | null;
}

/** Chiama crea_iscrizione con valori ragionevoli; `o` cambia quello che serve. Restituisce l'esito con l'id dell'iscrizione. */
export async function crea(db: Db, eventoId: string, lottoId: string | null, o: Partial<Nuova> = {}) {
  const n: Nuova = {
    id: randomUUID(), eventoId, lottoId, nome: 'Anna', cognome: 'Prova', nascita: '2000-01-01', email: 'anna@esempio.it', stato: 'in_attesa',
    scade: tra(30), adesso: ADESSO.toISOString(), importo: 10, prId: null, ...o,
  };
  const r = await uno(db, `select public.crea_iscrizione($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::date,$8,$9,$10,$11,$12::numeric,$13,$14,$15,$16::timestamptz,$17,$18::timestamptz) as r`,
    [n.id, n.eventoId, n.lottoId, n.prId, n.nome, n.cognome, n.nascita, n.email, `MM1.${n.id}`, n.id.slice(0, 8).toUpperCase(), n.stato, n.importo,
      null, 'diretto', false, n.stato === 'in_attesa' ? n.scade : null, n.stato === 'in_attesa', n.adesso]);
  return { id: n.id, ...(r.r as Json) } as { id: string; esito: string; email?: string };
}

export const conferma = async (db: Db, id: string, pagamento: string, o: { centesimi?: number; valuta?: string; importoOk?: boolean; chiusa?: boolean; adesso?: string } = {}) =>
  (await uno(db, 'select public.conferma_pagamento_iscrizione($1::uuid,$2,$3,$4,$5,$6,$7::timestamptz) as r',
    [id, pagamento, o.centesimi ?? 1000, o.valuta ?? 'eur', o.importoOk ?? true, o.chiusa ?? false, o.adesso ?? ADESSO.toISOString()])).r as Json;

export const stato = async (db: Db, id: string) => (await uno(db, 'select stato from public.iscrizioni where id = $1', [id])).stato as string;
export const pagamenti = (db: Db, id: string) =>
  q(db, 'select id, ruolo, motivo, da_rimborsare, centesimi from public.pagamenti where iscrizione_id = $1 order by ruolo, id', [id]);

export const segnaIngresso = async (db: Db, id: string, eventoId: string, ora: string, porta: string) =>
  (await uno(db, 'select public.segna_ingresso($1::uuid,$2::uuid,$3::timestamptz,$4) as r', [id, eventoId, ora, porta])).r as Json;

export const avviaRimborso = async (db: Db, pagamento: string, chiave: string, adesso: Date = ADESSO) =>
  (await uno(db, 'select public.avvia_rimborso($1,$2,$3,$4::timestamptz) as r', [pagamento, chiave, 'admin@esempio.it', adesso.toISOString()])).r as Json;
export const concludiRimborso = async (db: Db, pagamento: string, adesso: string = tra(5)) =>
  (await uno(db, "select public.concludi_rimborso($1,'admin@esempio.it',$2::timestamptz) as r", [pagamento, adesso])).r as Json;

export const usaToken = async (db: Db, token: string, adesso = ADESSO.toISOString()) =>
  (await uno(db, 'select public.usa_accesso_token($1,$2::timestamptz) as r', [token, adesso])).r as string | null;
export const usaCodice = async (db: Db, utenteId: string, codice: string, adesso = ADESSO.toISOString()) =>
  (await uno(db, 'select public.usa_accesso_codice($1::uuid,$2,$3::timestamptz) as r', [utenteId, codice, adesso])).r as boolean;

/** Una serata con un tipo di prevendita dentro, scritti direttamente (senza passare dalla copia). */
export async function nuovaSerata(db: Db, posti: number | null) {
  const eventoId = randomUUID();
  const lottoId = randomUUID();
  await db.query("insert into public.eventi (id, slug, nome, data, pubblicato) values ($1, $2, 'Serata di prova', $3::timestamptz, true)",
    [eventoId, `prova-${eventoId.slice(0, 8)}`, tra(60 * 24)]);
  await db.query("insert into public.lotti (id, evento_id, nome, prezzo, quantita) values ($1, $2, 'Lista', 10, $3)", [lottoId, eventoId, posti]);
  return { eventoId, lottoId };
}
