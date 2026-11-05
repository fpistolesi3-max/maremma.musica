import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Archivio } from './tipi';
import { componiArchivio, type LeggiTutto } from './tabelle';

// Archivio sulle tabelle del nuovo schema (supabase/migrations/20261104…–20261107…). Si usa solo con MM_ARCHIVIO=tabelle (lib/dati/archivio.ts).
// Questa tappa porta la LETTURA; la scrittura arriva con le tappe 5-7. Finché non c'è, `modifica` si ferma con un errore chiaro invece di
// scrivere da un'altra parte: così un interruttore girato troppo presto non produce dati a metà.

/** Il minimo che serve: così i test lo sostituiscono con uno in memoria. */
export interface StoreTabelle {
  /** Tutte le tabelle in un viaggio (funzione SQL `leggi_tutto()`). */
  leggiTutto(): Promise<LeggiTutto>;
  /** Conteggi e id di `verifica_importo()`: confronta la riga unica con le tabelle, senza dati. */
  verificaSql(): Promise<unknown>;
}

export function storeSupabaseTabelle(url: string, chiave: string): StoreTabelle {
  const sb = createClient(url, chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next non deve mai tenere in cache queste risposte.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return {
    async leggiTutto() {
      const { data, error } = await sb.rpc('leggi_tutto');
      if (error) throw new Error(`Archivio: lettura dalle tabelle non riuscita (${error.message}). Le migrazioni del nuovo schema sono applicate?`);
      return data as LeggiTutto;
    },
    async verificaSql() {
      const { data, error } = await sb.rpc('verifica_importo');
      if (error) throw new Error(`Archivio: verifica non riuscita (${error.message})`);
      return data;
    },
  };
}

export const ERRORE_SCRITTURA_TABELLE =
  'Archivio: la scrittura sulle tabelle non è ancora pronta (tappe 5-7 del passaggio allo schema). Riporta MM_ARCHIVIO a "riga" su Vercel e rifai il deploy.';

export function archivioTabelle(store: StoreTabelle, normalizza: (d: Archivio) => Archivio) {
  return {
    async leggi(): Promise<Readonly<Archivio>> {
      const raw = await store.leggiTutto();
      // L'orologio è quello del database: è lo stesso della vista `tavoli_con_stato`.
      return normalizza(componiArchivio(raw, new Date(raw.adesso)));
    },
    modifica<T>(_fn: (dati: Archivio) => T | Promise<T>): Promise<T> {
      return Promise.reject(new Error(ERRORE_SCRITTURA_TABELLE));
    },
  };
}
