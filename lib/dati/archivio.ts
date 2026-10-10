import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Archivio } from './tipi';
import { datiIniziali } from './seed';
import { archivioRemoto, storeSupabase } from './archivio-remoto';

// Unico punto che tocca il salvataggio. Due modi:
// - locale (default): file .data/db.json, per lo sviluppo offline;
// - Supabase: se ci sono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (istanza online su Vercel).

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
function normalizza(d: Archivio): Archivio {
  d.consegne ??= [];
  d.tavoli ??= [];
  for (const i of d.iscrizioni) {
    i.canale ??= 'diretto';
    i.consegnaId ??= null;
    i.origine ??= 'lista';
    i.rifCassa ??= null;
  }
  for (const e of d.eventi) { e.prezzoCassa ??= null; e.piantinaUrl ??= null; }
  for (const t of d.tavoli) { t.x ??= null; t.y ??= null; }
  return d;
}

async function salva(dati: Archivio) {
  await fs.mkdir(CARTELLA, { recursive: true });
  const tmp = `${FILE}.${randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(dati, null, 1));
  await fs.rename(tmp, FILE);
}

const remoto = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? archivioRemoto(
    storeSupabase(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY),
    () => datiIniziali(randomBytes(32).toString('base64url')),
    normalizza,
  )
  : null;

/** Quante email di prova tenere: nell'archivio remoto si rilegge tutto a ogni richiesta, meglio leggero. */
export const MAX_POSTA = remoto ? 20 : 200;

/** Lettura: restituisce l'archivio corrente (non modificarlo). */
export async function leggi(): Promise<Readonly<Archivio>> {
  if (remoto) return remoto.leggi();
  await cache.coda;
  return carica();
}

/** Scrittura: le modifiche passano una alla volta, così due iscrizioni non si pestano i piedi. */
export function modifica<T>(fn: (dati: Archivio) => T | Promise<T>): Promise<T> {
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

export const CARTELLA_MEDIA = path.join(CARTELLA, 'media');
