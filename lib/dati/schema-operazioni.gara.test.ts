// Test di gara delle operazioni della tappa 6 (annulla / ripristina, cambio di nominativo, lascia il posto): richieste davvero simultanee, ciascuna
// su una sua connessione, contro un Postgres vero. Come gli altri file *.gara.test.ts: girano solo con MM_TEST_PG_URL (file `.env.test.local`,
// vedi README), in uno schema creato e cancellato a ogni giro, e non partono se l'indirizzo è quello del sito vero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaUrlProva, creaAmbiente, leggiUrlProva, type Ambiente } from './prova-pg';
import { ADESSO, conferma, crea, nuovaSerata, tra, uno } from './prova-vendite';
import { rpcDaDb } from './prova-store';
import { operazioniDa } from './operazioni';

const url = leggiUrlProva();
const SALTA = url ? false : 'Test di gara saltati: manca MM_TEST_PG_URL (di solito in .env.test.local, vedi README, sezione "Test di gara")';

const conta = (esiti: string[]) => esiti.reduce<Record<string, number>>((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {});
const insieme = <T>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));

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

test('gara operazioni: lascia il posto premuto 5 volte insieme → una volta sola', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Lascia', email: 'l@esempio.it' });
  const o = operazioniDa(rpcDaDb(db));
  const esiti = await insieme(5, () => o.lasciaPosto(a.id, 'l@esempio.it', ADESSO.toISOString()));
  assert.equal(esiti.filter(Boolean).length, 1);
}));

test('gara operazioni: annulla premuto 5 volte insieme → una sola annullata', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const a = await crea(db, eventoId, lottoId, { cognome: 'Gratis', email: 'g@esempio.it', stato: 'in_lista', importo: 0 });
  const o = operazioniDa(rpcDaDb(db));
  const esiti = await insieme(5, () => o.cambiaStatoIscrizione(a.id, 'annulla', tra(1)));
  assert.deepEqual(conta(esiti), { annullata: 1, ignorata: 4 });
}));

test('gara operazioni: due nominativi cambiati insieme verso la stessa persona → uno solo ci riesce', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId, lottoId } = await nuovaSerata(db, 10);
  const ordini = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
    const c = await crea(db, eventoId, lottoId, { cognome: `Cognome${String.fromCharCode(97 + i)}`, email: `c${i}@esempio.it`, nascita: `199${i}-01-01` });
    await conferma(db, c.id, `pi_n${i}`);
    return c.id;
  }));
  const o = operazioniDa(rpcDaDb(db));
  const esiti = await insieme(6, (i) => o.cambiaNominativo({ id: ordini[i], nome: 'Nuovo', cognome: 'Amico', dataNascita: '2001-01-01', email: null }));
  assert.deepEqual(conta(esiti), { cambiato: 1, doppione: 5 });
  assert.equal((await uno(db, "select count(*)::int as n from public.iscrizioni where chiave_cognome = 'amico' and stato = 'pagato'")).n, 1);
}));

test('gara operazioni: ripristina una vecchia iscrizione mentre la stessa persona si iscrive di nuovo → un solo QR valido', { skip: SALTA }, () => conAmbiente(async (db) => {
  const o = operazioniDa(rpcDaDb(db));
  for (let giro = 0; giro < 6; giro++) {
    const { eventoId, lottoId } = await nuovaSerata(db, 10);
    const vecchia = await crea(db, eventoId, lottoId, { cognome: 'Ritorna', email: 'r@esempio.it', stato: 'in_lista', importo: 0 });
    await o.cambiaStatoIscrizione(vecchia.id, 'annulla', tra(1));
    const [ripristino, nuova] = await Promise.all([
      o.cambiaStatoIscrizione(vecchia.id, 'ripristina', tra(2)),
      crea(db, eventoId, lottoId, { cognome: 'Ritorna', email: 'r2@esempio.it', stato: 'in_lista', importo: 0, adesso: tra(2) }),
    ]);
    const coppia = `${ripristino}+${nuova.esito}`;
    assert.ok(coppia === 'ripristinata+doppione' || coppia === 'doppio+creata', `giro ${giro}: ${coppia}`);
    assert.equal((await uno(db, "select count(*)::int as n from public.iscrizioni where evento_id = $1 and stato in ('in_lista', 'pagato', 'entrato')", [eventoId])).n, 1);
  }
}));
