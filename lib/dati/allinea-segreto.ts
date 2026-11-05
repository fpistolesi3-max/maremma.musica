import 'server-only';
import { scriviSegretoSalvato, segretoSalvato } from './archivio';
import type { Sessione } from '../sessione';

// Allinea il segreto del database a quello di `MM_SEGRETO` (la variabile di Vercel). Il sito firma QR, codici e cookie di accesso con la
// variabile se c'è; il segreto del database serve solo se la variabile sparisce, e in quel caso tutti i QR emessi smetterebbero di valere.
// Questa azione (solo admin) copia il valore della variabile nel database, cioè dove il sito ha già in mano il valore giusto.
// Il valore NON esce mai da qui: né nella risposta, né nei messaggi di errore, né nei log. Si dice solo "uguale" o "diverso".

export interface EsitoAllineamento {
  ok: boolean;
  /** Vero se, finita l'azione, il segreto del database è uguale a `MM_SEGRETO` (anche se lo era già). */
  allineato: boolean;
  /** Una frase in italiano semplice, senza il valore. */
  motivo: string;
}

/** Dove sta il segreto del database: così i test lo sostituiscono con uno in memoria. */
export interface SegretoNelDatabase {
  leggi(): Promise<string | null>;
  scrivi(nuovo: string): Promise<void>;
}

const MOTIVI = {
  senzaVariabile: 'Su Vercel la chiave segreta (MM_SEGRETO) non c’è: non ho cambiato niente.',
  giaUguale: 'È già tutto a posto: la chiave nel database è uguale a quella del sito. Non ho scritto niente.',
  fatto: 'Fatto: la chiave nel database ora è uguale a quella del sito.',
  nonRiuscito: 'Non sono riuscito ad aggiornare il database. Riprova tra poco; se succede ancora, dillo a chi cura il sito.',
  nonCombacia: 'Ho scritto, ma rileggendo la chiave nel database non è uguale a quella del sito. Riprova tra poco.',
} as const;

/** Il confronto vero e proprio, con la variabile e il database passati da fuori (i test usano quelli finti). Non lancia mai: il valore non deve finire in un errore. */
export async function allineaSegretoCon(variabile: string | undefined, db: SegretoNelDatabase): Promise<EsitoAllineamento> {
  if (!variabile) return { ok: true, allineato: false, motivo: MOTIVI.senzaVariabile };
  try {
    if ((await db.leggi()) === variabile) return { ok: true, allineato: true, motivo: MOTIVI.giaUguale };
    await db.scrivi(variabile);
    if ((await db.leggi()) !== variabile) return { ok: false, allineato: false, motivo: MOTIVI.nonCombacia };
    return { ok: true, allineato: true, motivo: MOTIVI.fatto };
  } catch {
    // Niente `e.message` e niente log: un messaggio del database potrebbe riportare il valore.
    return { ok: false, allineato: false, motivo: MOTIVI.nonRiuscito };
  }
}

/** Solo admin. Usa il database attivo (tabelle o riga unica, come decide `interruttoreArchivio()` in ./tabelle). */
export async function allineaSegreto(s: Sessione): Promise<EsitoAllineamento> {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
  return allineaSegretoCon(process.env.MM_SEGRETO, { leggi: segretoSalvato, scrivi: scriviSegretoSalvato });
}
