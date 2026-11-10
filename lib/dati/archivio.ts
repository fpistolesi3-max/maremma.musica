import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Archivio } from './tipi';
import { datiIniziali } from './seed';
import { archivioRemoto, storeSupabase, type StoreRemoto } from './archivio-remoto';
import { archivioTabelle, storeSupabaseTabelle, type StoreTabelle } from './archivio-tabelle';
import { modalitaArchivio } from './tabelle';
import { operazioniDa, rpcSupabase, type Operazioni, type Rpc } from './operazioni';

// Unico punto che tocca il salvataggio. Due modi:
// - locale (default): file .data/db.json, per lo sviluppo offline;
// - Supabase: se ci sono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (istanza online su Vercel). Lì l'archivio sta nelle tabelle del nuovo
//   schema (PIANO-SCHEMA.md) in produzione (`VERCEL_ENV=production`), oppure nella riga unica `archivio_mvp` altrove (Preview) o con
//   MM_ARCHIVIO=riga. La variabile, se c'è, vince sempre; la decisione sta in un solo punto: `interruttoreArchivio()` in ./tabelle.
//   Tutte le scritture hanno la loro strada sulle tabelle (anagrafiche, prevendite, tavoli, porta, accessi: tappe 5-7).

const CARTELLA = process.env.MM_CARTELLA_DATI || path.join(process.cwd(), '.data');
const FILE = path.join(CARTELLA, 'db.json');

type Cache = { dati: Archivio | null; caricamento: Promise<Archivio> | null; coda: Promise<unknown> };
const g = globalThis as unknown as { __mmArchivio?: Cache };
const cache: Cache = (g.__mmArchivio ??= { dati: null, caricamento: null, coda: Promise.resolve() });

function carica(): Promise<Archivio> {
  if (cache.dati) return Promise.resolve(cache.dati);
  // Un solo caricamento anche se arrivano più richieste insieme al primo avvio.
  cache.caricamento ??= (async () => {
    let dati: Archivio;
    try {
      dati = JSON.parse(await fs.readFile(FILE, 'utf8')) as Archivio;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      dati = datiIniziali(randomBytes(32).toString('base64url'));
      await salva(dati);
    }
    cache.dati = normalizza(dati);
    return cache.dati;
  })().finally(() => { cache.caricamento = null; });
  return cache.caricamento;
}

/** Aggiorna un archivio salvato con una versione precedente (campi aggiunti dopo). */
export function normalizza(d: Archivio): Archivio {
  d.consegne ??= [];
  d.tavoli ??= [];
  d.prenotazioni ??= [];
  for (const i of d.iscrizioni) {
    i.canale ??= 'diretto';
    i.consegnaId ??= null;
    i.origine ??= 'lista';
    i.scade ??= null;
    i.pagamentoOnline ??= null;
    // Prima che la prevendita passasse dal sito: chi era in lista senza aver pagato, o aveva pagato al PR, diventa
    // pagato con un pagamento di prova (sono solo dati di esempio e di prova: 26.10.2026).
    const vecchiaDaPagare = i.origine === 'lista' && i.importo > 0 && i.stato === 'in_lista';
    if (vecchiaDaPagare || (i.metodoPagamento as string) === 'pr') {
      if (vecchiaDaPagare) i.stato = 'pagato';
      i.metodoPagamento = 'online';
      i.pagatoAt ??= i.createdAt;
      i.pagamentoOnline = { sessione: null, pagamento: `prova_import_${i.id}`, daRimborsare: false };
    }
  }
  for (const p of d.prenotazioni) {
    p.ingressi ??= []; p.promemoriaAt ??= null;
    p.metodoPagamento ??= null; p.pagatoDa ??= null; p.chiusaDa ??= null; p.avvisoChiusuraAt ??= null; p.pagamentoOnline ??= null;
    p.anonimizzata ??= false; p.anonimizzataAt ??= null;
  }
  for (const l of d.lotti) {
    l.categoria ??= null; l.confermaCategoria ??= false; l.uscitaGiorniPrima ??= null; l.fineOrePrima ??= null;
    l.dopoPrecedente ??= false; l.prAbilitati ??= null;
  }
  for (const i of d.iscrizioni) { i.categoria ??= null; i.rifiutoIngresso ??= null; i.anonimizzata ??= false; i.etaAllaSerata ??= null; i.anonimizzataAt ??= null; }
  for (const e of d.eventi) { e.senzaTelefono ??= false; e.inCopertina ??= false; e.piantinaUrl ??= null; }
  for (const t of d.tavoli) { t.x ??= null; t.y ??= null; t.prAbilitati ??= null; }
  return d;
}

async function salva(dati: Archivio) {
  await fs.mkdir(CARTELLA, { recursive: true });
  const tmp = `${FILE}.${randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(dati, null, 1));
  await fs.rename(tmp, FILE);
}

const usaSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const storeRiga: StoreRemoto | null = usaSupabase ? storeSupabase(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) : null;
const storeDelleTabelle: StoreTabelle | null = usaSupabase ? storeSupabaseTabelle(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) : null;
const remoto = storeRiga
  ? archivioRemoto(storeRiga, () => datiIniziali(randomBytes(32).toString('base64url')), normalizza)
  : null;
let tabelle = modalitaArchivio() === 'tabelle' && storeDelleTabelle ? archivioTabelle(storeDelleTabelle, normalizza) : null;
let operazioniTabelle: Operazioni | null = tabelle && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? operazioniDa(rpcSupabase(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY))
  : null;

/** Lo store delle tabelle che sta davvero in uso (cambia solo nei test, con `usaTabelleDiProva`). */
let storeTabelleInUso: StoreTabelle | null = tabelle ? storeDelleTabelle : null;

/** Dove sta l'archivio in questo momento: la riga unica (o il file in locale) oppure le tabelle. */
export const modalitaCorrente = (): 'riga' | 'tabelle' => (tabelle ? 'tabelle' : 'riga');

/** Vero quando l'archivio sta nelle tabelle: le funzioni delle vendite usano le operazioni del database invece di `modifica()`. */
export const usaTabelle = () => tabelle !== null;

/** Le operazioni sulle vendite (funzioni SQL). Solo con l'archivio sulle tabelle: chi le chiama l'ha già controllato con `usaTabelle()`. */
export function operazioni(): Operazioni {
  if (!operazioniTabelle) throw new Error('Archivio: le operazioni sulle tabelle servono solo quando l\'archivio sta nelle tabelle (produzione, o MM_ARCHIVIO=tabelle).');
  return operazioniTabelle;
}

/**
 * SOLO PER I TEST: fa girare le funzioni dell'app sulle tabelle di un database di prova (PGlite) invece che sulla riga unica o sul file.
 * `null` rimette le cose com'erano. Non la chiama nessun file dell'app.
 */
export function usaTabelleDiProva(prova: { store: StoreTabelle; rpc: Rpc } | null) {
  storeTabelleInUso = prova ? prova.store : storeDelleTabelle;
  tabelle = prova ? archivioTabelle(prova.store, normalizza, { attesa: async () => undefined }) : null;
  operazioniTabelle = prova ? operazioniDa(prova.rpc) : null;
}

/** Solo per la verifica e il ripristino (lib/dati/verifica-archivio.ts): gli store con cui si parla a Supabase, o null in locale. */
export const stores = { riga: storeRiga, tabelle: storeDelleTabelle };

/** Quante email di prova tenere: nell'archivio remoto si rilegge tutto a ogni richiesta, meglio leggero. */
export const MAX_POSTA = remoto ? 20 : 200;

/** Lettura: restituisce l'archivio corrente (non modificarlo). */
export async function leggi(): Promise<Readonly<Archivio>> {
  if (tabelle) return tabelle.leggi();
  if (remoto) return remoto.leggi();
  await cache.coda;
  return carica();
}

/** Scrittura: le modifiche passano una alla volta, così due iscrizioni non si pestano i piedi. */
export function modifica<T>(fn: (dati: Archivio) => T | Promise<T>): Promise<T> {
  if (tabelle) return tabelle.modifica(fn);
  if (remoto) return remoto.modifica(fn);
  const lavoro = cache.coda.then(async () => {
    const dati = await carica();
    const copia = structuredClone(dati);
    const risultato = await fn(copia);
    await salva(copia);
    cache.dati = copia;
    return risultato;
  });
  cache.coda = lavoro.catch(() => undefined);
  return lavoro;
}

export async function segreto(): Promise<string> {
  return process.env.MM_SEGRETO || (await leggi()).segreto;
}

/**
 * Il segreto salvato nel database attivo (`impostazioni.segreto` sulle tabelle, il campo della riga unica altrimenti), NON quello di
 * `MM_SEGRETO`. Solo per `allineaSegreto()` (lib/dati/allinea-segreto.ts).
 */
export async function segretoSalvato(): Promise<string | null> {
  if (storeTabelleInUso && tabelle) return (await storeTabelleInUso.leggiTutto()).impostazioni?.segreto ?? null;
  return (await leggi()).segreto ?? null;
}

/** Cambia solo il segreto nel database attivo. Sulla riga unica passa da `modifica()`, quindi con la sua riprova se qualcun altro scrive nello stesso istante. */
export async function scriviSegretoSalvato(nuovo: string): Promise<void> {
  if (storeTabelleInUso && tabelle) return storeTabelleInUso.scriviSegreto(nuovo);
  await modifica((d) => { d.segreto = nuovo; });
}

export const CARTELLA_MEDIA = path.join(CARTELLA, 'media');
