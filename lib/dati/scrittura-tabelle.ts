import type { Archivio, EmailInviata, Evento, Lotto, Pr, StatoPorta, Tavolo, Utente } from './tipi';
import { canonico, type LeggiTutto } from './tabelle';

// Scrivere sulle tabelle senza riscrivere tutto: il codice continua a modificare una copia dell'`Archivio` (`modifica(fn)`), poi si calcola
// COSA è cambiato, riga per riga, e si manda alla funzione SQL `applica_anagrafiche()` (supabase/migrations/20261108000000_…). Funzioni pure.
// Vale per le anagrafiche: serate, tipi di prevendita, PR, utenti, tavoli (la configurazione), porte, registro email.
// Le vendite (iscrizioni, prenotazioni, accessi) hanno le loro operazioni e qui NON passano: se una modifica le tocca, ci si ferma.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

export const TABELLE_ANAGRAFICHE = ['eventi', 'pr', 'utenti', 'lotti', 'tavoli', 'porte', 'posta_inviata'] as const;
export type TabellaAnagrafica = (typeof TABELLE_ANAGRAFICHE)[number];

export interface Cambio { prima: R; colonne: R }
export interface ModificheTabella { nuovi: R[]; cambi: Cambio[]; eliminati: R[] }
/** Quello che si manda a `applica_anagrafiche()`: solo le tabelle con qualcosa da fare. */
export type Modifiche = Partial<Record<TabellaAnagrafica, ModificheTabella>>;

// ------------------------------------------------------------------ da oggetto a riga (l'inverso del compositore)

const daEvento = (e: Evento): R => ({
  id: e.id, numero: e.numero ?? null, slug: e.slug, nome: e.nome, data: e.data, data_fine: e.dataFine ?? null, location: e.location ?? null, comune: e.comune ?? null,
  lat: e.lat ?? null, lng: e.lng ?? null, location_segreta: e.locationSegreta ?? false, tipo_ingresso: e.tipoIngresso, descrizione: e.descrizione ?? null,
  highlight: e.highlight ?? null, dress_code: e.dressCode ?? null, lineup: e.lineup ?? [], info_arrivo: e.infoArrivo ?? null, locandina_url: e.locandinaUrl ?? null,
  piantina_url: e.piantinaUrl ?? null, prezzo_lista: e.prezzoLista ?? 0, senza_telefono: e.senzaTelefono ?? false, prevendita_fino_alle: e.prevenditaFinoAlle ?? null,
  capienza: e.capienza ?? null, eta_minima: e.etaMinima, pubblicato: e.pubblicato, in_copertina: e.inCopertina ?? false, pr_abilitati: e.prAbilitati ?? null,
  invio_link_pr: e.invioLinkPr ?? null, created_at: e.createdAt, updated_at: e.updatedAt,
});
const daLotto = (l: Lotto): R => ({
  id: l.id, evento_id: l.eventoId, nome: l.nome, prezzo: l.prezzo, quantita: l.quantita ?? null, data_inizio: l.dataInizio ?? null, data_fine: l.dataFine ?? null,
  visibile_da_pr: l.visibileDaPr, ordine: l.ordine, categoria: l.categoria ?? null, conferma_categoria: l.confermaCategoria ?? false,
  uscita_giorni_prima: l.uscitaGiorniPrima ?? null, fine_ore_prima: l.fineOrePrima ?? null, dopo_precedente: l.dopoPrecedente ?? false,
  pr_abilitati: l.prAbilitati ?? null, automatico: l.automatico ?? false,
});
const daPr = (p: Pr): R => ({ id: p.id, handle: p.handle, nome_display: p.nomeDisplay, stato: p.stato, created_at: p.createdAt });
const daUtente = (u: Utente): R => ({ id: u.id, email: u.email, ruolo: u.ruolo, pr_id: u.prId ?? null, created_at: u.createdAt });
// Lo stato del tavolo (libero / riservato / confermato) lo decidono le prenotazioni: nella tabella c'è solo "in vendita sì/no".
const daTavolo = (t: Tavolo): R => ({
  id: t.id, evento_id: t.eventoId, nome: t.nome, zona: t.zona ?? null, posti: t.posti ?? null, spesa_minima: t.spesaMinima, in_vendita: t.stato !== 'non_in_vendita',
  nota: t.nota ?? null, visibile_da_pr: t.visibileDaPr, pr_abilitati: t.prAbilitati ?? null, ordine: t.ordine, x: t.x ?? null, y: t.y ?? null,
});
// Quante persone sono entrate da una porta si calcola: nella tabella c'è solo l'ultima sincronizzazione.
const daPorta = (p: StatoPorta): R => ({ evento_id: p.eventoId, nome: p.nome, ultimo_sync: p.ultimoSync });
const daPosta = (e: EmailInviata): R => ({ id: e.id, a: e.a, oggetto: e.oggetto, html: e.html, inviata_at: e.inviataAt, via: e.via });

const SORGENTI: Record<TabellaAnagrafica, { elenco: (a: Archivio) => readonly unknown[]; riga: (x: never) => R; chiave: (r: R) => string; grezze: (raw: LeggiTutto) => R[] }> = {
  eventi: { elenco: (a) => a.eventi, riga: daEvento as (x: never) => R, chiave: (r) => r.id, grezze: (raw) => raw.eventi },
  pr: { elenco: (a) => a.pr, riga: daPr as (x: never) => R, chiave: (r) => r.id, grezze: (raw) => raw.pr },
  utenti: { elenco: (a) => a.utenti, riga: daUtente as (x: never) => R, chiave: (r) => r.id, grezze: (raw) => raw.utenti },
  lotti: { elenco: (a) => a.lotti, riga: daLotto as (x: never) => R, chiave: (r) => r.id, grezze: (raw) => raw.lotti },
  tavoli: { elenco: (a) => a.tavoli, riga: daTavolo as (x: never) => R, chiave: (r) => r.id, grezze: (raw) => raw.tavoli },
  porte: { elenco: (a) => a.porte, riga: daPorta as (x: never) => R, chiave: (r) => `${r.evento_id}|${r.nome}`, grezze: (raw) => raw.porte },
  posta_inviata: { elenco: (a) => a.posta, riga: daPosta as (x: never) => R, chiave: (r) => r.id, grezze: (raw) => raw.posta },
};

/** Forma stabile di un valore, per sapere se due righe sono uguali (istanti come numeri, chiavi in ordine). */
function stabile(v: unknown): string {
  return JSON.stringify(canonico(v), (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as R).sort(([a], [b]) => a.localeCompare(b))) : x));
}

/**
 * Cosa è cambiato fra `prima` (l'archivio com'era quando l'abbiamo letto) e `dopo` (dopo la modifica): righe nuove, colonne cambiate (con la
 * riga com'era, per accorgersi se nel frattempo l'ha cambiata qualcun altro) e righe tolte. `raw` sono le righe lette dal database.
 */
export function calcolaModifiche(prima: Archivio, dopo: Archivio, raw: LeggiTutto): Modifiche {
  const m: Modifiche = {};
  for (const tabella of TABELLE_ANAGRAFICHE) {
    const s = SORGENTI[tabella];
    const righePrima = new Map(s.elenco(prima).map((x) => { const r = s.riga(x as never); return [s.chiave(r), r] as const; }));
    const righeDopo = new Map(s.elenco(dopo).map((x) => { const r = s.riga(x as never); return [s.chiave(r), r] as const; }));
    const grezze = new Map(s.grezze(raw).map((r) => [s.chiave(r), r] as const));
    const t: ModificheTabella = { nuovi: [], cambi: [], eliminati: [] };
    for (const [k, r] of righeDopo) {
      const p = righePrima.get(k);
      if (!p) { t.nuovi.push(r); continue; }
      const colonne = Object.fromEntries(Object.keys(r).filter((c) => stabile(p[c]) !== stabile(r[c])).map((c) => [c, r[c]]));
      if (Object.keys(colonne).length) t.cambi.push({ prima: grezze.get(k)!, colonne });
    }
    for (const k of righePrima.keys()) if (!righeDopo.has(k)) t.eliminati.push(grezze.get(k)!);
    if (t.nuovi.length || t.cambi.length || t.eliminati.length) m[tabella] = t;
  }
  return m;
}

export const nessunaModifica = (m: Modifiche) => Object.keys(m).length === 0;

/** Quali parti dell'archivio che NON sono anagrafiche sono state cambiate (iscrizioni, prenotazioni, accessi, segreto, consegne). Lista vuota = tutto a posto. */
export function venditeToccate(prima: Archivio, dopo: Archivio): string[] {
  const nomi = ['iscrizioni', 'prenotazioni', 'accessi', 'consegne'] as const;
  const toccate: string[] = nomi.filter((n) => stabile(prima[n]) !== stabile(dopo[n]));
  if (prima.segreto !== dopo.segreto) toccate.push('segreto');
  return toccate;
}
