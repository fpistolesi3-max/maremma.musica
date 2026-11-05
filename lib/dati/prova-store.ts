import type { StoreTabelle } from './archivio-tabelle';
import type { LeggiTutto } from './tabelle';
import { uno, type Db } from './prova-vendite';

/** Lo store delle tabelle (lib/dati/archivio-tabelle.ts) sopra un database di prova: PGlite nei test normali, un Postgres vero in quelli di gara. */
export function storeDaDb(db: Db): StoreTabelle {
  return {
    leggiTutto: async () => (await uno(db, 'select public.leggi_tutto() as r')).r as LeggiTutto,
    verificaSql: async () => (await uno(db, 'select public.verifica_importo() as r')).r,
    async applica(modifiche) {
      try {
        await db.query('select public.applica_anagrafiche($1::jsonb)', [JSON.stringify(modifiche)]);
        return { ok: true };
      } catch (e) {
        if (/conflitto_scrittura/.test((e as Error).message)) return { conflitto: true };
        throw e;
      }
    },
  };
}
