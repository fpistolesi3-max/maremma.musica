// Scrittura delle anagrafiche sulle tabelle (tappa 5): `applica_anagrafiche()` in SQL, il calcolo delle modifiche in TypeScript e
// `modifica()` dell'archivio sulle tabelle. Il database è un Postgres vero in memoria (PGlite); le richieste davvero simultanee si provano
// a parte (schema-scritture.gara.test.ts), perché PGlite ha una sola connessione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { creaDb, scriviRiga, MIGRAZIONI_TAVOLI } from './prova-db';
import { archivioRicco, SEGRETO_DI_PROVA } from './prova-archivio';
import { componiArchivio, confrontaArchivi, type LeggiTutto } from './tabelle';
import { calcolaModifiche, nessunaModifica, venditeToccate, type Modifiche } from './scrittura-tabelle';
import { archivioTabelle, erroreVenditeTabelle, type EsitoApplica, type StoreTabelle } from './archivio-tabelle';
import { storeDaDb } from './prova-store';
import { normalizza } from './archivio';
import type { Archivio } from './tipi';
import { importa, q, uno } from './prova-vendite';

async function conDb<T>(dati: Archivio, prova: (db: PGlite) => Promise<T>): Promise<T> {
  const db = await creaDb();
  try {
    await scriviRiga(db, dati, 41);
    await importa(db);
    return await prova(db);
  } finally {
    await db.close();
  }
}

const leggiTutto = async (db: PGlite) => (await uno(db, 'select public.leggi_tutto() as r')).r as LeggiTutto;
const applica = async (db: PGlite, m: unknown) => (await uno(db, 'select public.applica_anagrafiche($1::jsonb) as r', [JSON.stringify(m)])).r as Record<string, unknown>;
/** L'archivio com'è ora nelle tabelle. */
async function ora(db: PGlite) {
  const raw = await leggiTutto(db);
  return { raw, archivio: normalizza(componiArchivio(raw, new Date(raw.adesso))) };
}
const senzaVendite = (m: Modifiche) => m;
const nuovoUuid = () => randomUUID();

test('la migrazione di applica_anagrafiche si ferma se mancano le tappe precedenti; la funzione è chiusa a chi non è il server', async () => {
  const file = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261108000000_applica_anagrafiche.sql'), 'utf8');
  const db = await creaDb(['20261005000000_archivio_mvp.sql', '20261104000000_schema_anagrafiche.sql']);
  try {
    await assert.rejects(db.exec(file), /tappe 1, 2 e 3/);
  } finally {
    await db.close();
  }
  const completo = await creaDb();
  try {
    const f = await uno(completo, `select has_function_privilege('anon', 'public.applica_anagrafiche(jsonb)', 'execute') as anon,
      has_function_privilege('authenticated', 'public.applica_anagrafiche(jsonb)', 'execute') as auth,
      has_function_privilege('service_role', 'public.applica_anagrafiche(jsonb)', 'execute') as srv, p.prosecdef as definer, p.proconfig::text like '%search_path=%' as vuoto
      from pg_proc p where p.proname = 'applica_anagrafiche'`);
    assert.deepEqual(f, { anon: false, auth: false, srv: true, definer: true, vuoto: true });
  } finally {
    await completo.close();
  }
  // Applicare la migrazione dopo la tappa 3 (senza le 4) funziona e si può ripetere.
  const t3 = await creaDb(MIGRAZIONI_TAVOLI);
  try {
    await t3.exec(file); await t3.exec(file);
  } finally {
    await t3.close();
  }
});

test('applica_anagrafiche accetta solo le anagrafiche: le vendite e le impostazioni non passano di qui', async () => {
  await conDb(archivioRicco(), async (db) => {
    for (const tabella of ['iscrizioni', 'pagamenti', 'accessi', 'prenotazioni_tavoli', 'ingressi_tavoli', 'impostazioni', 'archivio_mvp', 'pg_catalog.pg_user']) {
      await assert.rejects(applica(db, { [tabella]: { eliminati: [{ id: nuovoUuid() }] } }), /tabella_non_ammessa/, tabella);
    }
    await assert.rejects(applica(db, [1, 2]), /modifiche_non_valide/);
    assert.deepEqual(await applica(db, {}), { ok: true, nuovi: 0, cambi: 0, eliminati: 0 });
    // Niente è cambiato.
    assert.equal((await q(db, 'select 1 from public.iscrizioni')).length, archivioRicco().iscrizioni.length);
  });
});

test('applica_anagrafiche: righe nuove, colonne cambiate e righe tolte, in una transazione sola', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { raw } = await ora(db);
    const evento = raw.eventi.find((e) => e.id === d.eventi[1].id)!;
    const lotto = raw.lotti.find((l) => l.id === d.lotti[1].id)!;
    const idNuovo = nuovoUuid();
    const esito = await applica(db, senzaVendite({
      pr: { nuovi: [{ id: idNuovo, handle: 'nuovo-pr', nome_display: 'Nuovo PR', stato: 'attivo', created_at: '2026-11-01T10:00:00Z' }], cambi: [], eliminati: [] },
      eventi: { nuovi: [], cambi: [{ prima: evento, colonne: { nome: 'Serata rinominata', capienza: 300, lineup: ['X', 'Y'], pr_abilitati: [idNuovo], invio_link_pr: { at: '2026-11-02T10:00:00Z', inviate: 1, nonPartite: 0 } } }], eliminati: [] },
      lotti: { nuovi: [], cambi: [], eliminati: [lotto] },
    }));
    assert.deepEqual(esito, { ok: true, nuovi: 1, cambi: 1, eliminati: 1 });
    const e = await uno(db, 'select nome, capienza, lineup, pr_abilitati, invio_link_pr, slug from public.eventi where id = $1', [evento.id]);
    assert.deepEqual([e.nome, e.capienza, e.lineup, e.pr_abilitati, e.invio_link_pr, e.slug], ['Serata rinominata', 300, ['X', 'Y'], [idNuovo], { at: '2026-11-02T10:00:00Z', inviate: 1, nonPartite: 0 }, evento.slug]);
    assert.equal((await q(db, 'select 1 from public.lotti where id = $1', [lotto.id])).length, 0);
    assert.equal((await uno(db, 'select handle from public.pr where id = $1', [idNuovo])).handle, 'nuovo-pr');
  });
});

test('applica_anagrafiche: se la riga è cambiata da un altro dopo la lettura, non applica niente (nemmeno il resto)', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { raw } = await ora(db);
    const evento = raw.eventi.find((e) => e.id === d.eventi[0].id)!;
    const pr = raw.pr[0];
    // Un altro cambia la serata dopo che l'abbiamo letta.
    await db.query("update public.eventi set nome = 'Cambiata da un altro' where id = $1", [evento.id]);
    const nuovo = { id: nuovoUuid(), handle: 'mai-scritto', nome_display: 'Mai scritto', stato: 'attivo', created_at: '2026-11-01T10:00:00Z' };
    await assert.rejects(applica(db, {
      pr: { nuovi: [nuovo], cambi: [{ prima: pr, colonne: { nome_display: 'Cambiato anche questo' } }], eliminati: [] },
      eventi: { nuovi: [], cambi: [{ prima: evento, colonne: { capienza: 1 } }], eliminati: [] },
    }), /conflitto_scrittura/);
    assert.equal((await uno(db, 'select nome, capienza from public.eventi where id = $1', [evento.id])).nome, 'Cambiata da un altro');
    assert.equal((await q(db, 'select 1 from public.pr where handle = $1', ['mai-scritto'])).length, 0, 'la transazione è tornata indietro');
    assert.equal((await uno(db, 'select nome_display from public.pr where id = $1', [pr.id])).nome_display, pr.nome_display);
    // Anche togliere una riga già cambiata, o già tolta, è un conflitto.
    const lotto = raw.lotti[0];
    await db.query("update public.lotti set nome = 'Altro nome' where id = $1", [lotto.id]);
    await assert.rejects(applica(db, { lotti: { eliminati: [lotto] } }), /conflitto_scrittura/);
    await db.query('delete from public.porte where true');
    await assert.rejects(applica(db, { porte: { eliminati: [raw.porte[0]] } }), /conflitto_scrittura/);
  });
});

test('applica_anagrafiche: righe con chiavi diverse non si disturbano; colonne e chiavi non valide si rifiutano', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { raw } = await ora(db);
    // Due scrittori che cambiano lotti diversi, uno dopo l'altro con la lettura vecchia: tutti e due vanno.
    const [l1, l2] = [raw.lotti[0], raw.lotti[1]];
    assert.equal((await applica(db, { lotti: { cambi: [{ prima: l1, colonne: { quantita: 11 } }] } })).cambi, 1);
    assert.equal((await applica(db, { lotti: { cambi: [{ prima: l2, colonne: { quantita: 22 } }] } })).cambi, 1);
    assert.deepEqual((await q(db, 'select quantita from public.lotti where id = any($1::uuid[]) order by quantita', [[l1.id, l2.id]])).map((r) => r.quantita), [11, 22]);
    // Colonna che non c'è, colonna generata o calcolata, cambio della chiave.
    const { raw: r2 } = await ora(db);
    const evento = r2.eventi[0];
    await assert.rejects(applica(db, { eventi: { cambi: [{ prima: evento, colonne: { non_esiste: 1 } }] } }), /colonna_non_valida/);
    await assert.rejects(applica(db, { eventi: { cambi: [{ prima: evento, colonne: { id: nuovoUuid() } }] } }), /chiave_non_modificabile/);
    await assert.rejects(applica(db, { porte: { cambi: [{ prima: r2.porte[0], colonne: { nome: 'P9' } }] } }), /chiave_non_modificabile/);
    // Un nome di colonna che prova a fare altro non è una colonna.
    await assert.rejects(applica(db, { eventi: { cambi: [{ prima: evento, colonne: { 'nome = null where true; --': 'x' } }] } }), /colonna_non_valida/);
    assert.equal((await uno(db, 'select count(*)::int as n from public.eventi where nome is null')).n, 0);
    // Una riga con colonne vuote non fa niente.
    assert.equal((await applica(db, { eventi: { cambi: [{ prima: evento, colonne: {} }] } })).cambi, 0);
  });
});

test('applica_anagrafiche: i vincoli del database tengono anche da qui (serata con vendite, nome doppio, tipo orfano)', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { raw } = await ora(db);
    // Una serata con iscrizioni non si toglie.
    await assert.rejects(applica(db, { eventi: { eliminati: [raw.eventi.find((e) => e.id === d.eventi[0].id)!] } }), (e: { code?: string }) => e.code === '23001');
    // Slug doppio, tipo senza serata.
    await assert.rejects(applica(db, { eventi: { cambi: [{ prima: raw.eventi[0], colonne: { slug: raw.eventi[1].slug } }] } }), (e: { code?: string }) => e.code === '23505');
    await assert.rejects(applica(db, { lotti: { nuovi: [{ ...raw.lotti[0], id: nuovoUuid(), evento_id: nuovoUuid() }] } }), (e: { code?: string }) => e.code === '23503');
    // Dopo gli errori il database è com'era.
    assert.deepEqual(await confrontaArchivi(normalizza(structuredClone(d)), (await ora(db)).archivio, new Date()), []);
  });
});

const evento = (a: Archivio, slug = 'halloween-party') => a.eventi.find((e) => e.slug === slug)!;

/** Una serie di modifiche tipiche dell'admin su una copia dell'archivio. */
function modificheDaAdmin(a: Archivio) {
  const halloween = evento(a); const solchi = evento(a, 'solchi'); const capodanno = evento(a, 'capodanno-in-pineta');
  const nuovoEvento = { ...structuredClone(solchi), id: nuovoUuid(), slug: 'serata-nuova', nome: 'Serata nuova', numero: 99, inCopertina: false, createdAt: '2026-11-03T10:00:00.000Z', updatedAt: '2026-11-03T10:00:00.000Z' };
  a.eventi.push(nuovoEvento);
  halloween.nome = 'Halloween rinominata';
  solchi.capienza = 500; solchi.lineup = [...solchi.lineup, 'Nuovo ospite'];
  capodanno.prezzoLista = 12.5; capodanno.prevenditaFinoAlle = '2026-12-31T23:30:00.000Z';
  a.eventi = a.eventi.filter((e) => e.slug !== 'ricky-le-roy-monteverdi'); // la serata passata, senza vendite
  const l0 = a.lotti.find((l) => l.eventoId === halloween.id)!; l0.quantita = 10; l0.categoria = null; l0.confermaCategoria = false; l0.uscitaGiorniPrima = null; l0.fineOrePrima = null;
  const lSolchi = a.lotti.find((l) => l.eventoId === solchi.id)!;
  a.lotti = a.lotti.filter((l) => l.eventoId !== capodanno.id);
  a.lotti.push({ ...structuredClone(lSolchi), id: nuovoUuid(), eventoId: nuovoEvento.id, nome: 'Tipo nuovo', ordine: 7, automatico: false });
  const prNuovo = { id: nuovoUuid(), handle: 'pr-nuovo', nomeDisplay: 'PR Nuovo', stato: 'attivo' as const, createdAt: '2026-11-03T10:00:00.000Z' };
  a.pr.push(prNuovo);
  a.utenti.push({ id: nuovoUuid(), email: 'pr-nuovo@esempio.it', ruolo: 'pr', prId: prNuovo.id, createdAt: '2026-11-03T10:00:00.000Z' });
  a.utenti.push({ id: nuovoUuid(), email: 'staff2@esempio.it', ruolo: 'staff', prId: null, createdAt: '2026-11-03T10:00:00.000Z' });
  a.pr[1].nomeDisplay = 'Nome PR cambiato'; a.pr[2].stato = 'sospeso';
  a.tavoli[1].stato = 'non_in_vendita'; a.tavoli[0].posti = 8; a.tavoli[3].x = 40; a.tavoli[3].y = 50;
  a.tavoli.push({ id: nuovoUuid(), eventoId: nuovoEvento.id, nome: 'N1', zona: null, posti: 4, spesaMinima: 90, stato: 'libero', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 1, x: null, y: null });
  a.porte[1].ultimoSync = '2026-11-01T01:00:00.000Z';
  a.porte.push({ nome: 'P3', eventoId: halloween.id, ultimoSync: '2026-11-01T02:00:00.000Z', ingressi: 0 });
  a.posta.unshift({ id: nuovoUuid(), a: 'uno@esempio.it', oggetto: 'Ciao', html: '<p>ciao</p>', inviataAt: '2026-11-03T11:00:00.000Z', via: 'archivio' });
  a.posta.unshift({ id: nuovoUuid(), a: 'due@esempio.it', oggetto: 'Ciao 2', html: '<p>ciao 2</p>', inviataAt: '2026-11-03T12:00:00.000Z', via: 'smtp' });
}

test('dopo una serie di modifiche tipiche dell\'admin le tabelle ricompongono esattamente l\'archivio modificato', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { raw, archivio: prima } = await ora(db);
    const dopo = structuredClone(prima);
    modificheDaAdmin(dopo);
    assert.deepEqual(venditeToccate(prima, dopo), [], 'nessuna vendita toccata');
    const modifiche = calcolaModifiche(prima, dopo, raw);
    assert.deepEqual(Object.keys(modifiche).sort(), ['eventi', 'lotti', 'porte', 'posta_inviata', 'pr', 'tavoli', 'utenti']);
    assert.deepEqual([modifiche.eventi!.nuovi.length, modifiche.eventi!.cambi.length, modifiche.eventi!.eliminati.length], [1, 3, 1]);
    assert.deepEqual([modifiche.lotti!.nuovi.length, modifiche.lotti!.cambi.length, modifiche.lotti!.eliminati.length], [1, 1, 1]);
    assert.deepEqual([modifiche.tavoli!.nuovi.length, modifiche.tavoli!.cambi.length], [1, 3]);
    assert.deepEqual([modifiche.porte!.nuovi.length, modifiche.porte!.cambi.length], [1, 1]);
    // Cambia solo quello che è cambiato: la serata rinominata manda il nome, non le altre venti colonne.
    assert.deepEqual(Object.keys(modifiche.eventi!.cambi.find((c) => c.colonne.nome === 'Halloween rinominata')!.colonne), ['nome']);
    assert.deepEqual(Object.keys(modifiche.pr!.cambi.find((c) => c.colonne.stato === 'sospeso')!.colonne), ['stato']);
    assert.deepEqual(await applica(db, modifiche), { ok: true, nuovi: 9, cambi: 10, eliminati: 2 });
    const { archivio: dopoLette } = await ora(db);
    assert.deepEqual(confrontaArchivi(dopo, dopoLette, new Date()), []);
    assert.deepEqual(dopoLette.posta.map((p) => p.oggetto), ['Ciao 2', 'Ciao'], 'le email, le più recenti per prime');
    // Le vendite non si sono mosse.
    assert.equal((await q(db, 'select 1 from public.iscrizioni')).length, d.iscrizioni.length);
    assert.equal((await q(db, 'select 1 from public.pagamenti')).length, (await ora(db)).raw.pagamenti.length);
    // Rifare lo stesso confronto sul risultato non trova più niente da fare.
    assert.ok(nessunaModifica(calcolaModifiche(dopoLette, structuredClone(dopoLette), (await ora(db)).raw)));
  });
});

test('il calcolo delle modifiche non confonde le cose derivate con modifiche vere', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { raw, archivio: prima } = await ora(db);
    const dopo = structuredClone(prima);
    // Stato di un tavolo (libero / riservato / confermato), ingressi per porta, date riscritte in un altro fuso: non sono cambiamenti.
    dopo.tavoli[0].stato = 'libero'; dopo.tavoli[3].stato = 'confermato';
    dopo.porte[0].ingressi = 777;
    evento(dopo).data = new Date(evento(dopo).data).toISOString().replace('Z', '+00:00');
    dopo.consegne = [];
    assert.ok(nessunaModifica(calcolaModifiche(prima, dopo, raw)), JSON.stringify(calcolaModifiche(prima, dopo, raw)));
    // Mentre "non in vendita" sì.
    dopo.tavoli[0].stato = 'non_in_vendita';
    assert.deepEqual(Object.keys(calcolaModifiche(prima, dopo, raw)), ['tavoli']);
  });
});

test('venditeToccate nomina le parti dell\'archivio che non sono anagrafiche', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { archivio: prima } = await ora(db);
    const casi: [string, (a: Archivio) => void][] = [
      ['iscrizioni', (a) => { a.iscrizioni[0].stato = 'annullato'; }],
      ['iscrizioni', (a) => { a.iscrizioni.pop(); }],
      ['prenotazioni', (a) => { a.prenotazioni[0].persone = 1; }],
      ['accessi', (a) => { a.accessi.push({ id: nuovoUuid(), utenteId: a.utenti[0].id, tokenHash: 'x', codiceHash: 'y', scade: '2030-01-01T00:00:00.000Z', usato: false, tentativi: 0 }); }],
      ['consegne', (a) => { a.consegne.push({ id: nuovoUuid() } as never); }],
      ['segreto', (a) => { a.segreto = 'altro'; }],
    ];
    for (const [nome, cambia] of casi) {
      const dopo = structuredClone(prima); cambia(dopo);
      assert.deepEqual(venditeToccate(prima, dopo), [nome]);
    }
    assert.deepEqual(venditeToccate(prima, structuredClone(prima)), []);
  });
});

/** Uno store che prima di applicare fa succedere qualcosa d'altro (un altro scrittore, un guasto). */
function storeConImprevisti(db: PGlite, prima: (n: number) => Promise<void> | void): StoreTabelle & { applicazioni: number } {
  const base = storeDaDb(db);
  const s = {
    ...base, applicazioni: 0,
    async applica(m: Modifiche): Promise<EsitoApplica> { s.applicazioni++; await prima(s.applicazioni); return base.applica(m); },
  };
  return s;
}
const senzaPause = { attesa: async () => undefined };

test('modifica sulle tabelle: scrive solo le righe cambiate e restituisce quello che restituisce la funzione', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const archivio = archivioTabelle(storeDaDb(db), normalizza, senzaPause);
    const esito = await archivio.modifica((a) => {
      evento(a).nome = 'Rinominata da modifica()';
      a.posta.unshift({ id: nuovoUuid(), a: 'x@esempio.it', oggetto: 'Prova', html: '<p>x</p>', inviataAt: new Date().toISOString(), via: 'archivio' });
      return 'fatto';
    });
    assert.equal(esito, 'fatto');
    const letto = await archivio.leggi();
    assert.equal(letto.eventi.find((e) => e.id === d.eventi[0].id)!.nome, 'Rinominata da modifica()');
    assert.equal(letto.posta.length, 1);
    // Ordinare di nuovo la stessa cosa non scrive niente.
    const store = storeConImprevisti(db, () => undefined);
    const identico = archivioTabelle(store, normalizza, senzaPause);
    assert.equal(await identico.modifica((a) => { evento(a).nome = 'Rinominata da modifica()'; return 7; }), 7);
    assert.equal(store.applicazioni, 0, 'nessuna scrittura per una modifica che non cambia niente');
  });
});

test('modifica sulle tabelle: se un altro cambia la stessa riga, rilegge e rifà (con i dati nuovi), senza perdere né uno né l\'altro', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    let chiamate = 0;
    const store = storeConImprevisti(db, async (n) => {
      if (n === 1) await db.query("update public.eventi set capienza = 1234, nome = 'Scritta da un altro' where id = $1", [d.eventi[0].id]);
    });
    const archivio = archivioTabelle(store, normalizza, senzaPause);
    await archivio.modifica((a) => {
      chiamate++;
      const e = a.eventi.find((x) => x.id === d.eventi[0].id)!;
      e.capienza = (e.capienza ?? 0) + 1;       // si parte dal valore letto: al secondo giro è quello dell'altro
    });
    assert.equal(chiamate, 2, 'la funzione gira due volte: la seconda sui dati nuovi');
    assert.equal(store.applicazioni, 2);
    const e = (await archivio.leggi()).eventi.find((x) => x.id === d.eventi[0].id)!;
    assert.deepEqual([e.capienza, e.nome], [1235, 'Scritta da un altro']);
    // Se il conflitto non finisce mai, dopo i tentativi ci si ferma con un messaggio chiaro.
    const sempre = storeConImprevisti(db, async () => { await db.query("update public.eventi set capienza = capienza + 1 where id = $1", [d.eventi[0].id]); });
    const ostinato = archivioTabelle(sempre, normalizza, { ...senzaPause, tentativi: 3 });
    await assert.rejects(ostinato.modifica((a) => { evento(a).capienza = 5; }), /troppe scritture in contemporanea/);
    assert.equal(sempre.applicazioni, 3);
  });
});

test('modifica sulle tabelle: righe diverse non si disturbano; un errore della funzione non scrive niente e non fa riprovare', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    // Qualcuno cambia una riga diversa (un PR) mentre noi cambiamo una serata: nessun conflitto, nessuna rilettura.
    let chiamate = 0;
    const store = storeConImprevisti(db, async () => { await db.query("update public.pr set nome_display = 'Cambiato da un altro' where id = $1", [d.pr[3].id]); });
    const archivio = archivioTabelle(store, normalizza, senzaPause);
    await archivio.modifica((a) => { chiamate++; evento(a).nome = 'Solo questa'; });
    assert.deepEqual([chiamate, store.applicazioni], [1, 1]);
    const letto = await archivio.leggi();
    assert.deepEqual([letto.eventi.find((e) => e.id === d.eventi[0].id)!.nome, letto.pr.find((p) => p.id === d.pr[3].id)!.nomeDisplay], ['Solo questa', 'Cambiato da un altro']);
    // Errore della funzione (controlli, permessi): passa com'è, niente scritto, una volta sola.
    let giri = 0;
    await assert.rejects(archivio.modifica((a) => { giri++; evento(a).nome = 'Mai scritta'; throw new Error('non_autorizzato'); }), /non_autorizzato/);
    assert.equal(giri, 1);
    assert.equal((await archivio.leggi()).eventi.find((e) => e.id === d.eventi[0].id)!.nome, 'Solo questa');
  });
});

test('modifica sulle tabelle: toccare le vendite si ferma con un errore chiaro e non scrive nemmeno le anagrafiche della stessa modifica', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const archivio = archivioTabelle(storeDaDb(db), normalizza, senzaPause);
    await assert.rejects(archivio.modifica((a) => { evento(a).nome = 'Non deve passare'; a.iscrizioni[0].stato = 'annullato'; }),
      (e: Error) => e.message === erroreVenditeTabelle(['iscrizioni']));
    await assert.rejects(archivio.modifica((a) => { a.accessi.pop(); }), (e: Error) => e.message === erroreVenditeTabelle(['accessi']));
    const letto = await archivio.leggi();
    assert.equal(letto.eventi.find((e) => e.id === d.eventi[0].id)!.nome, d.eventi[0].nome);
    // La coda non resta bloccata dopo un errore.
    await archivio.modifica((a) => { evento(a).nome = 'Ora sì'; });
    assert.equal((await archivio.leggi()).eventi.find((e) => e.id === d.eventi[0].id)!.nome, 'Ora sì');
  });
});

test('modifica sulle tabelle: tre chiamate insieme nello stesso processo vanno una dopo l\'altra e nessuna si perde', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const archivio = archivioTabelle(storeDaDb(db), normalizza, senzaPause);
    await Promise.all([1, 2, 3].map((n) => archivio.modifica((a) => { evento(a).capienza = (evento(a).capienza ?? 0) + n; })));
    const base = d.eventi[0].capienza ?? 0;
    assert.equal((await archivio.leggi()).eventi.find((e) => e.id === d.eventi[0].id)!.capienza, base + 6);
  });
});

test('una modifica che cancella una serata con le sue cose (tipi, tavoli, porte) le toglie nell\'ordine giusto', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    // Una serata nuova con un tipo, un tavolo e una porta, poi tolta con tutto.
    const archivio = archivioTabelle(storeDaDb(db), normalizza, senzaPause);
    const idEvento = nuovoUuid();
    await archivio.modifica((a) => {
      a.eventi.push({ ...structuredClone(a.eventi[1]), id: idEvento, slug: 'effimera', numero: 98, inCopertina: false });
      a.lotti.push({ ...structuredClone(a.lotti[0]), id: nuovoUuid(), eventoId: idEvento, categoria: null, confermaCategoria: false, uscitaGiorniPrima: null, fineOrePrima: null });
      a.tavoli.push({ id: nuovoUuid(), eventoId: idEvento, nome: 'E1', zona: null, posti: 2, spesaMinima: 10, stato: 'libero', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 1, x: null, y: null });
      a.porte.push({ nome: 'PE', eventoId: idEvento, ultimoSync: '2026-11-03T10:00:00.000Z', ingressi: 0 });
    });
    assert.equal((await archivio.leggi()).tavoli.filter((t) => t.eventoId === idEvento).length, 1);
    await archivio.modifica((a) => {
      a.eventi = a.eventi.filter((e) => e.id !== idEvento);
      a.lotti = a.lotti.filter((l) => l.eventoId !== idEvento);
      a.tavoli = a.tavoli.filter((t) => t.eventoId !== idEvento);
      a.porte = a.porte.filter((p) => p.eventoId !== idEvento);
    });
    const letto = await archivio.leggi();
    assert.deepEqual([letto.eventi.length, letto.lotti.length, letto.tavoli.length, letto.porte.length], [d.eventi.length, d.lotti.length, d.tavoli.length, d.porte.length]);
    assert.ok(SEGRETO_DI_PROVA);
  });
});

test('modifica sulle tabelle: spostare la copertina da una serata all\'altra funziona in qualunque ordine delle serate', async () => {
  for (const verso of [0, 1]) {
    const d = archivioRicco();
    d.eventi.forEach((e) => { e.inCopertina = false; });
    const [da, a] = verso === 0 ? [d.eventi[0], d.eventi[1]] : [d.eventi[1], d.eventi[0]];
    da.inCopertina = true;
    await conDb(d, async (db) => {
      const archivio = archivioTabelle(storeDaDb(db), normalizza, senzaPause);
      await archivio.modifica((x) => { for (const e of x.eventi) e.inCopertina = e.id === a.id; });
      assert.deepEqual((await archivio.leggi()).eventi.filter((e) => e.inCopertina).map((e) => e.id), [a.id], `verso ${verso}: una sola in copertina, quella nuova`);
    });
  }
});
