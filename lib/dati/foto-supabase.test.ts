// Foto delle serate con Supabase: lo stesso codice di produzione, con un client finto in memoria che si comporta come il vero
// dove conta (al massimo 1000 righe per richiesta senza avvisare, indirizzi firmati, elenco dei file con le misure).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Evento } from './tipi';

const cartella = mkdtempSync(path.join(tmpdir(), 'mm-foto-sb-'));
process.env.MM_CARTELLA_DATI = cartella;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

type Riga = Record<string, unknown>;
const BASE = 'https://finto.supabase.test/storage/v1';

/** Un Supabase finto: tabelle in memoria con filtri, ordine e range, tetto di 1000 righe, e uno Storage con le misure dei file. */
function supabaseFinto() {
  const tabelle: Record<string, Riga[]> = { foto_serate: [], serate_foto_credito: [] };
  const oggetti = new Map<string, number>(); // "bucket/percorso" → byte
  const stato = { senzaRange: 0, firmati: [] as string[], rimossi: [] as string[] };

  type Risposta = { data: unknown; error: { message: string } | null };
  class Q implements PromiseLike<Risposta> {
    private filtri: ((r: Riga) => boolean)[] = [];
    private chiavi: string[] = [];
    private intervallo: [number, number] | null = null;
    private uno = false;
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    private dati: Riga = {};
    private conflitto = '';
    constructor(private tabella: string) {}
    select() { return this; }
    insert(r: Riga) { this.op = 'insert'; this.dati = r; return this; }
    update(r: Riga) { this.op = 'update'; this.dati = r; return this; }
    delete() { this.op = 'delete'; return this; }
    upsert(r: Riga, o: { onConflict: string }) { this.op = 'upsert'; this.dati = r; this.conflitto = o.onConflict; return this; }
    eq(c: string, v: unknown) { this.filtri.push((r) => r[c] === v); return this; }
    in(c: string, v: unknown[]) { this.filtri.push((r) => v.includes(r[c])); return this; }
    order(c: string) { this.chiavi.push(c); return this; }
    range(da: number, a: number) { this.intervallo = [da, a]; return this; }
    maybeSingle() { this.uno = true; return this; }
    then<A, B>(ok?: ((v: Risposta) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(this.esegui()).then(ok, ko);
    }
    private esegui(): Risposta {
      const t = tabelle[this.tabella];
      if (!t) return { data: null, error: { message: `Could not find the table 'public.${this.tabella}' in the schema cache` } }; // come Supabase senza migrazione
      const trovate = t.filter((r) => this.filtri.every((f) => f(r)));
      if (this.op === 'insert') { t.push({ ...this.dati }); return { data: null, error: null }; }
      if (this.op === 'update') { for (const r of trovate) Object.assign(r, this.dati); return { data: null, error: null }; }
      if (this.op === 'delete') { tabelle[this.tabella] = t.filter((r) => !trovate.includes(r)); return { data: null, error: null }; }
      if (this.op === 'upsert') {
        const esiste = t.find((r) => r[this.conflitto] === this.dati[this.conflitto]);
        if (esiste) Object.assign(esiste, this.dati); else t.push({ ...this.dati });
        return { data: null, error: null };
      }
      const ordinate = trovate.slice().sort((a, b) => {
        for (const c of this.chiavi) { const x = a[c] as string | number, y = b[c] as string | number; if (x !== y) return x < y ? -1 : 1; }
        return 0;
      });
      if (this.uno) return { data: ordinate[0] ?? null, error: null };
      if (!this.intervallo && this.tabella === 'foto_serate') stato.senzaRange++; // i crediti sono pochi (una riga per serata): niente paginazione
      const [da, a] = this.intervallo ?? [0, 999];
      return { data: ordinate.slice(da, da + Math.min(a - da + 1, 1000)), error: null }; // come Supabase: mai più di 1000 righe
    }
  }

  const storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: async (p: string) => { stato.firmati.push(p); return { data: { signedUrl: `${BASE}/object/upload/sign/${bucket}/${p}?token=t`, token: 't', path: p }, error: null }; },
      getPublicUrl: (p: string) => ({ data: { publicUrl: `${BASE}/object/public/${bucket}/${p}` } }),
      list: async (cartella: string, o: { search?: string }) => ({
        data: [...oggetti].filter(([k]) => k.startsWith(`${bucket}/${cartella}/`)).map(([k, size]) => ({ name: k.split('/').pop()!, metadata: { size } }))
          .filter((x) => !o.search || x.name.includes(o.search)),
        error: null,
      }),
      remove: async (percorsi: string[]) => { for (const p of percorsi) { oggetti.delete(`foto-serate/${p}`); stato.rimossi.push(p); } return { data: [], error: null }; },
    }),
  };

  return {
    client: { from: (t: string) => new Q(t), storage } as unknown as SupabaseClient,
    tabelle, oggetti, stato,
    /** Come il browser che manda il file all'indirizzo firmato. */
    carica(eventoId: string, id: string, grande = 200_000, mini = 30_000) {
      oggetti.set(`foto-serate/${eventoId}/${id}.jpg`, grande);
      oggetti.set(`foto-serate/${eventoId}/${id}-m.jpg`, mini);
    },
  };
}

type Mod = { archivio: typeof import('./archivio'); foto: typeof import('./foto') };
type S = Parameters<Mod['foto']['preparaFoto']>[0];
let m: Mod;
let admin: S, staff: S, pr: S;
let passata: Evento;

before(async () => {
  m = { archivio: await import('./archivio'), foto: await import('./foto') };
  const d = await m.archivio.leggi();
  const sessione = (email: string) => {
    const utente = d.utenti.find((u) => u.email === email)!;
    return { utente, pr: utente.prId ? d.pr.find((p) => p.id === utente.prId)! : null } as S;
  };
  admin = sessione('admin@maremmamusica.test'); staff = sessione('porta@maremmamusica.test'); pr = sessione('test-pr@maremmamusica.test');
  passata = d.eventi.find((e) => e.slug === 'ricky-le-roy-monteverdi')!;
});
after(() => rmSync(cartella, { recursive: true, force: true }));

const nuovo = () => { const f = supabaseFinto(); m.foto.collegaSupabase(f.client); return f; };
const riga = (eventoId: string, i: number, extra: Riga = {}): Riga => ({
  id: randomUUID(), evento_id: eventoId, ordine: i, in_evidenza: false, nascosta: false, larghezza: 2000, altezza: 1500, byte: 1000, pronta: true,
  creata_at: new Date(Date.UTC(2026, 8, 20, 0, 0, 0, i)).toISOString(), ...extra,
});
const serataFinta = (n: number): Evento => ({ ...passata, id: `serata-finta-${n}`, slug: `finta-${n}`, data: `2026-0${(n % 8) + 1}-10T22:00:00+02:00`, dataFine: null });
async function caricaFoto(f: ReturnType<typeof supabaseFinto>, eventoId: string, adesso = Date.now()) {
  const p = await m.foto.preparaFoto(admin, eventoId, adesso);
  f.carica(eventoId, p.id);
  await m.foto.confermaFoto(admin, p.id, 2000, 1333);
  return p.id;
}

test('Supabase: staff e PR non toccano né i dati né i file', async () => {
  const f = nuovo();
  const id = await caricaFoto(f, passata.id);
  const righe = f.tabelle.foto_serate.length, file = f.oggetti.size;
  for (const s of [staff, pr]) {
    await assert.rejects(m.foto.preparaFoto(s, passata.id), /non_autorizzato/);
    await assert.rejects(m.foto.confermaFoto(s, id, 10, 10), /non_autorizzato/);
    await assert.rejects(m.foto.annullaFoto(s, id), /non_autorizzato/);
    await assert.rejects(m.foto.impostaFoto(s, id, { nascosta: true }), /non_autorizzato/);
    await assert.rejects(m.foto.spostaFotoAdmin(s, id, 'dopo'), /non_autorizzato/);
    await assert.rejects(m.foto.eliminaFoto(s, id), /non_autorizzato/);
    await assert.rejects(m.foto.eliminaFotoSerata(s, passata.id), /non_autorizzato/);
    await assert.rejects(m.foto.salvaCreditoFoto(s, passata.id, 'Io'), /non_autorizzato/);
    await assert.rejects(m.foto.fotoAdmin(s, passata.id), /non_autorizzato/);
    await assert.rejects(m.foto.riepilogoFoto(s, passata.id), /non_autorizzato/);
  }
  assert.equal(f.tabelle.foto_serate.length, righe);
  assert.equal(f.oggetti.size, file);
  assert.equal(f.stato.firmati.length, 2, 'indirizzi firmati solo per l’admin (grande e miniatura)');
});

test('Supabase: indirizzi firmati, conferma con i pesi dei file, foto troppo pesante o incompleta scartata', async () => {
  const f = nuovo();
  const p = await m.foto.preparaFoto(admin, passata.id);
  assert.equal(p.grande.tipo, 'firmato');
  assert.equal(p.grande.url, `${BASE}/object/upload/sign/foto-serate/${passata.id}/${p.id}.jpg?token=t`);
  assert.equal(p.mini.url, `${BASE}/object/upload/sign/foto-serate/${passata.id}/${p.id}-m.jpg?token=t`);
  assert.equal(f.tabelle.foto_serate[0].pronta, false, 'in caricamento: non si vede');
  await assert.rejects(m.foto.confermaFoto(admin, p.id, 2000, 1333), /non è stata caricata/);
  assert.equal(f.tabelle.foto_serate.length, 0, 'riga scartata');

  const grossa = await m.foto.preparaFoto(admin, passata.id);
  f.carica(passata.id, grossa.id, 2_000_000, 30_000);
  await assert.rejects(m.foto.confermaFoto(admin, grossa.id, 2000, 1333), /troppo pesante/);
  assert.equal(f.tabelle.foto_serate.length, 0);
  assert.equal(f.oggetti.size, 0, 'anche i file sono stati tolti da Storage');

  const id = await caricaFoto(f, passata.id);
  const { foto } = await m.foto.fotoAdmin(admin, passata.id);
  assert.deepEqual(foto.map((x) => x.id), [id]);
  assert.equal(foto[0].urlMini, `${BASE}/object/public/foto-serate/${passata.id}/${id}-m.jpg`);
  assert.equal(foto[0].byte, 230_000);
});

test('Supabase: oltre 1000 righe niente sparisce (lettura a pagine, per serata, per id)', async () => {
  const f = nuovo();
  const serate = [passata, ...Array.from({ length: 8 }, (_, i) => serataFinta(i))];
  for (const [n, s] of serate.entries()) for (let i = 0; i < 150; i++) f.tabelle.foto_serate.push(riga(s.id, i, { byte: 1000 + n }));
  assert.equal(f.tabelle.foto_serate.length, 1350);

  const admin1 = await m.foto.fotoAdmin(admin, passata.id);
  assert.equal(admin1.foto.length, 150);
  assert.equal(admin1.byteTotali, 150 * (1000 * 9 + (0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8)), 'lo spazio somma tutte le 1350 righe, non solo le prime 1000');

  const pubbliche = await m.foto.serateConFoto(serate);
  assert.equal(pubbliche.length, 9);
  assert.ok(pubbliche.every((s) => s.foto.length === 150), 'ogni serata ha tutte le sue foto');
  assert.equal((await m.foto.serateConFoto(serate, { max: 4 })).length, 4, 'la home ne vuole solo 4');
  const senza = await m.foto.serateSenzaFoto(admin, [...serate.map((s) => s.id), 'serata-vuota']);
  assert.deepEqual(senza, { ids: ['serata-vuota'], nonLette: false }, 'il promemoria conta anche oltre 1000 righe');

  // Una foto in fondo alla tabella (oltre la millesima) si trova e si cambia per id.
  const ultima = f.tabelle.foto_serate[1349];
  await m.foto.impostaFoto(admin, ultima.id as string, { nascosta: true });
  assert.equal(f.tabelle.foto_serate.find((r) => r.id === ultima.id)!.nascosta, true);
  await m.foto.eliminaFoto(admin, f.tabelle.foto_serate[1300].id as string);
  assert.equal(f.tabelle.foto_serate.length, 1349);
  assert.equal(f.stato.senzaRange, 0, 'nessuna lettura di più righe senza range esplicito');
});

test('Supabase: tetto di 150 foto, anche con due conferme insieme', async () => {
  const f = nuovo();
  for (let i = 0; i < 150; i++) f.tabelle.foto_serate.push(riga(passata.id, i));
  await assert.rejects(m.foto.preparaFoto(admin, passata.id), /al massimo 150/);

  f.tabelle.foto_serate.pop(); // 149: c'è posto per una sola
  const t = Date.now();
  const [a, b] = await Promise.all([m.foto.preparaFoto(admin, passata.id, t), m.foto.preparaFoto(admin, passata.id, t + 5)]);
  f.carica(passata.id, a.id); f.carica(passata.id, b.id);
  const esiti = await Promise.allSettled([m.foto.confermaFoto(admin, a.id, 2000, 1333), m.foto.confermaFoto(admin, b.id, 2000, 1333)]);
  assert.deepEqual(esiti.map((e) => e.status), ['fulfilled', 'rejected'], 'resta la più vecchia, l’altra viene scartata');
  assert.match(String((esiti[1] as PromiseRejectedResult).reason), /al massimo 150/);
  assert.equal(f.tabelle.foto_serate.filter((r) => r.pronta).length, 150);
  assert.equal(f.oggetti.has(`foto-serate/${passata.id}/${b.id}.jpg`), false, 'file della scartata tolti da Storage');
});

test('Supabase: l’ordine si assegna alla conferma e i caricamenti abbandonati si ripuliscono preparando una nuova foto', async () => {
  const f = nuovo();
  const a = await caricaFoto(f, passata.id);
  const b = await caricaFoto(f, passata.id);
  assert.deepEqual((await m.foto.fotoAdmin(admin, passata.id)).foto.map((x) => x.id), [a, b]);

  const lenta = await m.foto.preparaFoto(admin, passata.id, Date.now());
  f.carica(passata.id, lenta.id);
  const tra2ore = Date.now() + 2 * 3_600_000;
  await m.foto.fotoAdmin(admin, passata.id);
  assert.ok(f.tabelle.foto_serate.some((r) => r.id === lenta.id), 'aprire la pagina non cancella niente');
  await m.foto.preparaFoto(admin, passata.id, tra2ore);
  assert.equal(f.tabelle.foto_serate.some((r) => r.id === lenta.id), false, 'preparando una nuova foto sì');
  assert.equal(f.oggetti.has(`foto-serate/${passata.id}/${lenta.id}.jpg`), false);
});

test('Supabase: elimina una foto o le foto di una serata con i file, il credito e solo le visibili al pubblico', async () => {
  const f = nuovo();
  const [a, b, c] = [await caricaFoto(f, passata.id), await caricaFoto(f, passata.id), await caricaFoto(f, passata.id)];
  await m.foto.salvaCreditoFoto(admin, passata.id, ' Mario  Rossi ');
  await m.foto.impostaFoto(admin, b, { nascosta: true });
  const pub = await m.foto.fotoSerataPubblica(passata);
  assert.deepEqual(pub?.foto.map((x) => x.id), [a, c], 'la nascosta non è pubblica');
  assert.equal(pub?.credito, 'Mario Rossi');
  assert.equal((await m.foto.serateConFoto([passata]))[0].credito, 'Mario Rossi');
  assert.equal(await m.foto.fotoSerataPubblica({ ...passata, pubblicato: false }), null);

  await m.foto.eliminaFoto(admin, a);
  assert.equal(f.oggetti.has(`foto-serate/${passata.id}/${a}.jpg`) || f.oggetti.has(`foto-serate/${passata.id}/${a}-m.jpg`), false);
  assert.equal(await m.foto.eliminaFotoSerata(admin, passata.id), 2);
  assert.equal(f.oggetti.size, 0, 'nessun file resta in Storage');
  assert.equal(f.tabelle.foto_serate.length, 0);
  assert.equal(f.tabelle.serate_foto_credito.length, 0, 'anche il credito');
  assert.equal(await m.foto.fotoSerataPubblica(passata), null);
});

test('Supabase: senza le tabelle delle foto le pagine pubbliche e la pagina Modifica si aprono lo stesso, la pagina Foto mostra l’errore', async (t) => {
  const f = nuovo();
  delete (f.tabelle as Partial<typeof f.tabelle>).foto_serate;
  delete (f.tabelle as Partial<typeof f.tabelle>).serate_foto_credito;
  const log = t.mock.method(console, 'error', () => {});
  assert.deepEqual(await m.foto.serateConFoto([passata]), [], 'home e galleria: nessuna foto, nessun errore');
  assert.deepEqual(await m.foto.serateConFoto([passata], { max: 4 }), []);
  assert.equal(await m.foto.fotoSerataPubblica(passata), null, 'scheda serata: nessuna foto, nessun errore');
  assert.deepEqual(await m.foto.riepilogoFoto(admin, passata.id), { totale: 0, inEvidenza: 0, nascoste: 0, anteprime: [], nonLette: true }, 'la pagina Modifica si apre lo stesso');
  assert.deepEqual(await m.foto.serateSenzaFoto(admin, [passata.id]), { ids: [], nonLette: true }, 'elenco serate: nessun falso allarme "senza foto"');
  assert.equal(log.mock.callCount(), 5, 'l’errore resta nei log');
  await assert.rejects(m.foto.fotoAdmin(admin, passata.id), /Foto: lettura non riuscito/);
});
