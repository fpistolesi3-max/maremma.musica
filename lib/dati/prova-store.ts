import type { StoreTabelle } from './archivio-tabelle';
import type { Rpc } from './operazioni';
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

/** Il "telefono" verso le funzioni SQL (lib/dati/operazioni.ts) sopra un database di prova: argomenti con nome, oggetti e liste come JSON. */
export function rpcDaDb(db: Db): Rpc {
  return async (nome, args) => {
    const chiavi = Object.keys(args);
    const sql = `select public.${nome}(${chiavi.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    const valori = chiavi.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
    return (await uno(db, sql, valori)).r;
  };
}
