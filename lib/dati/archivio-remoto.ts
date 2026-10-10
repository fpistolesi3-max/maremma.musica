import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Archivio } from './tipi';

// Archivio su Supabase per l'istanza online (Vercel non ha un disco che resta).
// Passo intermedio: l'intero archivio è una riga jsonb con un numero di versione.
// Ogni scrittura è "compare-and-swap": parte solo se nessuno ha scritto nel frattempo, altrimenti
// si rilegge e si riprova, così due iscrizioni insieme non si cancellano a vicenda.
// Il modello relazionale vero è in supabase/migrations/…_schema.sql (da collegare prima del lancio).

export interface Riga { versione: number; dati: Archivio }

/** Il minimo che serve allo store: così i test lo sostituiscono con uno in memoria. */
export interface StoreRemoto {
  leggi(): Promise<Riga | null>;
  /** Crea la riga se non esiste (no-op se c'è già). */
  crea(dati: Archivio): Promise<void>;
  /** Scrive solo se la versione nel database è ancora quella letta. */
  scrivi(versioneAttesa: number, dati: Archivio): Promise<boolean>;
}

export const TENTATIVI_MAX = 12;

export function storeSupabase(url: string, chiave: string): StoreRemoto {
  const sb = createClient(url, chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next non deve mai tenere in cache queste risposte.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  const T = 'archivio_mvp';
  return {
    async leggi() {
      const { data, error } = await sb.from(T).select('versione,dati').eq('id', 1).maybeSingle();
      if (error) throw new Error(`Archivio: lettura non riuscita (${error.message})`);
      return data ? { versione: Number(data.versione), dati: data.dati as Archivio } : null;
    },
    async crea(dati) {
      const { error } = await sb.from(T).upsert({ id: 1, versione: 1, dati }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error(`Archivio: creazione non riuscita (${error.message})`);
    },
    async scrivi(versioneAttesa, dati) {
      const { data, error } = await sb.from(T)
        .update({ versione: versioneAttesa + 1, dati, updated_at: new Date().toISOString() })
        .eq('id', 1).eq('versione', versioneAttesa).select('versione');
      if (error) throw new Error(`Archivio: scrittura non riuscita (${error.message})`);
      return (data?.length ?? 0) > 0;
    },
  };
}

export function archivioRemoto(store: StoreRemoto, iniziale: () => Archivio, normalizza: (d: Archivio) => Archivio) {
  async function carica(): Promise<Riga> {
    let riga = await store.leggi();
    if (!riga) {
      await store.crea(iniziale()); // se due richieste arrivano insieme vince la prima
      riga = await store.leggi();
      if (!riga) throw new Error('Archivio: riga non trovata dopo la creazione. Hai applicato la migrazione archivio_mvp?');
    }
    return { versione: riga.versione, dati: normalizza(riga.dati) };
  }

  // Nel processo le scritture passano comunque una alla volta: meno scontri tra richieste vicine.
  let coda: Promise<unknown> = Promise.resolve();

  return {
    async leggi(): Promise<Readonly<Archivio>> {
      return (await carica()).dati;
    },
    modifica<T>(fn: (dati: Archivio) => T | Promise<T>): Promise<T> {
      const lavoro = coda.then(async () => {
        for (let tentativo = 1; tentativo <= TENTATIVI_MAX; tentativo++) {
          const { versione, dati } = await carica();
          const copia = structuredClone(dati);
          const risultato = await fn(copia);
          if (await store.scrivi(versione, copia)) return risultato;
          await new Promise((r) => setTimeout(r, Math.random() * 30 * tentativo));
        }
        throw new Error('Archivio: troppe scritture in contemporanea, riprova.');
      });
      coda = lavoro.catch(() => undefined);
      return lavoro;
    },
  };
}
