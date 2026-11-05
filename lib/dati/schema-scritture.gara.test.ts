// Test di gara della scrittura delle anagrafiche (tappa 5): più "istanze" del sito (ognuna con la sua coda e le sue connessioni) che
// scrivono insieme sullo stesso Postgres vero. Come gli altri file *.gara.test.ts: girano solo con MM_TEST_PG_URL (file `.env.test.local`,
// vedi README), in uno schema creato e cancellato a ogni giro, e non partono se l'indirizzo è quello del sito vero.
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { controllaUrlProva, creaAmbiente, leggiUrlProva, type Ambiente } from './prova-pg';
import { nuovaSerata, uno } from './prova-vendite';
import { storeDaDb } from './prova-store';
import { archivioTabelle } from './archivio-tabelle';
import { normalizza } from './archivio';

const url = leggiUrlProva();
const SALTA = url ? false : 'Test di gara saltati: manca MM_TEST_PG_URL (di solito in .env.test.local, vedi README, sezione "Test di gara")';

const insieme = <T>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));

async function conAmbiente(prova: (db: Ambiente) => Promise<void>) {
  if (!url) return;
  controllaUrlProva(url);
  const db = await creaAmbiente(url);
  try {
    // Il segreto dei QR: senza, l'archivio non si ricompone.
    await db.query("insert into public.impostazioni (chiave, valore) values ('segreto', 'segreto-solo-per-la-gara')");
    await prova(db);
  } finally {
    await db.chiudi();
  }
}

/** Un'"istanza" del sito: la sua coda, le sue riprove, le connessioni del pool (in un processo solo, ma senza coda in comune). */
const istanza = (db: Ambiente) => archivioTabelle(storeDaDb(db), normalizza, { tentativi: 30 });

test('gara scritture: 5 istanze × 4 aggiornamenti della stessa serata → nessun aggiornamento perso', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  await db.query('update public.eventi set capienza = 100 where id = $1', [eventoId]);
  const istanze = Array.from({ length: 5 }, () => istanza(db));
  await insieme(20, (i) => istanze[i % 5].modifica((a) => {
    const e = a.eventi.find((x) => x.id === eventoId)!;
    e.capienza = (e.capienza ?? 0) + 1;
  }));
  assert.equal((await uno(db, 'select capienza from public.eventi where id = $1', [eventoId])).capienza, 120);
}));

test('gara scritture: istanze che toccano righe diverse (tipi di una serata) non si disturbano', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const lotti = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
    const id = randomUUID();
    await db.query("insert into public.lotti (id, evento_id, nome, prezzo, quantita, ordine) values ($1, $2, $3, 10, 0, $4)", [id, eventoId, `Tipo ${i}`, i]);
    return id;
  }));
  const istanze = lotti.map(() => istanza(db));
  await insieme(lotti.length * 3, (i) => istanze[i % lotti.length].modifica((a) => {
    const l = a.lotti.find((x) => x.id === lotti[i % lotti.length])!;
    l.quantita = (l.quantita ?? 0) + 1;
  }));
  const righe = await Promise.all(lotti.map(async (id) => (await uno(db, 'select quantita from public.lotti where id = $1', [id])).quantita));
  assert.deepEqual(righe, lotti.map(() => 3));
}));

test('gara scritture: due istanze creano lo stesso PR insieme → uno solo, l\'altra riceve un errore chiaro', { skip: SALTA }, () => conAmbiente(async (db) => {
  const [a, b] = [istanza(db), istanza(db)];
  const crea = (s: ReturnType<typeof istanza>, id: string) => s.modifica((d) => {
    d.pr.push({ id, handle: 'stesso-handle', nomeDisplay: 'Stesso', stato: 'attivo', createdAt: new Date().toISOString() });
  });
  const esiti = await Promise.allSettled([crea(a, randomUUID()), crea(b, randomUUID())]);
  assert.equal(esiti.filter((e) => e.status === 'fulfilled').length, 1);
  assert.equal(esiti.filter((e) => e.status === 'rejected').length, 1);
  assert.equal((await uno(db, "select count(*)::int as n from public.pr where handle = 'stesso-handle'")).n, 1);
}));

test('gara scritture: una serata cambiata da un\'istanza mentre un\'altra la toglie → o l\'una o l\'altra, mai metà', { skip: SALTA }, () => conAmbiente(async (db) => {
  for (let giro = 0; giro < 5; giro++) {
    const { eventoId } = await nuovaSerata(db, 5);
    const [a, b] = [istanza(db), istanza(db)];
    const esiti = await Promise.allSettled([
      a.modifica((d) => { d.eventi.find((x) => x.id === eventoId)!.nome = `Rinominata ${giro}`; }),
      b.modifica((d) => { d.lotti = d.lotti.filter((l) => l.eventoId !== eventoId); d.eventi = d.eventi.filter((x) => x.id !== eventoId); }),
    ]);
    // Se la rinomina arriva dopo la cancellazione, la funzione non trova più la serata: errore, non una serata a metà.
    const resta = (await uno(db, 'select count(*)::int as n from public.eventi where id = $1', [eventoId])).n;
    const lotti = (await uno(db, 'select count(*)::int as n from public.lotti where evento_id = $1', [eventoId])).n;
    assert.ok((resta === 1 && lotti === 1) || (resta === 0 && lotti === 0), `giro ${giro}: serata ${resta}, tipi ${lotti}`);
    assert.ok(esiti.some((e) => e.status === 'fulfilled'));
  }
}));
