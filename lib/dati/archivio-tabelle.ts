import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Archivio } from './tipi';
import { componiArchivio, type LeggiTutto } from './tabelle';
import { calcolaModifiche, nessunaModifica, venditeToccate, type Modifiche } from './scrittura-tabelle';

// Archivio sulle tabelle del nuovo schema (supabase/migrations/20261104…–20261108…). Si usa quando l'archivio sta nelle tabelle: produzione, o MM_ARCHIVIO=tabelle (lib/dati/archivio.ts, lib/dati/tabelle.ts).
// Lettura: `leggi_tutto()` in un viaggio. Scrittura delle ANAGRAFICHE (serate, tipi, PR, utenti, tavoli, porte, registro email): `modifica(fn)`
// funziona come prima (si modifica una copia), ma poi si scrivono solo le righe cambiate, con controllo riga per riga: due persone che toccano
// righe diverse non si disturbano. La scrittura delle VENDITE (iscrizioni, prenotazioni, accessi) arriva con le tappe 6-7: finché non c'è, una
// modifica che le tocca si ferma con un errore chiaro invece di scrivere da un'altra parte.

/** Esito di `applica_anagrafiche()`: `conflitto` = una riga è stata cambiata da un altro dopo la nostra lettura. */
export type EsitoApplica = { ok: true } | { conflitto: true };

/** Il minimo che serve: così i test lo sostituiscono con uno in memoria. */
export interface StoreTabelle {
  /** Tutte le tabelle in un viaggio (funzione SQL `leggi_tutto()`). */
  leggiTutto(): Promise<LeggiTutto>;
  /** Conteggi e id di `verifica_importo()`: confronta la riga unica con le tabelle, senza dati. */
  verificaSql(): Promise<unknown>;
  /** Applica in una transazione le righe nuove, cambiate e tolte delle anagrafiche (funzione SQL `applica_anagrafiche()`). */
  applica(modifiche: Modifiche): Promise<EsitoApplica>;
  /** Cambia SOLO il segreto dei QR (`impostazioni.segreto`), senza passare dalle anagrafiche. Lo usa solo `allineaSegreto()`. Si ferma se la riga del segreto non c'è. */
  scriviSegreto(valore: string): Promise<void>;
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
    async applica(modifiche) {
      const { error } = await sb.rpc('applica_anagrafiche', { p: modifiche });
      if (!error) return { ok: true };
      if (/conflitto_scrittura/.test(error.message)) return { conflitto: true };
      throw new Error(`Archivio: scrittura sulle tabelle non riuscita (${error.message})`);
    },
    async scriviSegreto(valore) {
      // Messaggi senza il testo dell'errore del database: il valore non deve poter finire in un messaggio o in un log.
      const { data, error } = await sb.from('impostazioni').update({ valore, updated_at: new Date().toISOString() }).eq('chiave', 'segreto').select('chiave');
      if (error) throw new Error('Archivio: scrittura del segreto non riuscita.');
      if (!data?.length) throw new Error('Archivio: il segreto non è nelle tabelle (impostazioni): niente da aggiornare.');
    },
  };
}

export const TENTATIVI_TABELLE_MAX = 12;

export const erroreVenditeTabelle = (toccate: string[]) =>
  `Archivio: questa operazione modifica ${toccate.join(', ')}, che sulle tabelle passano dalle operazioni dedicate (tappe 6-7 del passaggio allo schema, non ancora pronte). `
  + 'Per tornare alla riga unica imposta MM_ARCHIVIO a "riga" su Vercel e rifai il deploy.';

interface Opzioni {
  tentativi?: number;
  /** Pausa prima di riprovare dopo un conflitto (i test la azzerano). */
  attesa?: (tentativo: number) => Promise<void>;
}

export function archivioTabelle(store: StoreTabelle, normalizza: (d: Archivio) => Archivio, opzioni: Opzioni = {}) {
  const tentativiMax = opzioni.tentativi ?? TENTATIVI_TABELLE_MAX;
  const attesa = opzioni.attesa ?? ((n: number) => new Promise<void>((r) => setTimeout(r, Math.random() * 30 * n)));
  // Nel processo le scritture passano comunque una alla volta: meno conflitti fra richieste vicine.
  let coda: Promise<unknown> = Promise.resolve();

  async function carica() {
    const raw = await store.leggiTutto();
    // L'orologio è quello del database: è lo stesso della vista `tavoli_con_stato`.
    return { raw, archivio: normalizza(componiArchivio(raw, new Date(raw.adesso))) };
  }

  return {
    async leggi(): Promise<Readonly<Archivio>> {
      return (await carica()).archivio;
    },
    modifica<T>(fn: (dati: Archivio) => T | Promise<T>): Promise<T> {
      const lavoro = coda.then(async () => {
        for (let tentativo = 1; tentativo <= tentativiMax; tentativo++) {
          const { raw, archivio: prima } = await carica();
          const copia = structuredClone(prima);
          const risultato = await fn(copia);     // un errore della funzione (controlli, permessi) passa com'è, senza riprovare
          const toccate = venditeToccate(prima, copia);
          if (toccate.length) throw new Error(erroreVenditeTabelle(toccate));
          const modifiche = calcolaModifiche(prima, copia, raw);
          if (nessunaModifica(modifiche)) return risultato;
          const esito = await store.applica(modifiche);
          if ('ok' in esito) return risultato;
          await attesa(tentativo);                // qualcuno ha cambiato una delle nostre righe: si rilegge e si rifà
        }
        throw new Error('Archivio: troppe scritture in contemporanea, riprova.');
      });
      coda = lavoro.catch(() => undefined);
      return lavoro;
    },
  };
}
