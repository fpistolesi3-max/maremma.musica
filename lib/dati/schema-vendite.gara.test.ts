// Test di gara: richieste davvero simultanee, ciascuna su una sua connessione, contro un Postgres vero (il database di PROVA su
// Supabase). Provano quello che PGlite non può provare: l'attesa reciproca dei blocchi e i conflitti tra connessioni diverse.
// Girano solo se c'è MM_TEST_PG_URL (file `.env.test.local`, vedi README); senza, si saltano con un messaggio.
// Lavorano in uno schema creato e cancellato a ogni giro, mai in `public`, e non partono se l'indirizzo è quello del sito vero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { controllaUrlProva, creaAmbiente, leggiUrlProva, nelloSchema, PROGETTO_VERO, type Ambiente } from './prova-pg';
import {
  ADESSO, avviaRimborso, concludiRimborso, conferma, crea, nuovaSerata, pagamenti, segnaIngresso, stato, tra, uno, usaCodice, usaToken, type Json,
} from './prova-vendite';

const url = leggiUrlProva();
const SALTA = url ? false : 'Test di gara saltati: manca MM_TEST_PG_URL (di solito in .env.test.local, vedi README, sezione "Test di gara")';

/** Conta quante volte compare ogni esito. */
const conta = (esiti: string[]) => esiti.reduce<Record<string, number>>((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {});
const insieme = <T>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));

/** Un ambiente solo per tutte le prove del file (ogni prova usa una sua serata). */
async function conAmbiente(prova: (db: Ambiente) => Promise<void>) {
  if (!url) return;
  controllaUrlProva(url);
  const db = await creaAmbiente(url);
  try {
    await prova(db);
  } finally {
    await db.chiudi();
  }
}

// Le protezioni girano sempre, anche senza database di prova.
test('gara, protezioni: il sito vero e gli indirizzi sbagliati sono rifiutati', () => {
  assert.throws(() => controllaUrlProva('postgresql://postgres.iowbljhcjfppjjwbumsm:x@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'), /sito vero/);
  assert.throws(() => controllaUrlProva('postgresql://postgres:x@db.iowbljhcjfppjjwbumsm.supabase.co:5432/postgres'), /sito vero/);
  assert.throws(() => controllaUrlProva('postgresql://postgres:x@db.IOWBLJHCJFPPJJWBUMSM.supabase.co:5432/postgres'), /sito vero/);
  assert.throws(() => controllaUrlProva('https://esempio.test'), /postgres/);
  assert.doesNotThrow(() => controllaUrlProva('postgresql://postgres:x@db.progettodiprova.supabase.co:5432/postgres'));
  assert.equal(PROGETTO_VERO, 'iowbljhcjfppjjwbumsm');
});

test("gara, protezioni: l'indirizzo si legge dall'ambiente o da .env.test.local", () => {
  const cartella = mkdtempSync(path.join(tmpdir(), 'mm-env-'));
  try {
    assert.equal(leggiUrlProva({}, cartella), null);
    writeFileSync(path.join(cartella, '.env.test.local'), ['# commento', 'ALTRO=1', 'MM_TEST_PG_URL="postgresql://a:b@host:5432/db"', ''].join('\n'));
    assert.equal(leggiUrlProva({}, cartella), 'postgresql://a:b@host:5432/db');
    writeFileSync(path.join(cartella, '.env.test.local'), ['export MM_TEST_PG_URL=postgresql://c:d@host/db', ''].join('\r\n'));
    assert.equal(leggiUrlProva({}, cartella), 'postgresql://c:d@host/db');
    // L'ambiente vince sul file.
    assert.equal(leggiUrlProva({ MM_TEST_PG_URL: 'postgresql://e:f@host/db' }, cartella), 'postgresql://e:f@host/db');
    // Una riga vuota non conta.
    writeFileSync(path.join(cartella, '.env.test.local'), 'MM_TEST_PG_URL=\n');
    assert.equal(leggiUrlProva({}, cartella), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('gara: lo schema di prova non è mai public e le tabelle si traducono', () => {
  assert.equal(nelloSchema('select * from public.iscrizioni; revoke execute on function public.f() from public, anon;', 'prova_gara_ab'),
    'select * from prova_gara_ab.iscrizioni; revoke execute on function prova_gara_ab.f() from public, anon;');
});

test('gara: 50 iscrizioni insieme per 10 posti → 10 entrano, 40 trovano il tipo pieno', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const esiti = await insieme(50, (i) => crea(db, eventoId, lottoId, { cognome: `Persona${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, email: `p${i}@esempio.it` }));
  assert.deepEqual(conta(esiti.map((e) => e.esito)), { creata: 10, lotto_pieno: 40 });
  assert.equal((await uno(db, 'select count(*)::int as n from public.iscrizioni where lotto_id = $1', [lottoId])).n, 10);
}));

test('gara: la stessa persona che preme 20 volte insieme ottiene una sola richiesta', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 5);
  const esiti = await insieme(20, () => crea(db, eventoId, lottoId, { cognome: 'Doppia', email: 'doppia@esempio.it' }));
  assert.deepEqual(conta(esiti.map((e) => e.esito)), { creata: 1, ripresa: 19 });
  const creata = esiti.find((e) => e.esito === 'creata')!;
  assert.ok(esiti.every((e) => e.id === creata.id), 'tutti ricevono la stessa richiesta');
  assert.equal((await uno(db, 'select count(*)::int as n from public.iscrizioni where lotto_id = $1', [lottoId])).n, 1);
}));

test('gara: lo stesso webhook arrivato 20 volte insieme conferma una volta sola', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Webhook', email: 'w@esempio.it' });
  const esiti = await insieme(20, () => conferma(db, a.id, 'pi_unico'));
  assert.deepEqual(conta(esiti.map((e) => e.esito as string)), { confermata: 1, gia: 19 });
  assert.equal(await stato(db, a.id), 'pagato');
  assert.deepEqual((await pagamenti(db, a.id)).map((p) => [p.id, p.ruolo]), [['pi_unico', 'principale']]);
}));

test('gara: 20 pagamenti diversi sullo stesso ordine → uno conferma, 19 vanno restituiti', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Pagine', email: 'p@esempio.it' });
  const esiti = await insieme(20, (i) => conferma(db, a.id, `pi_${i}`));
  assert.deepEqual(conta(esiti.map((e) => `${e.esito}/${e.motivo ?? ''}`)), { 'confermata/': 1, 'da_rimborsare/secondo_pagamento': 19 });
  const righe = await pagamenti(db, a.id);
  assert.equal(righe.length, 20);
  assert.equal(righe.filter((p) => p.ruolo === 'principale').length, 1);
  assert.equal(await stato(db, a.id), 'pagato');
}));

test('gara: lo stesso QR su 5 telefoni insieme → entra una volta sola, gli altri trovano l\'ora del primo', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Porta', email: 'porta@esempio.it' });
  await conferma(db, a.id, 'pi_porta');
  const esiti: Json[] = await insieme(5, (i) => segnaIngresso(db, a.id, eventoId, tra(10 + i), `P${i}`));
  assert.deepEqual(conta(esiti.map((e) => e.esito as string)), { entrato: 1, gia_entrato: 4 });
  const vincitore = esiti.find((e) => e.esito === 'entrato')!;
  for (const e of esiti) assert.deepEqual([new Date(e.ora_check_in as string).getTime(), e.porta], [new Date(vincitore.ora_check_in as string).getTime(), vincitore.porta]);
  const riga = await uno(db, 'select stato, porta from public.iscrizioni where id = $1', [a.id]);
  assert.deepEqual([riga.stato, riga.porta], ['entrato', vincitore.porta]);
}));

test('gara: il rimborso premuto due volte insieme parte una volta sola, e si conclude una volta sola', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Rimborso', email: 'r@esempio.it' });
  await conferma(db, a.id, 'pi_rimborso');
  const avvii = await insieme(2, (i) => avviaRimborso(db, 'pi_rimborso', `chiave-${i}`));
  assert.deepEqual(conta(avvii.map((e) => e.esito as string)), { avviato: 1, in_corso: 1 });
  const chiave = (avvii.find((e) => e.esito === 'avviato')!).chiave;
  assert.equal((await uno(db, "select rimborso_chiave from public.pagamenti where id = 'pi_rimborso'")).rimborso_chiave, chiave);
  const fine = await insieme(5, () => concludiRimborso(db, 'pi_rimborso'));
  assert.deepEqual(conta(fine.map((e) => e.esito as string)), { chiuso: 1, gia: 4 });
  assert.equal(fine.filter((e) => e.chiusa_ordine === true).length, 1, 'l\'email al cliente parte una volta sola');
  assert.equal(await stato(db, a.id), 'rimborsato');
}));

test('gara: lo stesso link di accesso usato 5 volte insieme vale una volta sola', { skip: SALTA }, () => conAmbiente(async (db) => {
  const utente = randomUUID();
  await db.query("insert into public.utenti (id, email, ruolo) values ($1, 'gara@esempio.it', 'staff')", [utente]);
  const nuovo = (token: string, codice: string) =>
    db.query('insert into public.accessi (id, utente_id, token_hash, codice_hash, scade) values (gen_random_uuid(), $1, $2, $3, $4::timestamptz)', [utente, token, codice, tra(60)]);
  await nuovo('token-1', 'codice-1');
  const esiti = await insieme(5, () => usaToken(db, 'token-1'));
  assert.equal(esiti.filter((e) => e === utente).length, 1);
  assert.equal(esiti.filter((e) => e === null).length, 4);

  // Il codice giusto usato 5 volte insieme: una sola.
  await nuovo('token-2', 'codice-2');
  const giusti = await insieme(5, () => usaCodice(db, utente, 'codice-2'));
  assert.equal(giusti.filter(Boolean).length, 1);

  // Dieci tentativi sbagliati insieme: il codice si brucia e il giusto, dopo, non vale più. Il contatore non perde colpi.
  await nuovo('token-3', 'codice-3');
  const sbagliati = await insieme(10, () => usaCodice(db, utente, 'sbagliato'));
  assert.equal(sbagliati.filter(Boolean).length, 0);
  assert.equal(await usaCodice(db, utente, 'codice-3'), false);
  const riga = await uno(db, "select usato, tentativi from public.accessi where token_hash = 'token-3'");
  assert.equal(riga.usato, true);
  assert.ok(Number(riga.tentativi) >= 6 && Number(riga.tentativi) <= 10, `tentativi contati: ${riga.tentativi}`);
}));

test('gara: l\'ultimo posto con due pagamenti insieme → uno conferma, uno va restituito', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 1);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Uno', email: 'uno@esempio.it' });
  const b = await crea(db, eventoId, lottoId, { cognome: 'Due', email: 'due@esempio.it', adesso: tra(40), scade: tra(70) }); // il posto di A era scaduto
  assert.equal(b.esito, 'creata');
  // Tutti e due scaduti quando pagano (dopo il termine di B): in palio resta un solo posto.
  const quando = tra(100);
  const esiti = await insieme(2, (i) => conferma(db, i === 0 ? a.id : b.id, `pi_${i}`, { adesso: quando }));
  assert.deepEqual(conta(esiti.map((e) => `${e.esito}/${e.motivo ?? ''}`)), { 'confermata/': 1, 'da_rimborsare/lotto_pieno': 1 });
  assert.equal((await uno(db, "select count(*)::int as n from public.iscrizioni where lotto_id = $1 and stato = 'pagato'", [lottoId])).n, 1);
}));

test('gara: 20 pagamenti insieme per 5 posti → 5 confermati, 15 restituiti', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 5);
  const ordini: string[] = [];
  // Venti richieste una dopo l'altra, ognuna dopo la scadenza della precedente: tutte nascono, nessuna tiene il posto per sempre.
  for (let i = 0; i < 20; i++) {
    const c = await crea(db, eventoId, lottoId, { cognome: `Gara${String.fromCharCode(97 + i)}`, email: `g${i}@esempio.it`, adesso: tra(i * 31), scade: tra(i * 31 + 30) });
    assert.equal(c.esito, 'creata', `richiesta ${i}`);
    ordini.push(c.id);
  }
  const quando = tra(20 * 31 + 5);
  const esiti = await insieme(20, (i) => conferma(db, ordini[i], `pi_${i}`, { adesso: quando }));
  assert.deepEqual(conta(esiti.map((e) => `${e.esito}/${e.motivo ?? ''}`)), { 'confermata/': 5, 'da_rimborsare/lotto_pieno': 15 });
  assert.equal((await uno(db, "select count(*)::int as n from public.iscrizioni where lotto_id = $1 and stato = 'pagato'", [lottoId])).n, 5);
}));

test('gara: la stessa persona con due richieste che pagano insieme → un solo QR', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Gemella', email: 'g@esempio.it' });
  const b = await crea(db, eventoId, lottoId, { cognome: 'Gemella', email: 'g@esempio.it', adesso: tra(40), scade: tra(70) }); // la prima era scaduta
  assert.equal(b.esito, 'creata');
  const quando = tra(100);
  const esiti = await insieme(2, (i) => conferma(db, i === 0 ? a.id : b.id, `pi_${i}`, { adesso: quando }));
  assert.deepEqual(conta(esiti.map((e) => `${e.esito}/${e.motivo ?? ''}`)), { 'confermata/': 1, 'da_rimborsare/doppione': 1 });
  assert.equal((await uno(db, "select count(*)::int as n from public.iscrizioni where chiave_cognome = 'gemella' and stato = 'pagato'")).n, 1);
}));

test('gara: iscrizioni e pagamenti insieme sullo stesso tipo non si bloccano a vicenda', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 30);
  const ordini: string[] = [];
  for (let i = 0; i < 10; i++) ordini.push((await crea(db, eventoId, lottoId, { cognome: `Misto${String.fromCharCode(97 + i)}`, email: `m${i}@esempio.it` })).id);
  const lavori: Promise<unknown>[] = [
    ...ordini.map((id, i) => conferma(db, id, `pi_m${i}`)),
    ...Array.from({ length: 30 }, (_, i) => crea(db, eventoId, lottoId, { cognome: `Nuova${String.fromCharCode(97 + (i % 26))}${i >= 26 ? 'b' : ''}`, email: `n${i}@esempio.it` })),
    ...ordini.map((id) => segnaIngresso(db, id, eventoId, tra(10), 'P1')),
  ];
  // Nessuna delle richieste deve restare appesa o finire in un errore di blocco (deadlock): tutte rispondono.
  const finiti = await Promise.allSettled(lavori);
  const guasti = finiti.filter((f) => f.status === 'rejected').map((f) => String((f as PromiseRejectedResult).reason));
  assert.deepEqual(guasti, []);
  const { n } = await uno(db, "select count(*)::int as n from public.iscrizioni where lotto_id = $1 and (stato in ('pagato', 'entrato') or (stato = 'in_attesa' and scade > $2::timestamptz))", [lottoId, ADESSO.toISOString()]);
  assert.ok(Number(n) <= 30, `posti occupati: ${n} su 30`);
}));
