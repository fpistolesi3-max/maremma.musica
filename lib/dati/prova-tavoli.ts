import { randomUUID } from 'node:crypto';
import { ADESSO, tra, uno, type Db, type Json } from './prova-vendite';

// Aiuti per provare le funzioni dei tavoli (supabase/migrations/20261106000000_schema_tavoli.sql), uguali per i test su PGlite
// e per quelli di gara. Solo per i test: non li importa nessun file dell'app.

/** Un tavolo di una serata, scritto direttamente. */
export async function nuovoTavolo(db: Db, eventoId: string, o: { nome?: string; posti?: number | null; spesa?: number; inVendita?: boolean } = {}) {
  const id = randomUUID();
  await db.query('insert into public.tavoli (id, evento_id, nome, posti, spesa_minima, in_vendita) values ($1, $2, $3, $4, $5, $6)',
    [id, eventoId, o.nome ?? `T${id.slice(0, 6)}`, o.posti === undefined ? 6 : o.posti, o.spesa ?? 100, o.inVendita ?? true]);
  return id;
}

export interface Richiesta {
  id: string; prId: string | null; nome: string; cognome: string; email: string; telefono: string; persone: number;
  scade: string; inseritaDa: string; adesso: string;
}

/** Chiama prenota_tavolo con valori ragionevoli; `o` cambia quello che serve. Restituisce l'esito con l'id della prenotazione. */
export async function prenota(db: Db, tavoloId: string, o: Partial<Richiesta> = {}) {
  const r: Richiesta = {
    id: randomUUID(), prId: null, nome: 'Anna', cognome: 'Prova', email: `anna-${randomUUID().slice(0, 8)}@esempio.it`,
    telefono: `+39 333 ${Math.floor(1000000 + Math.random() * 8999999)}`, persone: 4, scade: tra(30), inseritaDa: 'cliente', adesso: ADESSO.toISOString(), ...o,
  };
  const x = await uno(db, 'select public.prenota_tavolo($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11,$12,$13::timestamptz) as r',
    [r.id, tavoloId, r.prId, r.nome, r.cognome, r.email, r.telefono, r.persone, r.scade, `MM1.${r.id}`, r.id.slice(0, 8).toUpperCase(), r.inseritaDa, r.adesso]);
  return { id: r.id, email: r.email, telefono: r.telefono, ...(x.r as Json) } as { id: string; email: string; telefono: string; esito: string };
}

export const confermaTavolo = async (db: Db, id: string, pagamento: string, o: { centesimi?: number; valuta?: string; importoOk?: boolean; adesso?: string } = {}) =>
  (await uno(db, 'select public.conferma_pagamento_prenotazione($1::uuid,$2,$3,$4,$5,$6::timestamptz) as r',
    [id, pagamento, o.centesimi ?? 10000, o.valuta ?? 'eur', o.importoOk ?? true, o.adesso ?? ADESSO.toISOString()])).r as Json;

export const annullaPrenotazione = async (db: Db, id: string, da = 'admin@esempio.it', adesso = ADESSO.toISOString()) =>
  (await uno(db, 'select public.annulla_prenotazione($1::uuid,$2,$3::timestamptz) as r', [id, da, adesso])).r as Json;

export const ingressoTavolo = async (db: Db, id: string, rif: string, porta = 'P1', ora = ADESSO.toISOString(), adesso = ADESSO.toISOString()) =>
  (await uno(db, 'select public.ingresso_tavolo($1::uuid,$2,$3::timestamptz,$4,$5::timestamptz) as r', [id, rif, ora, porta, adesso])).r as Json;

export const statoPrenotazione = async (db: Db, id: string) => (await uno(db, 'select stato from public.prenotazioni_tavoli where id = $1', [id])).stato as string;
export const attivePerTavolo = async (db: Db, tavoloId: string) =>
  Number((await uno(db, "select count(*)::int as n from public.prenotazioni_tavoli where tavolo_id = $1 and stato in ('in_attesa', 'confermata')", [tavoloId])).n);
