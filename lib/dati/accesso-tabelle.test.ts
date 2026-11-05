// Il percorso dell'accesso nell'app (lib/sessione.ts: inviaAccesso, entraConToken, entraConCodice, apriSessione, sessioneCorrente) fatto girare due
// volte sulla STESSA storia: con la riga unica (come oggi) e sulle tabelle (PGlite, MM_ARCHIVIO=tabelle). `next/headers` è sostituito da un cookie finto
// che ricorda cosa il codice scrive: così si controlla anche il cookie (valore firmato, httpOnly, sameSite, durata) e non solo le funzioni SQL.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Module from 'node:module';

import { fissaOrologio } from './orologio-test';

fissaOrologio();
const cartella = mkdtempSync(path.join(tmpdir(), 'mm-accesso-'));
process.env.MM_CARTELLA_DATI = cartella;

// ---- next/headers e next/navigation finti
const cookieScritti = new Map<string, { valore: string; opzioni: Record<string, unknown> }>();
const finti: Record<string, unknown> = {
  'next/headers': {
    cookies: async () => ({
      get: (nome: string) => (cookieScritti.has(nome) ? { name: nome, value: cookieScritti.get(nome)!.valore } : undefined),
      set: (nome: string, valore: string, opzioni: Record<string, unknown>) => { cookieScritti.set(nome, { valore, opzioni }); },
      delete: (nome: string) => { cookieScritti.delete(nome); },
    }),
    headers: async () => new Headers({ 'x-forwarded-proto': 'https' }),
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
  sessione: typeof import('../sessione');
  prove: typeof import('./prova-db');
  store: typeof import('./prova-store');
};
let m: Mod;
before(async () => {
  m = { archivio: await import('./archivio'), sessione: await import('../sessione'), prove: await import('./prova-db'), store: await import('./prova-store') };
});
after(() => { M._load = caricaOriginale; m.archivio.usaTabelleDiProva(null); rmSync(cartella, { recursive: true, force: true }); });

const prova = async <T>(f: () => Promise<T>): Promise<{ v: T } | { errore: string }> => {
  try { return { v: await f() }; } catch (e) { return { errore: (e as Error).message }; }
};

async function storia(): Promise<Record<string, unknown>> {
  const { archivio, sessione: s } = m;
  const out: Record<string, unknown> = {};
  cookieScritti.clear();
  const email = 'admin@maremmamusica.test';
  const parti = (link: unknown) => { const u = new URL(link as string); return { token: u.searchParams.get('t')!, dopo: u.searchParams.get('dopo') }; };
  const valore = <T>(r: { v: T } | { errore: string }) => ('v' in r ? r.v : undefined);
  // L'orologio del test è fermo: fra un invio e l'altro passa un secondo, così "l'ultima email" è chiara anche per le tabelle (ordinate per ora).
  const codiceUltimaEmail = async () => /letter-spacing:\.2em;margin:0 0 24px;">(\d{6})</.exec((await archivio.leggi()).posta[0].html)![1];
  const invia = async (mail: string, dopo: string | null) => { mock.timers.tick(1000); return s.inviaAccesso(mail, 'https://sito.test', dopo); };
  const entraCodice = (mail: string, codice: string) => prova(async () => (await s.entraConCodice(mail, codice))?.utente.email ?? null);

  out.sconosciuto = await prova(() => invia('nessuno@esempio.it', null));
  out.emailDopoSconosciuto = (await archivio.leggi()).posta.length;

  // ---- link magico: vale una volta sola, e un secondo invio toglie il primo
  const l1 = await prova(() => invia(` ${email.toUpperCase()} `, '/admin/pr'));
  const a1 = parti(valore(l1));
  out.dopo = a1.dopo;
  const l2 = await prova(() => invia(email, null));
  const a2 = parti(valore(l2));
  out.vecchioLinkDopoUnNuovoInvio = await prova(() => s.entraConToken(a1.token));
  const entra = await prova(() => s.entraConToken(a2.token));
  out.entra = 'v' in entra ? { email: entra.v?.utente.email, ruolo: entra.v?.utente.ruolo } : entra;
  out.cookie = [...cookieScritti].map(([nome, c]) => ({ nome, parti: c.valore.split('.').length, opzioni: c.opzioni }));
  out.linkRiusato = await prova(() => s.entraConToken(a2.token));
  out.linkInventato = await prova(() => s.entraConToken('inventato'));
  out.sessioneDalCookie = await prova(async () => (await s.sessioneCorrente())?.utente.email);
  // cookie manomesso: non vale
  const c = cookieScritti.get('mm_sessione')!;
  cookieScritti.set('mm_sessione', { ...c, valore: c.valore.replace(/.$/, (x) => (x === 'A' ? 'B' : 'A')) });
  out.cookieManomesso = await prova(async () => (await s.sessioneCorrente())?.utente.email ?? null);
  cookieScritti.clear();

  // ---- codice a 6 cifre: cinque tentativi, poi il codice è bruciato
  await invia(email, null);
  const giusto = await codiceUltimaEmail();
  const sbagliato = giusto === '000000' ? '111111' : '000000';
  out.codiceSbagliato = [];
  for (let n = 0; n < 4; n++) (out.codiceSbagliato as unknown[]).push(valore(await entraCodice(email, sbagliato)));
  out.dopoQuattroTentativi = await entraCodice(email, giusto);
  out.codiceRiusato = await entraCodice(email, giusto);

  await invia(email, null);
  const giusto2 = await codiceUltimaEmail();
  const errato2 = giusto2 === '000000' ? '111111' : '000000';
  for (let n = 0; n < 5; n++) await entraCodice(email, errato2);
  out.codiceBruciato = await entraCodice(email, giusto2);

  // ---- il codice con uno spazio in mezzo, l'email in altre maiuscole, un utente che non esiste
  await invia(email, null);
  const giusto3 = await codiceUltimaEmail();
  out.codiceConSpazi = await entraCodice(email.toUpperCase(), `${giusto3.slice(0, 3)} ${giusto3.slice(3)}`);
  out.codiceUtenteSconosciuto = await entraCodice('nessuno@esempio.it', giusto3);

  // ---- un PR sospeso non riceve il link e non entra
  const d = await archivio.leggi();
  const utentePr = d.utenti.find((u) => u.ruolo === 'pr')!;
  const prId = utentePr.prId!;
  await archivio.modifica((a) => { a.pr.find((p) => p.id === prId)!.stato = 'sospeso'; });
  out.prSospeso = await prova(() => invia(utentePr.email, null));
  await archivio.modifica((a) => { a.pr.find((p) => p.id === prId)!.stato = 'attivo'; });
  const lPr = await prova(() => invia(utentePr.email, null));
  const sPr = await prova(() => s.entraConToken(parti(valore(lPr)).token));
  out.prEntra = 'v' in sPr ? { ruolo: sPr.v?.utente.ruolo, conPr: sPr.v?.pr != null } : sPr;
  await archivio.modifica((a) => { a.pr.find((p) => p.id === prId)!.stato = 'sospeso'; });
  out.prSospesoConCookie = await prova(async () => (await s.sessioneCorrente()) === null);
  return out;
}

test('l\'accesso (link, codice, cookie) sulle tabelle fa quello che fa sulla riga unica', async () => {
  const inizio = structuredClone(await m.archivio.leggi()) as import('./tipi').Archivio;
  const sulla = await storia();

  const db = await m.prove.creaDb();
  try {
    await m.prove.scriviRiga(db, inizio, 1);
    const { importa } = await import('./prova-vendite');
    await importa(db);
    m.archivio.usaTabelleDiProva({ store: m.store.storeDaDb(db), rpc: m.store.rpcDaDb(db) });
    assert.equal(m.archivio.modalitaCorrente(), 'tabelle');
    const sulleTabelle = await storia();
    for (const k of Object.keys(sulla)) assert.deepEqual(sulleTabelle[k], sulla[k], `differenza in "${k}"`);
    assert.deepEqual(Object.keys(sulleTabelle), Object.keys(sulla));

    // La storia dice qualcosa (le due strade non sono uguali perché falliscono nello stesso modo).
    const c = sulleTabelle as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(c.sconosciuto.v, undefined);
    assert.equal(c.emailDopoSconosciuto, 0, 'a chi non esiste non parte niente');
    assert.equal(c.dopo, '/admin/pr');
    assert.equal(c.vecchioLinkDopoUnNuovoInvio.v, null);
    assert.deepEqual(c.entra, { email: 'admin@maremmamusica.test', ruolo: 'admin' });
    assert.deepEqual(c.cookie[0].opzioni, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 30 * 86_400 });
    assert.equal(c.cookie[0].parti, 3);
    assert.equal(c.linkRiusato.v, null);
    assert.equal(c.linkInventato.v, null);
    assert.equal(c.sessioneDalCookie.v, 'admin@maremmamusica.test');
    assert.equal(c.cookieManomesso.v, null);
    assert.deepEqual(c.codiceSbagliato, [null, null, null, null]);
    assert.equal(c.dopoQuattroTentativi.v, 'admin@maremmamusica.test');
    assert.equal(c.codiceRiusato.v, null);
    assert.equal(c.codiceBruciato.v, null, 'dopo cinque tentativi sbagliati il codice giusto non vale più');
    assert.equal(c.codiceConSpazi.v, 'admin@maremmamusica.test');
    assert.equal(c.codiceUtenteSconosciuto.v, null);
    assert.equal(c.prSospeso.v, undefined);
    assert.deepEqual(c.prEntra, { ruolo: 'pr', conPr: true });
    assert.equal(c.prSospesoConCookie.v, true);
  } finally {
    m.archivio.usaTabelleDiProva(null);
    await db.close();
  }
});
