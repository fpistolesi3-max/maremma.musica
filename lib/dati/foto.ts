import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CARTELLA_MEDIA, leggi } from './archivio';
import { soloAdmin } from './admin';
import type { Evento } from './tipi';
import type { Sessione } from '../sessione';
import { eventoPassato } from '../regole';
import {
  creditoPulito, fotoInEvidenza, fotoVisibili, MAX_BYTE_FILE, MAX_FOTO_SERATA, MAX_IN_EVIDENZA, percorsoGrande, percorsoMini,
  SCADENZA_CARICAMENTO_MS, spostaFoto, type Foto, type FotoVista,
} from '../foto';

// Foto delle serate. I dati NON stanno nella riga `archivio_mvp` (che si riscrive per intero a ogni vendita): hanno una
// tabella a parte, `foto_serate`, e un bucket Storage pubblico, `foto-serate`. In sviluppo, senza Supabase, stanno su
// disco (.data/foto.json e .data/media/foto/…), come le locandine. Chi non è admin non può caricare, cambiare o eliminare.

const URL_SB = process.env.SUPABASE_URL;
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'foto-serate';

// ── Dove stanno i dati ─────────────────────────────────────────────────────────────────────────────────────────────

interface Dati { foto: Foto[]; crediti: Record<string, string> }

interface StoreFoto {
  /** Tutte le foto, anche quelle in caricamento; di una serata sola se `eventoId` c'è. */
  elenco(eventoId?: string): Promise<Foto[]>;
  inserisci(f: Foto): Promise<void>;
  aggiorna(id: string, patch: Partial<Omit<Foto, 'id' | 'eventoId'>>): Promise<void>;
  elimina(ids: string[]): Promise<void>;
  credito(eventoId: string): Promise<string>;
  crediti(): Promise<Record<string, string>>;
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

const CARTELLA_FOTO = path.join(CARTELLA_MEDIA, 'foto');
const FILE_DATI = path.join(path.dirname(CARTELLA_MEDIA), 'foto.json');

function storeLocale(): StoreFoto {
  let coda: Promise<unknown> = Promise.resolve();
  const carica = async (): Promise<Dati> => {
    try { return JSON.parse(await fs.readFile(FILE_DATI, 'utf8')) as Dati; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return { foto: [], crediti: {} };
    }
  };
  const modifica = <T>(fn: (d: Dati) => T): Promise<T> => {
    const lavoro = coda.then(async () => {
      const d = await carica();
      const r = fn(d);
      await fs.mkdir(path.dirname(FILE_DATI), { recursive: true });
      const tmp = `${FILE_DATI}.${randomBytes(6).toString('hex')}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(d, null, 1));
      await fs.rename(tmp, FILE_DATI);
      return r;
    });
    coda = lavoro.catch(() => undefined);
    return lavoro;
  };
  const leggiDati = async () => { await coda; return carica(); };
  return {
    async elenco(eventoId) { const d = await leggiDati(); return eventoId ? d.foto.filter((f) => f.eventoId === eventoId) : d.foto; },
    inserisci: (f) => modifica((d) => { d.foto.push(f); }),
    aggiorna: (id, patch) => modifica((d) => { const f = d.foto.find((x) => x.id === id); if (f) Object.assign(f, patch); }),
    elimina: (ids) => modifica((d) => { d.foto = d.foto.filter((f) => !ids.includes(f.id)); }),
    async credito(eventoId) { return (await leggiDati()).crediti[eventoId] ?? ''; },
    async crediti() { return (await leggiDati()).crediti; },
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

function clienteSupabase(url: string, chiave: string) {
  return createClient(url, chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next non deve mai tenere in cache queste risposte.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

function storeSupabase(url: string, chiave: string): StoreFoto {
  const sb = clienteSupabase(url, chiave);
  const errore = (cosa: string, e: { message: string } | null) => { if (e) throw new Error(`Foto: ${cosa} non riuscito (${e.message})`); };
  return {
    async elenco(eventoId) {
      const q = sb.from('foto_serate').select('*').order('ordine').order('creata_at');
      const { data, error } = await (eventoId ? q.eq('evento_id', eventoId) : q);
      errore('lettura', error);
      return (data as RigaFoto[]).map(daRiga);
    },
    async inserisci(f) { errore('salvataggio', (await sb.from('foto_serate').insert(inRiga(f))).error); },
    async aggiorna(id, patch) { errore('salvataggio', (await sb.from('foto_serate').update(inRiga(patch)).eq('id', id)).error); },
    async elimina(ids) { if (ids.length) errore('eliminazione', (await sb.from('foto_serate').delete().in('id', ids)).error); },
    async credito(eventoId) {
      const { data, error } = await sb.from('serate_foto_credito').select('credito').eq('evento_id', eventoId).maybeSingle();
      errore('lettura', error);
      return (data?.credito as string | undefined) ?? '';
    },
    async crediti() {
      const { data, error } = await sb.from('serate_foto_credito').select('evento_id,credito');
      errore('lettura', error);
      return Object.fromEntries((data ?? []).map((r) => [r.evento_id as string, r.credito as string]));
    },
    async impostaCredito(eventoId, testo) {
      if (!testo) { errore('salvataggio', (await sb.from('serate_foto_credito').delete().eq('evento_id', eventoId)).error); return; }
      errore('salvataggio', (await sb.from('serate_foto_credito').upsert({ evento_id: eventoId, credito: testo }, { onConflict: 'evento_id' })).error);
    },
  };
}

function depositoSupabase(url: string, chiave: string): Deposito {
  const sb = clienteSupabase(url, chiave);
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
      if (!percorsi.length) return;
      const { error } = await b.remove(percorsi);
      if (error) throw new Error(`Eliminazione file non riuscita (${error.message})`);
    },
  };
}

const remoto = Boolean(URL_SB && CHIAVE);
const store: StoreFoto = remoto ? storeSupabase(URL_SB!, CHIAVE!) : storeLocale();
const deposito: Deposito = remoto ? depositoSupabase(URL_SB!, CHIAVE!) : depositoLocale();

const vista = (f: Foto): FotoVista => ({ ...f, urlGrande: deposito.urlPubblico(percorsoGrande(f.eventoId, f.id)), urlMini: deposito.urlPubblico(percorsoMini(f.eventoId, f.id)) });
const percorsiDi = (f: Pick<Foto, 'eventoId' | 'id'>) => [percorsoGrande(f.eventoId, f.id), percorsoMini(f.eventoId, f.id)];

// ── Admin ──────────────────────────────────────────────────────────────────────────────────────────────────────────

async function serataEsistente(eventoId: string): Promise<Evento> {
  const e = (await leggi()).eventi.find((x) => x.id === eventoId);
  if (!e) throw new Error('Serata non trovata');
  return e;
}

const abbandonata = (f: Foto, adesso: number) => !f.pronta && adesso - new Date(f.creataAt).getTime() > SCADENZA_CARICAMENTO_MS;

/** Toglie i caricamenti rimasti a metà (pagina chiusa, rete caduta): righe e file. */
async function ripulisciAbbandonate(foto: Foto[], adesso: number): Promise<Foto[]> {
  const vecchie = foto.filter((f) => abbandonata(f, adesso));
  if (!vecchie.length) return foto;
  await deposito.rimuovi(vecchie.flatMap(percorsiDi)).catch(() => undefined);
  await store.elimina(vecchie.map((f) => f.id));
  return foto.filter((f) => !vecchie.includes(f));
}

/** La pagina Foto dell'admin: tutte le foto della serata (anche nascoste), il credito e lo spazio occupato. */
export async function fotoAdmin(s: Sessione, eventoId: string, adesso = Date.now()) {
  soloAdmin(s);
  const evento = await serataEsistente(eventoId);
  const tutte = await ripulisciAbbandonate(await store.elenco(), adesso);
  const serata = tutte.filter((f) => f.eventoId === eventoId && f.pronta).sort((a, b) => a.ordine - b.ordine || a.creataAt.localeCompare(b.creataAt));
  return {
    evento,
    foto: serata.map(vista),
    credito: await store.credito(eventoId),
    byteSerata: serata.reduce((n, f) => n + f.byte, 0),
    byteTotali: tutte.filter((f) => f.pronta).reduce((n, f) => n + f.byte, 0),
  };
}

/** Riquadro "Foto" della scheda serata: quante sono, quante in evidenza e le prime miniature. */
export async function riepilogoFoto(s: Sessione, eventoId: string) {
  soloAdmin(s);
  const foto = (await store.elenco(eventoId)).filter((f) => f.pronta).sort((a, b) => a.ordine - b.ordine);
  return { totale: foto.length, nascoste: foto.filter((f) => f.nascosta).length, anteprime: foto.filter((f) => f.inEvidenza).slice(0, MAX_IN_EVIDENZA).concat(foto.filter((f) => !f.inEvidenza)).slice(0, 4).map(vista) };
}

/** Prepara il caricamento di una foto: crea la riga "in caricamento" e dice dove mandare il file grande e la miniatura. */
export async function preparaFoto(s: Sessione, eventoId: string, adesso = Date.now()) {
  soloAdmin(s);
  await serataEsistente(eventoId);
  const esistenti = (await ripulisciAbbandonate(await store.elenco(eventoId), adesso));
  if (esistenti.length >= MAX_FOTO_SERATA) throw new Error(`Una serata può avere al massimo ${MAX_FOTO_SERATA} foto`);
  const id = randomUUID();
  const ordine = esistenti.reduce((n, f) => Math.max(n, f.ordine + 1), 0);
  await store.inserisci({ id, eventoId, ordine, inEvidenza: false, nascosta: false, larghezza: 0, altezza: 0, byte: 0, pronta: false, creataAt: new Date(adesso).toISOString() });
  const [grande, mini] = await Promise.all([deposito.destinazione(percorsoGrande(eventoId, id)), deposito.destinazione(percorsoMini(eventoId, id))]);
  return { id, grande, mini };
}

async function rigaDa(id: string): Promise<Foto> {
  const f = (await store.elenco()).find((x) => x.id === id);
  if (!f) throw new Error('Foto non trovata');
  return f;
}

/** Il browser ha finito di caricare: si controlla che i due file ci siano e non siano troppo grossi, poi la foto compare. */
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
  if (errore) {
    await deposito.rimuovi(percorsiDi(f)).catch(() => undefined);
    await store.elimina([f.id]);
    throw new Error(errore);
  }
  await store.aggiorna(f.id, { pronta: true, larghezza, altezza, byte: grande! + mini! });
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
  const f = (await store.elenco()).find((x) => x.id === id);
  if (!f || f.pronta) return;
  await deposito.rimuovi(percorsiDi(f)).catch(() => undefined);
  await store.elimina([f.id]);
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
      const quante = (await store.elenco(f.eventoId)).filter((x) => x.pronta && x.inEvidenza && x.id !== f.id).length;
      if (quante >= MAX_IN_EVIDENZA) throw new Error(`Puoi scegliere al massimo ${MAX_IN_EVIDENZA} foto in evidenza: togline una prima`);
    }
    patch.inEvidenza = cambio.inEvidenza;
  }
  await store.aggiorna(id, patch);
}

export async function spostaFotoAdmin(s: Sessione, id: string, verso: 'prima' | 'dopo') {
  soloAdmin(s);
  const f = await rigaDa(id);
  const aggiornamenti = spostaFoto(await store.elenco(f.eventoId), id, verso);
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
  const foto = await store.elenco(eventoId);
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
// pubblicate e già finite).

export interface SerataConFoto { evento: Evento; foto: FotoVista[]; evidenza: FotoVista[]; credito: string }

function raggruppa(eventi: Evento[], tutte: Foto[], crediti: Record<string, string>): SerataConFoto[] {
  const out: SerataConFoto[] = [];
  for (const evento of eventi) {
    const foto = fotoVisibili(tutte.filter((f) => f.eventoId === evento.id));
    if (!foto.length) continue;
    out.push({ evento, foto: foto.map(vista), evidenza: fotoInEvidenza(foto).map(vista), credito: crediti[evento.id] ?? '' });
  }
  return out;
}

/** Le serate passate (dalla più recente) che hanno almeno una foto da mostrare. */
export async function serateConFoto(): Promise<SerataConFoto[]> {
  const d = await leggi();
  const passate = d.eventi.filter((e) => e.pubblicato && eventoPassato(e)).sort((a, b) => b.data.localeCompare(a.data));
  if (!passate.length) return [];
  return raggruppa(passate, await store.elenco(), await store.crediti());
}

/** Le foto di una serata sola, se è pubblicata e finita. */
export async function fotoSerataPubblica(eventoId: string): Promise<SerataConFoto | null> {
  const d = await leggi();
  const e = d.eventi.find((x) => x.id === eventoId && x.pubblicato && eventoPassato(x));
  if (!e) return null;
  return raggruppa([e], await store.elenco(eventoId), { [e.id]: await store.credito(e.id) })[0] ?? null;
}
