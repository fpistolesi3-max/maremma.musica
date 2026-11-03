import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CARTELLA_MEDIA, leggi } from './archivio';
import { soloAdmin } from './admin';
import type { Evento } from './tipi';
import type { Sessione } from '../sessione';
import { eventoPassato } from '../regole';
import {
  creditoPulito, fotoInEvidenza, fotoVisibili, MAX_BYTE_FILE, MAX_FOTO_SERATA, MAX_IN_EVIDENZA, perOrdine, percorsoGrande, percorsoMini,
  SCADENZA_CARICAMENTO_MS, spostaFoto, type Foto, type FotoVista,
} from '../foto';

// Foto delle serate. I dati NON stanno nella riga `archivio_mvp` (che si riscrive per intero a ogni vendita): hanno una
// tabella a parte, `foto_serate`, e un bucket Storage pubblico, `foto-serate`. In sviluppo, senza Supabase, stanno su
// disco (.data/foto.json e .data/media/foto/…), come le locandine. Chi non è admin non può caricare, cambiare o eliminare.
//
// Mai "leggi tutte le foto": Supabase restituisce al massimo 1000 righe per richiesta senza avvisare. Si legge per serata
// (o per gruppi di serate) a pagine con `range` esplicito, e una foto sola si cerca per `id`.

const URL_SB = process.env.SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'foto-serate';
const PAGINA = 1000;       // righe per richiesta: il massimo che Supabase restituisce
const GRUPPO = 100;        // quanti id nello stesso filtro `in(...)`, per non allungare troppo l'indirizzo
const SERATE_PER_VOLTA = 10;

// ── Dove stanno i dati ─────────────────────────────────────────────────────────────────────────────────────────────

interface Dati { foto: Foto[]; crediti: Record<string, string> }

interface StoreFoto {
  /** Le foto di queste serate (anche in caricamento), tutte, a pagine; con `soloVisibili` solo pronte e non nascoste. */
  perSerate(eventoIds: string[], opzioni?: { soloVisibili?: boolean }): Promise<Foto[]>;
  perId(id: string): Promise<Foto | null>;
  /** Quali di queste serate hanno almeno una foto pronta (anche nascosta): una lettura a gruppi, solo la colonna della serata. */
  conFoto(eventoIds: string[]): Promise<Set<string>>;
  /** Somma dei byte di tutte le foto pronte (per lo spazio occupato). */
  byteTotali(): Promise<number>;
  inserisci(f: Foto): Promise<void>;
  aggiorna(id: string, patch: Partial<Omit<Foto, 'id' | 'eventoId'>>): Promise<void>;
  elimina(ids: string[]): Promise<void>;
  credito(eventoId: string): Promise<string>;
  crediti(eventoIds: string[]): Promise<Record<string, string>>;
  impostaCredito(eventoId: string, testo: string): Promise<void>;
}

/** Dove stanno i file: restituisce l'indirizzo per caricarli, per vederli e per controllarli. */
export interface Destinazione { tipo: 'firmato' | 'locale'; url: string }
interface Deposito {
  urlPubblico(percorso: string): string;
  destinazione(percorso: string): Promise<Destinazione>;
  /** Peso dei file, o null se non ci sono. */
  pesi(eventoId: string, id: string): Promise<{ grande: number | null; mini: number | null }>;
  rimuovi(percorsi: string[]): Promise<void>;
}

const gruppi = <T>(lista: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, (i + 1) * n));

const CARTELLA_FOTO = path.join(CARTELLA_MEDIA, 'foto');
const FILE_DATI = path.join(path.dirname(CARTELLA_MEDIA), 'foto.json');

function storeLocale(): StoreFoto {
  // La coda è una sola per tutto il processo: Next può caricare questo modulo più volte (azioni, route), e su Windows due
  // scritture insieme sullo stesso file danno EPERM.
  const g = globalThis as unknown as { __mmFotoCoda?: { coda: Promise<unknown> } };
  const stato = (g.__mmFotoCoda ??= { coda: Promise.resolve() });
  const carica = async (): Promise<Dati> => {
    try { return JSON.parse(await fs.readFile(FILE_DATI, 'utf8')) as Dati; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return { foto: [], crediti: {} };
    }
  };
  const modifica = <T>(fn: (d: Dati) => T): Promise<T> => {
    const lavoro = stato.coda.then(async () => {
      const d = await carica();
      const r = fn(d);
      await fs.mkdir(path.dirname(FILE_DATI), { recursive: true });
      const tmp = `${FILE_DATI}.${randomBytes(6).toString('hex')}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(d, null, 1));
      // Su Windows il rename può dare EPERM/EBUSY se qualcuno sta leggendo il file in quell'istante: si riprova.
      for (let tentativo = 1; ; tentativo++) {
        try { await fs.rename(tmp, FILE_DATI); break; } catch (e) {
          const codice = (e as NodeJS.ErrnoException).code;
          if (tentativo >= 6 || (codice !== 'EPERM' && codice !== 'EBUSY')) { await fs.rm(tmp, { force: true }); throw e; }
          await new Promise((ok) => setTimeout(ok, 20 * tentativo));
        }
      }
      return r;
    });
    stato.coda = lavoro.catch(() => undefined);
    return lavoro;
  };
  const leggiDati = async () => { await stato.coda; return carica(); };
  return {
    async perSerate(eventoIds, o) {
      const { foto } = await leggiDati();
      return foto.filter((f) => eventoIds.includes(f.eventoId) && (!o?.soloVisibili || (f.pronta && !f.nascosta)));
    },
    async perId(id) { return (await leggiDati()).foto.find((f) => f.id === id) ?? null; },
    async conFoto(eventoIds) { return new Set((await leggiDati()).foto.filter((f) => f.pronta && eventoIds.includes(f.eventoId)).map((f) => f.eventoId)); },
    async byteTotali() { return (await leggiDati()).foto.filter((f) => f.pronta).reduce((n, f) => n + f.byte, 0); },
    inserisci: (f) => modifica((d) => { d.foto.push(f); }),
    aggiorna: (id, patch) => modifica((d) => { const f = d.foto.find((x) => x.id === id); if (f) Object.assign(f, patch); }),
    elimina: (ids) => modifica((d) => { d.foto = d.foto.filter((f) => !ids.includes(f.id)); }),
    async credito(eventoId) { return (await leggiDati()).crediti[eventoId] ?? ''; },
    async crediti(eventoIds) { const c = (await leggiDati()).crediti; return Object.fromEntries(eventoIds.filter((id) => c[id]).map((id) => [id, c[id]])); },
    impostaCredito: (eventoId, testo) => modifica((d) => { if (testo) d.crediti[eventoId] = testo; else delete d.crediti[eventoId]; }),
  };
}

function depositoLocale(): Deposito {
  const peso = (p: string) => fs.stat(path.join(CARTELLA_FOTO, p)).then((s) => s.size, () => null);
  return {
    urlPubblico: (p) => `/media/foto/${p}`,
    async destinazione(p) {
      const [evento, file] = p.split('/');
      return { tipo: 'locale', url: `/api/admin/foto/carica?evento=${encodeURIComponent(evento)}&file=${encodeURIComponent(file)}` };
    },
    async pesi(eventoId, id) { return { grande: await peso(percorsoGrande(eventoId, id)), mini: await peso(percorsoMini(eventoId, id)) }; },
    async rimuovi(percorsi) { await Promise.all(percorsi.map((p) => fs.rm(path.join(CARTELLA_FOTO, p), { force: true }))); },
  };
}

type RigaFoto = { id: string; evento_id: string; ordine: number; in_evidenza: boolean; nascosta: boolean; larghezza: number; altezza: number; byte: number; pronta: boolean; creata_at: string };
const daRiga = (r: RigaFoto): Foto => ({
  id: r.id, eventoId: r.evento_id, ordine: r.ordine, inEvidenza: r.in_evidenza, nascosta: r.nascosta,
  larghezza: r.larghezza, altezza: r.altezza, byte: Number(r.byte), pronta: r.pronta, creataAt: r.creata_at,
});
const inRiga = (f: Partial<Foto>): Partial<RigaFoto> => ({
  ...(f.id !== undefined && { id: f.id }), ...(f.eventoId !== undefined && { evento_id: f.eventoId }), ...(f.ordine !== undefined && { ordine: f.ordine }),
  ...(f.inEvidenza !== undefined && { in_evidenza: f.inEvidenza }), ...(f.nascosta !== undefined && { nascosta: f.nascosta }),
  ...(f.larghezza !== undefined && { larghezza: f.larghezza }), ...(f.altezza !== undefined && { altezza: f.altezza }),
  ...(f.byte !== undefined && { byte: f.byte }), ...(f.pronta !== undefined && { pronta: f.pronta }), ...(f.creataAt !== undefined && { creata_at: f.creataAt }),
});

export function clienteSupabase(url: string, chiave: string): SupabaseClient {
  return createClient(url, chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next non deve mai tenere in cache queste risposte.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

function storeSupabase(sb: SupabaseClient): StoreFoto {
  const errore = (cosa: string, e: { message: string } | null) => { if (e) throw new Error(`Foto: ${cosa} non riuscito (${e.message})`); };
  /** Legge tutte le righe di una richiesta, una pagina alla volta con `range` esplicito. */
  async function pagine<T>(richiesta: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const out: T[] = [];
    for (let da = 0; ; da += PAGINA) {
      const { data, error } = await richiesta(da, da + PAGINA - 1);
      errore('lettura', error);
      out.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGINA) return out;
    }
  }
  return {
    async perSerate(eventoIds, o) {
      const righe: RigaFoto[] = [];
      for (const g of gruppi(eventoIds, GRUPPO)) {
        righe.push(...await pagine<RigaFoto>((da, a) => {
          let q = sb.from('foto_serate').select('*').in('evento_id', g);
          if (o?.soloVisibili) q = q.eq('pronta', true).eq('nascosta', false);
          return q.order('ordine').order('creata_at').order('id').range(da, a);
        }));
      }
      return righe.map(daRiga);
    },
    async perId(id) {
      const { data, error } = await sb.from('foto_serate').select('*').eq('id', id).maybeSingle();
      errore('lettura', error);
      return data ? daRiga(data as RigaFoto) : null;
    },
    async conFoto(eventoIds) {
      const con = new Set<string>();
      for (const g of gruppi(eventoIds, GRUPPO)) {
        const righe = await pagine<{ evento_id: string }>((da, a) => sb.from('foto_serate').select('evento_id').in('evento_id', g).eq('pronta', true).order('id').range(da, a));
        for (const r of righe) con.add(r.evento_id);
      }
      return con;
    },
    async byteTotali() {
      const righe = await pagine<{ byte: number }>((da, a) => sb.from('foto_serate').select('byte').eq('pronta', true).order('id').range(da, a));
      return righe.reduce((n, r) => n + Number(r.byte), 0);
    },
    async inserisci(f) { errore('salvataggio', (await sb.from('foto_serate').insert(inRiga(f))).error); },
    async aggiorna(id, patch) { errore('salvataggio', (await sb.from('foto_serate').update(inRiga(patch)).eq('id', id)).error); },
    async elimina(ids) { for (const g of gruppi(ids, GRUPPO)) errore('eliminazione', (await sb.from('foto_serate').delete().in('id', g)).error); },
    async credito(eventoId) {
      const { data, error } = await sb.from('serate_foto_credito').select('credito').eq('evento_id', eventoId).maybeSingle();
      errore('lettura', error);
      return (data?.credito as string | undefined) ?? '';
    },
    async crediti(eventoIds) {
      const out: Record<string, string> = {};
      for (const g of gruppi(eventoIds, GRUPPO)) {
        const { data, error } = await sb.from('serate_foto_credito').select('evento_id,credito').in('evento_id', g);
        errore('lettura', error);
        for (const r of data ?? []) out[r.evento_id as string] = r.credito as string;
      }
      return out;
    },
    async impostaCredito(eventoId, testo) {
      if (!testo) { errore('salvataggio', (await sb.from('serate_foto_credito').delete().eq('evento_id', eventoId)).error); return; }
      errore('salvataggio', (await sb.from('serate_foto_credito').upsert({ evento_id: eventoId, credito: testo }, { onConflict: 'evento_id' })).error);
    },
  };
}

function depositoSupabase(sb: SupabaseClient): Deposito {
  const b = sb.storage.from(BUCKET);
  return {
    urlPubblico: (p) => b.getPublicUrl(p).data.publicUrl,
    async destinazione(p) {
      const { data, error } = await b.createSignedUploadUrl(p);
      if (error || !data) throw new Error(`Caricamento foto non preparato (${error?.message ?? 'nessuna risposta'})`);
      return { tipo: 'firmato', url: data.signedUrl };
    },
    async pesi(eventoId, id) {
      const { data, error } = await b.list(eventoId, { search: id, limit: 10 });
      if (error) throw new Error(`Controllo foto non riuscito (${error.message})`);
      const peso = (nome: string) => {
        const o = data?.find((x) => x.name === nome);
        return o ? Number((o.metadata as { size?: number } | null)?.size ?? 0) : null;
      };
      return { grande: peso(`${id}.jpg`), mini: peso(`${id}-m.jpg`) };
    },
    async rimuovi(percorsi) {
      for (const g of gruppi(percorsi, GRUPPO)) {
        const { error } = await b.remove(g);
        if (error) throw new Error(`Eliminazione file non riuscita (${error.message})`);
      }
    },
  };
}

let remoto = false;
let store: StoreFoto = storeLocale();
let deposito: Deposito = depositoLocale();

/** Usa Supabase (store e Storage) con questo client. Parte da sola se ci sono le variabili d'ambiente; i test ci mettono un client finto. */
export function collegaSupabase(sb: SupabaseClient) {
  remoto = true;
  store = storeSupabase(sb);
  deposito = depositoSupabase(sb);
}
if (URL_SB && CHIAVE) collegaSupabase(clienteSupabase(URL_SB, CHIAVE));

const vista = (f: Foto): FotoVista => ({ ...f, urlGrande: deposito.urlPubblico(percorsoGrande(f.eventoId, f.id)), urlMini: deposito.urlPubblico(percorsoMini(f.eventoId, f.id)) });
const percorsiDi = (f: Pick<Foto, 'eventoId' | 'id'>) => [percorsoGrande(f.eventoId, f.id), percorsoMini(f.eventoId, f.id)];

// Le foto sono un di più: se non si leggono (Supabase giù, tabella non ancora creata) le pagine pubbliche e la serata live
// dell'admin si aprono lo stesso, senza foto, e l'errore resta nei log. La pagina Foto dell'admin invece l'errore lo mostra.
const fotoNonLette = (e: unknown) => console.error('[foto] foto delle serate non lette, pagina senza foto', e);

// ── Admin ──────────────────────────────────────────────────────────────────────────────────────────────────────────

async function serataEsistente(eventoId: string): Promise<Evento> {
  const e = (await leggi()).eventi.find((x) => x.id === eventoId);
  if (!e) throw new Error('Serata non trovata');
  return e;
}

const abbandonata = (f: Foto, adesso: number) => !f.pronta && adesso - new Date(f.creataAt).getTime() > SCADENZA_CARICAMENTO_MS;

/** La pagina Foto dell'admin: tutte le foto della serata (anche nascoste), il credito e lo spazio occupato. Solo letture. */
export async function fotoAdmin(s: Sessione, eventoId: string) {
  soloAdmin(s);
  const evento = await serataEsistente(eventoId);
  const [tutte, credito, byteTotali] = await Promise.all([store.perSerate([eventoId]), store.credito(eventoId), store.byteTotali()]);
  const serata = tutte.filter((f) => f.pronta).sort(perOrdine);
  return { evento, foto: serata.map(vista), credito, byteSerata: serata.reduce((n, f) => n + f.byte, 0), byteTotali };
}

/** Sezione "Foto" della pagina Modifica serata: quante sono, quante in evidenza e nascoste, e le prime miniature. */
export async function riepilogoFoto(s: Sessione, eventoId: string) {
  soloAdmin(s);
  let foto: Foto[];
  try {
    foto = (await store.perSerate([eventoId])).filter((f) => f.pronta).sort(perOrdine);
  } catch (e) {
    // È la pagina Modifica serata: senza foto deve aprirsi lo stesso. L'errore si vede nella pagina Foto.
    fotoNonLette(e);
    return { totale: 0, inEvidenza: 0, nascoste: 0, anteprime: [], nonLette: true };
  }
  const anteprime = foto.filter((f) => f.inEvidenza).concat(foto.filter((f) => !f.inEvidenza)).slice(0, 4);
  return { totale: foto.length, inEvidenza: foto.filter((f) => f.inEvidenza).length, nascoste: foto.filter((f) => f.nascosta).length, anteprime: anteprime.map(vista), nonLette: false };
}

/**
 * Promemoria dell'elenco serate: quali di queste serate non hanno ancora nessuna foto (una sola lettura per tutte).
 * Se le foto non si leggono niente è "senza foto": nessun falso allarme e la pagina si apre lo stesso.
 */
export async function serateSenzaFoto(s: Sessione, eventoIds: string[]) {
  soloAdmin(s);
  if (!eventoIds.length) return { ids: [] as string[], nonLette: false };
  try {
    const con = await store.conFoto(eventoIds);
    return { ids: eventoIds.filter((id) => !con.has(id)), nonLette: false };
  } catch (e) {
    fotoNonLette(e);
    return { ids: [] as string[], nonLette: true };
  }
}

/**
 * Prepara il caricamento di una foto: crea la riga "in caricamento" e dice dove mandare il file grande e la miniatura.
 * Qui (e non quando si apre la pagina) si ripuliscono i caricamenti rimasti a metà da più di un'ora.
 */
export async function preparaFoto(s: Sessione, eventoId: string, adesso = Date.now()) {
  soloAdmin(s);
  await serataEsistente(eventoId);
  const esistenti = await store.perSerate([eventoId]);
  const vecchie = esistenti.filter((f) => abbandonata(f, adesso));
  if (vecchie.length) {
    await deposito.rimuovi(vecchie.flatMap(percorsiDi)).catch(() => undefined);
    await store.elimina(vecchie.map((f) => f.id));
  }
  if (esistenti.length - vecchie.length >= MAX_FOTO_SERATA) throw new Error(`Una serata può avere al massimo ${MAX_FOTO_SERATA} foto`);
  const id = randomUUID();
  // L'ordine vero si assegna alla conferma (in fondo alla serie): qui la foto non si vede ancora.
  await store.inserisci({ id, eventoId, ordine: 0, inEvidenza: false, nascosta: false, larghezza: 0, altezza: 0, byte: 0, pronta: false, creataAt: new Date(adesso).toISOString() });
  try {
    const [grande, mini] = await Promise.all([deposito.destinazione(percorsoGrande(eventoId, id)), deposito.destinazione(percorsoMini(eventoId, id))]);
    return { id, grande, mini };
  } catch (e) {
    await store.elimina([id]);
    throw e;
  }
}

async function rigaDa(id: string): Promise<Foto> {
  const f = await store.perId(id);
  if (!f) throw new Error('Foto non trovata');
  return f;
}

async function scarta(f: Foto) {
  await deposito.rimuovi(percorsiDi(f)).catch(() => undefined);
  await store.elimina([f.id]);
}

/**
 * Il browser ha finito di caricare: si controlla che i due file ci siano e non siano troppo grossi, poi la foto compare in fondo
 * alla serie. Il tetto delle 150 foto si controlla qui, dopo la scrittura: se due conferme arrivano insieme, resta la più
 * vecchia e l'altra viene scartata, sempre la stessa su entrambe le letture.
 */
export async function confermaFoto(s: Sessione, id: string, larghezza: number, altezza: number) {
  soloAdmin(s);
  const f = await rigaDa(id);
  if (f.pronta) return;
  const valida = (n: number) => Number.isInteger(n) && n > 0 && n <= 20000;
  const { grande, mini } = await deposito.pesi(f.eventoId, f.id);
  const errore = !valida(larghezza) || !valida(altezza) ? 'Misure della foto non valide'
    : grande == null || mini == null ? 'La foto non è stata caricata del tutto'
    : grande > MAX_BYTE_FILE || mini > MAX_BYTE_FILE ? 'La foto è troppo pesante'
    : grande === 0 || mini === 0 ? 'La foto è vuota' : null;
  if (errore) { await scarta(f); throw new Error(errore); }
  const pronte = (await store.perSerate([f.eventoId])).filter((x) => x.pronta);
  const ordine = pronte.reduce((n, x) => Math.max(n, x.ordine + 1), 0);
  await store.aggiorna(f.id, { pronta: true, ordine, larghezza, altezza, byte: grande! + mini! });
  const dopo = (await store.perSerate([f.eventoId])).filter((x) => x.pronta).sort(perOrdine);
  if (dopo.findIndex((x) => x.id === f.id) >= MAX_FOTO_SERATA) {
    await scarta(f);
    throw new Error(`Una serata può avere al massimo ${MAX_FOTO_SERATA} foto`);
  }
}

/** Solo per lo sviluppo (senza Supabase): salva su disco il file di una foto in caricamento. */
export async function scriviFotoLocale(s: Sessione, eventoId: string, file: string, contenuto: Buffer) {
  soloAdmin(s);
  if (remoto) throw new Error('Il caricamento locale non è attivo con Supabase');
  const m = /^([0-9a-f-]{36})(-m)?\.jpg$/.exec(file);
  if (!m) throw new Error('Nome del file non valido');
  const f = await rigaDa(m[1]);
  if (f.eventoId !== eventoId || f.pronta) throw new Error('Foto non in caricamento');
  if (contenuto.length > MAX_BYTE_FILE) throw new Error('La foto è troppo pesante');
  await fs.mkdir(path.join(CARTELLA_FOTO, eventoId), { recursive: true });
  await fs.writeFile(path.join(CARTELLA_FOTO, eventoId, file), contenuto);
}

/** Una foto non riuscita: si butta la riga e i file arrivati a metà. */
export async function annullaFoto(s: Sessione, id: string) {
  soloAdmin(s);
  const f = await store.perId(id);
  if (!f || f.pronta) return;
  await scarta(f);
}

export async function impostaFoto(s: Sessione, id: string, cambio: { inEvidenza?: boolean; nascosta?: boolean }) {
  soloAdmin(s);
  const f = await rigaDa(id);
  if (!f.pronta) throw new Error('Foto non pronta');
  const patch: Partial<Foto> = {};
  if (cambio.nascosta !== undefined) { patch.nascosta = cambio.nascosta; if (cambio.nascosta) patch.inEvidenza = false; }
  if (cambio.inEvidenza !== undefined) {
    if (cambio.inEvidenza) {
      if (f.nascosta && patch.nascosta !== false) throw new Error('Una foto nascosta non può essere in evidenza');
      const quante = (await store.perSerate([f.eventoId])).filter((x) => x.pronta && x.inEvidenza && x.id !== f.id).length;
      if (quante >= MAX_IN_EVIDENZA) throw new Error(`Puoi scegliere al massimo ${MAX_IN_EVIDENZA} foto in evidenza: togline una prima`);
    }
    patch.inEvidenza = cambio.inEvidenza;
  }
  await store.aggiorna(id, patch);
}

export async function spostaFotoAdmin(s: Sessione, id: string, verso: 'prima' | 'dopo') {
  soloAdmin(s);
  const f = await rigaDa(id);
  const aggiornamenti = spostaFoto(await store.perSerate([f.eventoId]), id, verso);
  if (aggiornamenti) for (const u of aggiornamenti) await store.aggiorna(u.id, { ordine: u.ordine });
}

export async function eliminaFoto(s: Sessione, id: string) {
  soloAdmin(s);
  const f = await rigaDa(id);
  await deposito.rimuovi(percorsiDi(f));
  await store.elimina([id]);
}

/** Toglie tutte le foto di una serata (file e dati). Va chiamata anche quando una serata viene eliminata. */
export async function eliminaFotoSerata(s: Sessione, eventoId: string) {
  soloAdmin(s);
  const foto = await store.perSerate([eventoId]);
  await deposito.rimuovi(foto.flatMap(percorsiDi));
  await store.elimina(foto.map((f) => f.id));
  await store.impostaCredito(eventoId, '');
  return foto.length;
}

export async function salvaCreditoFoto(s: Sessione, eventoId: string, testo: string) {
  soloAdmin(s);
  await serataEsistente(eventoId);
  await store.impostaCredito(eventoId, creditoPulito(testo));
}

// ── Pubblico ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Qui nessuna sessione: si espone solo ciò che un visitatore può vedere (foto pronte e non nascoste, di serate
// pubblicate e già finite). Le serate le passa chi chiama, che le ha già lette: niente letture in più dell'archivio.

export interface SerataConFoto { evento: Evento; foto: FotoVista[]; evidenza: FotoVista[]; credito: string }

const visibileAlPubblico = (e: Evento) => e.pubblicato && eventoPassato(e);

function raggruppa(eventi: readonly Evento[], tutte: Foto[], crediti: Record<string, string>): SerataConFoto[] {
  const out: SerataConFoto[] = [];
  for (const evento of eventi) {
    const foto = fotoVisibili(tutte.filter((f) => f.eventoId === evento.id));
    if (!foto.length) continue;
    out.push({ evento, foto: foto.map(vista), evidenza: fotoInEvidenza(foto).map(vista), credito: crediti[evento.id] ?? '' });
  }
  return out;
}

/**
 * Le serate (nell'ordine in cui arrivano, di solito dalla più recente) che hanno almeno una foto da mostrare. Si legge a gruppi
 * di serate; con `max` ci si ferma appena ce ne sono abbastanza (la home ne vuole poche).
 */
export async function serateConFoto(eventi: readonly Evento[], { max }: { max?: number } = {}): Promise<SerataConFoto[]> {
  const out: SerataConFoto[] = [];
  const candidate = eventi.filter(visibileAlPubblico);
  try {
    for (const blocco of gruppi(candidate, SERATE_PER_VOLTA)) {
      if (max !== undefined && out.length >= max) break;
      const ids = blocco.map((e) => e.id);
      const [foto, crediti] = await Promise.all([store.perSerate(ids, { soloVisibili: true }), store.crediti(ids)]);
      out.push(...raggruppa(blocco, foto, crediti));
    }
  } catch (e) {
    fotoNonLette(e);
    return [];
  }
  return max === undefined ? out : out.slice(0, max);
}

/** Le foto di una serata sola, se è pubblicata e finita. */
export async function fotoSerataPubblica(evento: Evento): Promise<SerataConFoto | null> {
  if (!visibileAlPubblico(evento)) return null;
  try {
    const [foto, credito] = await Promise.all([store.perSerate([evento.id], { soloVisibili: true }), store.credito(evento.id)]);
    return raggruppa([evento], foto, { [evento.id]: credito })[0] ?? null;
  } catch (e) {
    fotoNonLette(e);
    return null;
  }
}
