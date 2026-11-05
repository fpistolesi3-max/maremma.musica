import 'server-only';
import { modalitaCorrente, normalizza as normalizzaArchivio, stores } from './archivio';
import type { StoreRemoto } from './archivio-remoto';
import type { StoreTabelle } from './archivio-tabelle';
import { componiArchivio, confrontaArchivi } from './tabelle';
import type { Archivio } from './tipi';
import type { Sessione } from '../sessione';

// Strumenti per il passaggio dalla riga unica alle tabelle (PIANO-SCHEMA.md, sezioni 3.2, 3.4 e 3.5). Solo admin.
// - verificaArchivio: confronta la riga con le tabelle e restituisce SOLO numeri e nomi di campi, mai valori (dentro ci sono dati personali);
// - ripristinaRiga: il ritorno indietro. Riscrive la riga unica con quello che c'è nelle tabelle, così si può spegnere l'interruttore
//   senza perdere le scritture fatte nel frattempo.

function soloAdmin(s: Sessione) {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

export interface EsitoVerifica {
  /** Vero se il confronto campo per campo e la verifica del database dicono entrambi "uguali". */
  ok: boolean;
  versioneRiga: number | null;
  /** Risposta di `verifica_importo()`: conteggi, id mancanti o in più, impronta del segreto, versione. */
  sql: unknown;
  /** Nomi dei campi che differiscono (mai i valori), es. `iscrizioni[3f9a1c2b].stato`. */
  differenze: string[];
  conteggi: { riga: Record<string, number>; tabelle: Record<string, number> };
}

const conta = (a: Archivio) => ({
  eventi: a.eventi.length, lotti: a.lotti.length, pr: a.pr.length, utenti: a.utenti.length, iscrizioni: a.iscrizioni.length,
  tavoli: a.tavoli.length, prenotazioni: a.prenotazioni.length, accessi: a.accessi.length, porte: a.porte.length,
});

/** Il confronto vero e proprio, con gli store passati da fuori (i test usano quelli in memoria). */
export async function verificaCon(riga: StoreRemoto, tabelle: StoreTabelle, normalizza: (d: Archivio) => Archivio): Promise<EsitoVerifica> {
  const r = await riga.leggi();
  const raw = await tabelle.leggiTutto();
  const adesso = new Date(raw.adesso);
  const dalleTabelle = componiArchivio(raw, adesso);
  const sql = await tabelle.verificaSql();
  if (!r) {
    return { ok: false, versioneRiga: null, sql, differenze: ['la riga unica non esiste'], conteggi: { riga: {}, tabelle: conta(dalleTabelle) } };
  }
  const dallaRiga = normalizza(structuredClone(r.dati));
  const differenze = confrontaArchivi(dallaRiga, dalleTabelle, adesso);
  const sqlOk = typeof sql === 'object' && sql !== null && (sql as { ok?: unknown }).ok === true;
  return { ok: differenze.length === 0 && sqlOk, versioneRiga: r.versione, sql, differenze, conteggi: { riga: conta(dallaRiga), tabelle: conta(dalleTabelle) } };
}

export async function verificaArchivio(s: Sessione): Promise<EsitoVerifica> {
  soloAdmin(s);
  if (!stores.riga || !stores.tabelle) throw new Error('La verifica serve solo online, con Supabase configurato.');
  return verificaCon(stores.riga, stores.tabelle, normalizzaArchivio);
}

/** Il ritorno indietro: scrive nella riga unica quello che c'è nelle tabelle. Chi ha fretta di spegnere l'interruttore lo fa dopo. */
export async function ripristinaRigaCon(riga: StoreRemoto, tabelle: StoreTabelle, normalizza: (d: Archivio) => Archivio): Promise<{ versione: number; serate: number }> {
  const raw = await tabelle.leggiTutto();
  const dati = normalizza(componiArchivio(raw, new Date(raw.adesso)));
  // Tabelle vuote o non copiate: riscrivere la riga le svuoterebbe. Meglio fermarsi.
  if (dati.eventi.length === 0) throw new Error('Le tabelle non hanno nessuna serata: non riscrivo la riga unica.');
  for (let tentativo = 1; tentativo <= 5; tentativo++) {
    const corrente = await riga.leggi();
    if (!corrente) { await riga.crea(dati); return { versione: 1, serate: dati.eventi.length }; }
    if (await riga.scrivi(corrente.versione, dati)) return { versione: corrente.versione + 1, serate: dati.eventi.length };
  }
  throw new Error('La riga unica è cambiata mentre la riscrivevo: riprova.');
}

export async function ripristinaRiga(s: Sessione) {
  soloAdmin(s);
  if (!stores.riga || !stores.tabelle) throw new Error('Il ripristino serve solo online, con Supabase configurato.');
  // Con l'interruttore spento il sito usa già la riga: riscriverla con le tabelle (ferme) cancellerebbe le scritture più recenti.
  if (modalitaCorrente() !== 'tabelle') throw new Error('Il ripristino ha senso solo quando il sito usa le tabelle: ora usa la riga unica.');
  return ripristinaRigaCon(stores.riga, stores.tabelle, normalizzaArchivio);
}
