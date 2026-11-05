// L'azione admin che copia `MM_SEGRETO` nel segreto del database (lib/dati/allinea-segreto.ts, app/api/admin/allinea-segreto/route.ts).
// Si prova: il confronto da solo (variabile assente, già uguale, diverso, errori), la scrittura sulle tabelle (PGlite) e sulla riga unica
// (con la riprova), la rotta (401, 403, risposta con sole tre voci) e, ovunque, che il valore non esca mai: né nelle risposte né nei log.
// `next/headers` è sostituito da un cookie finto, come in accesso-tabelle.test.ts.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Module from 'node:module';

import { fissaOrologio } from './orologio-test';

fissaOrologio();
const cartella = mkdtempSync(path.join(tmpdir(), 'mm-allinea-'));
process.env.MM_CARTELLA_DATI = cartella;
delete process.env.MM_SEGRETO;

let cookieDiSessione: string | null = null;
const finti: Record<string, unknown> = {
  'next/headers': {
    cookies: async () => ({ get: (nome: string) => (nome === 'mm_sessione' && cookieDiSessione ? { name: nome, value: cookieDiSessione } : undefined) }),
    headers: async () => new Headers(),
  },
  'next/navigation': { redirect: (url: string) => { throw new Error(`redirect:${url}`); } },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const caricaOriginale = M._load;
M._load = function (richiesta: string, ...resto: unknown[]) {
  return richiesta in finti ? finti[richiesta] : caricaOriginale.call(this, richiesta, ...resto);
};

type Mod = {
  archivio: typeof import('./archivio');
  allinea: typeof import('./allinea-segreto');
  rotta: typeof import('../../app/api/admin/allinea-segreto/route');
  prove: typeof import('./prova-db');
  store: typeof import('./prova-store');
  vendite: typeof import('./prova-vendite');
  verifica: typeof import('./verifica-archivio');
  remoto: typeof import('./archivio-remoto');
  prova: typeof import('./prova-archivio');
};
let m: Mod;
before(async () => {
  m = {
    archivio: await import('./archivio'), allinea: await import('./allinea-segreto'), rotta: await import('../../app/api/admin/allinea-segreto/route'),
    prove: await import('./prova-db'), store: await import('./prova-store'), vendite: await import('./prova-vendite'), verifica: await import('./verifica-archivio'),
    remoto: await import('./archivio-remoto'), prova: await import('./prova-archivio'),
  };
});
afterEach(() => { delete process.env.MM_SEGRETO; cookieDiSessione = null; });
after(() => { M._load = caricaOriginale; m.archivio.usaTabelleDiProva(null); rmSync(cartella, { recursive: true, force: true }); });

const NUOVO = 'chiave-nuova-di-vercel-che-non-deve-mai-comparire';
const VECCHIO = 'chiave-vecchia-del-database-che-non-deve-mai-comparire';

/** Un database in memoria al posto del vero; `errori` fa fallire una delle due operazioni. */
function dbFinto(iniziale: string | null, errori: { scrivi?: Error; leggiDopo?: string } = {}) {
  let valore = iniziale;
  let scritture = 0;
  const db = {
    async leggi() { return valore; },
    async scrivi(nuovo: string) {
      scritture++;
      if (errori.scrivi) throw errori.scrivi;
      valore = errori.leggiDopo ?? nuovo;
    },
  };
  return { db, scritture: () => scritture, valore: () => valore };
}

/** Raccoglie tutto quello che il codice scrive nei log mentre gira `f`. */
async function conLog<T>(f: () => Promise<T>): Promise<{ v: T; log: string }> {
  const righe: string[] = [];
  const originali = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const k of Object.keys(originali) as (keyof typeof originali)[]) console[k] = (...a: unknown[]) => { righe.push(a.map(String).join(' ')); };
  try { return { v: await f(), log: righe.join('\n') }; } finally { Object.assign(console, originali); }
}

const firma = (uid: string) => {
  const scade = (Date.now() + 86_400_000).toString(36);
  const valore = `${uid}.${scade}`;
  return m.archivio.segreto().then((s) => `${valore}.${createHmac('sha256', s).update(`sessione|${valore}`).digest('base64url')}`);
};
async function accedi(email: string) {
  const u = (await m.archivio.leggi()).utenti.find((x) => x.email === email)!;
  cookieDiSessione = await firma(u.id);
}
const chiama = async () => { const r = await m.rotta.POST(); return { stato: r.status, testo: await r.text() }; };

// ---------------------------------------------------------------- il confronto

test('senza MM_SEGRETO non fa niente e lo dice; già uguale non scrive', async () => {
  const a = dbFinto(VECCHIO);
  assert.deepEqual(await m.allinea.allineaSegretoCon(undefined, a.db), { ok: true, allineato: false, motivo: 'Su Vercel la chiave segreta (MM_SEGRETO) non c’è: non ho cambiato niente.' });
  assert.deepEqual((await m.allinea.allineaSegretoCon('', a.db)).allineato, false, 'variabile vuota = come se non ci fosse');
  assert.equal(a.scritture(), 0);

  const b = dbFinto(NUOVO);
  const esito = await m.allinea.allineaSegretoCon(NUOVO, b.db);
  assert.deepEqual([esito.ok, esito.allineato, /già tutto a posto/.test(esito.motivo)], [true, true, true]);
  assert.equal(b.scritture(), 0, 'uguale: nessuna scrittura');
});

test('diverso: aggiorna solo il segreto e risponde con ok, allineato e motivo, senza il valore', async () => {
  const a = dbFinto(VECCHIO);
  const esito = await m.allinea.allineaSegretoCon(NUOVO, a.db);
  assert.deepEqual(Object.keys(esito).sort(), ['allineato', 'motivo', 'ok']);
  assert.deepEqual([esito.ok, esito.allineato], [true, true]);
  assert.ok(a.valore() === NUOVO && a.scritture() === 1);
  const testo = JSON.stringify(esito);
  assert.ok(!testo.includes(NUOVO) && !testo.includes(VECCHIO) && !testo.includes('non-deve-mai'));
  // Rilanciata: ora è uguale.
  assert.equal((await m.allinea.allineaSegretoCon(NUOVO, a.db)).motivo.includes('già tutto a posto'), true);
  assert.equal(a.scritture(), 1);
});

test('se la scrittura fallisce o la rilettura non combacia: ok falso, nessun pezzo del valore nel messaggio e nei log', async () => {
  const rotto = dbFinto(VECCHIO, { scrivi: new Error(`errore del database con ${NUOVO} e ${VECCHIO} dentro`) });
  const r1 = await conLog(() => m.allinea.allineaSegretoCon(NUOVO, rotto.db));
  assert.deepEqual([r1.v.ok, r1.v.allineato], [false, false]);
  const strano = dbFinto(VECCHIO, { leggiDopo: VECCHIO });
  const r2 = await conLog(() => m.allinea.allineaSegretoCon(NUOVO, strano.db));
  assert.deepEqual([r2.v.ok, r2.v.allineato], [false, false]);
  for (const t of [JSON.stringify(r1.v), r1.log, JSON.stringify(r2.v), r2.log]) assert.ok(!t.includes('non-deve-mai') && !t.includes('chiave-'));
  assert.ok(rotto.valore() === VECCHIO, 'non è cambiato niente');
});

test('solo admin: la funzione rifiuta chi non lo è', async () => {
  const d = await m.archivio.leggi();
  const staff = d.utenti.find((u) => u.ruolo === 'staff')!;
  await assert.rejects(m.allinea.allineaSegreto({ utente: staff, pr: null }), /non_autorizzato/);
});

// ---------------------------------------------------------------- la rotta (archivio su file, cioè la riga unica in locale)

test('rotta: senza accesso 401, staff e PR 403; l\'admin ottiene solo ok, allineato e motivo', async () => {
  assert.equal((await chiama()).stato, 401);
  for (const email of ['porta@maremmamusica.test', 'test-pr@maremmamusica.test']) {
    await accedi(email);
    const r = await chiama();
    assert.equal(r.stato, 403, email);
    assert.deepEqual(Object.keys(JSON.parse(r.testo)), ['errore']);
  }
  // Un cookie manomesso non vale.
  cookieDiSessione = 'x.y.z';
  assert.equal((await chiama()).stato, 401);
});

test('rotta: senza variabile non cambia niente; con la variabile il segreto salvato diventa uguale, e il sito continua a usare lo stesso', async () => {
  await accedi('admin@maremmamusica.test');
  const salvatoPrima = await m.archivio.segretoSalvato();
  assert.ok(salvatoPrima && salvatoPrima !== NUOVO);

  const senza = await chiama();
  assert.equal(senza.stato, 200);
  assert.deepEqual(JSON.parse(senza.testo), { ok: true, allineato: false, motivo: 'Su Vercel la chiave segreta (MM_SEGRETO) non c’è: non ho cambiato niente.' });
  assert.ok((await m.archivio.segretoSalvato()) === salvatoPrima);

  process.env.MM_SEGRETO = NUOVO;
  await accedi('admin@maremmamusica.test'); // il cookie si firma con la variabile, che ora vince
  const { v: fatto, log } = await conLog(chiama);
  assert.equal(fatto.stato, 200);
  const corpo = JSON.parse(fatto.testo);
  assert.deepEqual(Object.keys(corpo).sort(), ['allineato', 'motivo', 'ok']);
  assert.deepEqual([corpo.ok, corpo.allineato], [true, true]);
  assert.ok(!fatto.testo.includes(NUOVO) && !fatto.testo.includes(salvatoPrima!) && !log.includes(NUOVO) && !log.includes(salvatoPrima!));
  assert.ok((await m.archivio.segretoSalvato()) === NUOVO);

  // Stato dell'archivio: è cambiato solo il segreto.
  const dopo = await m.archivio.leggi();
  assert.equal(dopo.eventi.length > 0 && dopo.utenti.length > 0, true);

  // Era già tutto a posto: lo dice e non riscrive.
  const ancora = JSON.parse((await chiama()).testo);
  assert.deepEqual([ancora.ok, ancora.allineato, /già tutto a posto/.test(ancora.motivo)], [true, true, true]);

  // Se la variabile sparisse, il sito userebbe il segreto del database, che adesso è lo stesso: QR e accessi restano validi.
  delete process.env.MM_SEGRETO;
  assert.ok((await m.archivio.segreto()) === NUOVO);
});

// ---------------------------------------------------------------- la riga unica, con la riprova

test('riga unica remota: se qualcun altro scrive nello stesso istante riprova e scrive il segreto senza toccare il resto', async () => {
  const d = m.prova.archivioRicco();
  let riga: { versione: number; dati: typeof d } | null = { versione: 7, dati: structuredClone(d) };
  let scritture = 0;
  const store = {
    async leggi() { return riga ? { versione: riga.versione, dati: structuredClone(riga.dati) } : null; },
    async crea() { /* non serve */ },
    async scrivi(v: number, dati: typeof d) {
      scritture++;
      if (scritture <= 2) { riga = { versione: riga!.versione + 1, dati: riga!.dati }; return false; } // un altro ha scritto per primo
      if (!riga || riga.versione !== v) return false;
      riga = { versione: v + 1, dati: structuredClone(dati) };
      return true;
    },
  };
  const remoto = m.remoto.archivioRemoto(store, () => d, m.archivio.normalizza);
  const esito = await m.allinea.allineaSegretoCon(NUOVO, {
    leggi: async () => (await remoto.leggi()).segreto,
    scrivi: async (nuovo) => { await remoto.modifica((x) => { x.segreto = nuovo; }); },
  });
  assert.deepEqual([esito.ok, esito.allineato], [true, true]);
  assert.equal(scritture, 3, 'due scontri e poi la scrittura');
  assert.ok(riga!.dati.segreto === NUOVO);
  const atteso = structuredClone(d); atteso.segreto = NUOVO;
  assert.deepEqual(m.archivio.normalizza(riga!.dati), m.archivio.normalizza(atteso), 'tutto il resto è come prima');
});

// ---------------------------------------------------------------- le tabelle (PGlite)

test('tabelle: aggiorna solo impostazioni.segreto; verifica-archivio e verifica_importo() non vanno in errore, dicono solo "segreto" diverso', async () => {
  const d = m.prova.archivioRicco();
  const db = await m.prove.creaDb();
  try {
    await m.prove.scriviRiga(db, d, 41);
    await m.vendite.importa(db);
    m.archivio.usaTabelleDiProva({ store: m.store.storeDaDb(db), rpc: m.store.rpcDaDb(db) });
    assert.equal(m.archivio.modalitaCorrente(), 'tabelle');
    const prima = await db.query<{ valore: string }>("select valore from public.impostazioni where chiave <> 'segreto' order by chiave");
    const contiPrima = (await db.query('select (select count(*) from public.iscrizioni) i, (select count(*) from public.eventi) e')).rows[0];

    process.env.MM_SEGRETO = NUOVO;
    await accedi('admin@maremmamusica.test');
    const { v: fatto, log } = await conLog(chiama);
    assert.equal(fatto.stato, 200);
    assert.deepEqual([JSON.parse(fatto.testo).ok, JSON.parse(fatto.testo).allineato], [true, true]);
    for (const t of [fatto.testo, log]) assert.ok(!t.includes(NUOVO) && !t.includes(m.prova.SEGRETO_DI_PROVA));

    const nelDb = (await db.query<{ valore: string }>("select valore from public.impostazioni where chiave = 'segreto'")).rows[0].valore;
    assert.ok(nelDb === NUOVO);
    assert.deepEqual((await db.query<{ valore: string }>("select valore from public.impostazioni where chiave <> 'segreto' order by chiave")).rows, prima.rows, 'le altre impostazioni non si toccano');
    assert.deepEqual((await db.query('select (select count(*) from public.iscrizioni) i, (select count(*) from public.eventi) e')).rows[0], contiPrima);

    // La verifica non va in errore: dice solo che il segreto è diverso da quello della riga vecchia (atteso, la riga è ferma).
    const verifica = await m.verifica.verificaCon(
      { async leggi() { return { versione: 41, dati: structuredClone(d) }; }, async crea() {}, async scrivi() { return false; } },
      m.store.storeDaDb(db), m.archivio.normalizza);
    assert.equal(verifica.ok, false);
    assert.deepEqual(verifica.differenze, ['segreto']);
    const sql = verifica.sql as { ok: boolean; segreto_ok: boolean; differenze: string[] };
    assert.deepEqual([sql.ok, sql.segreto_ok, sql.differenze], [false, false, ['segreto: impronta diversa']]);
    const testoVerifica = JSON.stringify(verifica);
    assert.ok(!testoVerifica.includes(NUOVO) && !testoVerifica.includes(m.prova.SEGRETO_DI_PROVA), 'la verifica non mostra mai il valore');

    // Rilanciata: già uguale, nessuna riga cambia.
    const ancora = JSON.parse((await chiama()).testo);
    assert.ok(/già tutto a posto/.test(ancora.motivo));
    assert.ok((await m.archivio.segretoSalvato()) === NUOVO);
  } finally {
    m.archivio.usaTabelleDiProva(null);
    await db.close();
  }
});

test('tabelle senza la riga del segreto: si ferma con un messaggio generico, senza scrivere altrove', async () => {
  const db = await m.prove.creaDb();
  try {
    m.archivio.usaTabelleDiProva({ store: m.store.storeDaDb(db), rpc: m.store.rpcDaDb(db) });
    process.env.MM_SEGRETO = NUOVO;
    const esito = await m.allinea.allineaSegretoCon(NUOVO, { leggi: m.archivio.segretoSalvato, scrivi: m.archivio.scriviSegretoSalvato });
    assert.deepEqual([esito.ok, esito.allineato], [false, false]);
    assert.ok(!JSON.stringify(esito).includes(NUOVO));
    assert.equal((await db.query("select 1 from public.impostazioni where chiave = 'segreto'")).rows.length, 0);
  } finally {
    m.archivio.usaTabelleDiProva(null);
    await db.close();
  }
});
