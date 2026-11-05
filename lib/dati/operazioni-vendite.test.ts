// Le funzioni SQL della tappa 6 (supabase/migrations/20261109000000_operazioni_vendite.sql) nei loro casi singoli, su un Postgres vero in memoria
// (PGlite). Il giro completo con il codice dell'app è in vendite-tabelle.test.ts; le richieste simultanee in schema-operazioni.gara.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { creaDb, MIGRAZIONI_TAVOLI } from './prova-db';
import { ADESSO, conferma, crea, nuovaSerata, q, stato, tra, uno, type Json } from './prova-vendite';
import { rpcDaDb } from './prova-store';
import { operazioniDa } from './operazioni';

async function conDb<T>(prova: (db: PGlite, ev: string, lotto: string) => Promise<T>): Promise<T> {
  const db = await creaDb();
  try {
    const { eventoId, lottoId } = await nuovaSerata(db, 20);
    return await prova(db, eventoId, lottoId);
  } finally {
    await db.close();
  }
}
const ops = (db: PGlite) => operazioniDa(rpcDaDb(db));

test('la migrazione delle operazioni sulle vendite si ferma senza le tappe precedenti, si ripete e le funzioni sono chiuse a chi non è il server', async () => {
  const file = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261109000000_operazioni_vendite.sql'), 'utf8');
  const poche = await creaDb(['20261005000000_archivio_mvp.sql', '20261104000000_schema_anagrafiche.sql']);
  try {
    await assert.rejects(poche.exec(file), /tappe 1, 2 e 3/);
  } finally {
    await poche.close();
  }
  const t3 = await creaDb(MIGRAZIONI_TAVOLI);
  try {
    await t3.exec(file); await t3.exec(file);
    const f = await q(t3, `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth,
      has_function_privilege('service_role', p.oid, 'execute') as srv, p.prosecdef as definer, p.proconfig::text like '%search_path=%' as vuoto
      from pg_proc p where p.proname in ('salva_sessione_iscrizione', 'lascia_posto', 'cambia_stato_iscrizione', 'cambia_nominativo') order by 1`);
    assert.equal(f.length, 4);
    for (const r of f) assert.deepEqual([r.anon, r.auth, r.srv, r.definer, r.vuoto], [false, false, true, true, true], String(r.proname));
  } finally {
    await t3.close();
  }
});

test('salva_sessione_iscrizione e lascia_posto: solo per una prevendita in attesa, solo con l\'email giusta, una volta sola', async () => {
  await conDb(async (db, ev, lotto) => {
    const a = await crea(db, ev, lotto, { cognome: 'Uno', email: 'uno@esempio.it' });
    const o = ops(db);
    assert.equal(await o.salvaSessioneIscrizione(a.id, 'cs_1'), true);
    assert.equal((await uno(db, 'select pagamento_sessione from public.iscrizioni where id = $1', [a.id])).pagamento_sessione, 'cs_1');
    assert.equal(await o.salvaSessioneIscrizione(randomUUID(), 'cs_x'), false, 'iscrizione che non esiste');
    // Gratis (in lista, senza pagamento online): nessuna sessione.
    const g = await crea(db, ev, lotto, { cognome: 'Gratis', email: 'g@esempio.it', stato: 'in_lista', importo: 0 });
    assert.equal(await o.salvaSessioneIscrizione(g.id, 'cs_g'), false);
    assert.equal(await o.lasciaPosto(a.id, 'sbagliata@esempio.it', ADESSO.toISOString()), false);
    assert.equal(await o.lasciaPosto(a.id, ' UNO@esempio.it ', tra(5)), true);
    assert.equal(await o.lasciaPosto(a.id, 'uno@esempio.it', tra(6)), false);
    const riga = await uno(db, 'select stato, annullato_at from public.iscrizioni where id = $1', [a.id]);
    assert.deepEqual([riga.stato, new Date(riga.annullato_at as string).getTime()], ['annullato', Date.parse(tra(5))]);
    assert.equal(await o.salvaSessioneIscrizione(a.id, 'cs_2'), false, 'non più in attesa');
    // Chi ha pagato non lascia il posto da qui.
    const p = await crea(db, ev, lotto, { cognome: 'Pagato', email: 'p@esempio.it' });
    await conferma(db, p.id, 'pi_p');
    assert.equal(await o.lasciaPosto(p.id, 'p@esempio.it', tra(7)), false);
    assert.equal(await stato(db, p.id), 'pagato');
  });
});

test('cambia_stato_iscrizione: annulla, ripristina e tutti i casi in cui non si deve fare', async () => {
  await conDb(async (db, ev, lotto) => {
    const o = ops(db);
    const g = await crea(db, ev, lotto, { cognome: 'Gratis', email: 'g@esempio.it', stato: 'in_lista', importo: 0 });
    const p = await crea(db, ev, lotto, { cognome: 'Pagato', email: 'p@esempio.it' });
    await conferma(db, p.id, 'pi_p');
    const n = await crea(db, ev, lotto, { cognome: 'Nonpagato', email: 'n@esempio.it' });
    const adesso = tra(10);
    assert.equal(await o.cambiaStatoIscrizione(randomUUID(), 'annulla', adesso), 'non_trovata');
    assert.equal(await o.cambiaStatoIscrizione(p.id, 'annulla', adesso), 'pagata', 'una pagata si rimborsa, non si annulla');
    assert.equal(await o.cambiaStatoIscrizione(n.id, 'annulla', adesso), 'ignorata', 'una in attesa non è "attiva"');
    assert.equal(await o.cambiaStatoIscrizione(g.id, 'ripristina', adesso), 'ignorata', 'non è annullata');
    assert.equal(await o.cambiaStatoIscrizione(g.id, 'annulla', adesso), 'annullata');
    assert.equal(await o.cambiaStatoIscrizione(g.id, 'annulla', adesso), 'ignorata');
    // Mentre è annullata, la stessa persona si iscrive di nuovo: non si può ripristinare la vecchia.
    const bis = await crea(db, ev, lotto, { cognome: 'GRATIS', email: 'altra@esempio.it', stato: 'in_lista', importo: 0 });
    assert.equal(bis.esito, 'creata');
    assert.equal(await o.cambiaStatoIscrizione(g.id, 'ripristina', adesso), 'doppio');
    assert.equal(await stato(db, g.id), 'annullato');
    await o.cambiaStatoIscrizione(bis.id, 'annulla', adesso);
    assert.equal(await o.cambiaStatoIscrizione(g.id, 'ripristina', adesso), 'ripristinata');
    const riga = await uno(db, 'select stato, annullato_at from public.iscrizioni where id = $1', [g.id]);
    assert.deepEqual([riga.stato, riga.annullato_at], ['in_lista', null]);
    // Una prevendita lasciata senza pagare (annullata dal cliente) non torna valida; una già entrata torna "entrato"; una pagata torna "pagato".
    await o.lasciaPosto(n.id, 'n@esempio.it', adesso);
    assert.equal(await o.cambiaStatoIscrizione(n.id, 'ripristina', adesso), 'mai_pagata');
    await db.query("update public.iscrizioni set stato = 'annullato' where id = $1", [p.id]);
    assert.equal(await o.cambiaStatoIscrizione(p.id, 'ripristina', adesso), 'ripristinata');
    assert.equal(await stato(db, p.id), 'pagato');
    await db.query("update public.iscrizioni set stato = 'annullato', ora_check_in = now() where id = $1", [p.id]);
    assert.equal(await o.cambiaStatoIscrizione(p.id, 'ripristina', adesso), 'ripristinata');
    assert.equal(await stato(db, p.id), 'entrato');
    await assert.rejects(o.cambiaStatoIscrizione(p.id, 'boh' as never, adesso), /azione_non_valida/);
  });
});

test('cambia_nominativo: il biglietto resta lo stesso, cambia chi lo usa; doppioni e stati non validi si fermano', async () => {
  await conDb(async (db, ev, lotto) => {
    const o = ops(db);
    const a = await crea(db, ev, lotto, { cognome: 'Primo', nome: 'Anna', nascita: '1999-01-01', email: 'a@esempio.it' });
    await conferma(db, a.id, 'pi_a');
    const b = await crea(db, ev, lotto, { cognome: 'Secondo', nome: 'Bruno', nascita: '1998-02-02', email: 'b@esempio.it' });
    await conferma(db, b.id, 'pi_b');
    const prima = await uno(db, 'select token_qr, codice, importo, stato from public.iscrizioni where id = $1', [a.id]);
    assert.equal(await o.cambiaNominativo({ id: randomUUID(), nome: 'X', cognome: 'Y', dataNascita: '1990-01-01', email: null }), 'non_trovata');
    assert.equal(await o.cambiaNominativo({ id: a.id, nome: ' Carla ', cognome: " D'Amico ", dataNascita: '2000-03-03', email: ' Nuova@Esempio.it ' }), 'cambiato');
    const dopo = await uno(db, 'select nome, cognome, chiave_cognome, data_nascita, email, token_qr, codice, importo, stato from public.iscrizioni where id = $1', [a.id]);
    assert.deepEqual([dopo.nome, dopo.cognome, dopo.chiave_cognome, new Date(dopo.data_nascita as string).toISOString().slice(0, 10), dopo.email],
      ['Carla', "D'Amico", 'damico', '2000-03-03', 'nuova@esempio.it']);
    assert.deepEqual([dopo.token_qr, dopo.codice, dopo.importo, dopo.stato], [prima.token_qr, prima.codice, prima.importo, prima.stato]);
    // Senza email l'email resta quella di prima; vuota idem.
    assert.equal(await o.cambiaNominativo({ id: a.id, nome: 'Carla', cognome: 'Rossi', dataNascita: '2000-03-03', email: '' }), 'cambiato');
    assert.equal((await uno(db, 'select email from public.iscrizioni where id = $1', [a.id])).email, 'nuova@esempio.it');
    // Doppione (anche con altre maiuscole e accenti), stato non valido, anonimizzata.
    assert.equal(await o.cambiaNominativo({ id: a.id, nome: 'Bruno', cognome: 'SÉCONDO', dataNascita: '1998-02-02', email: null }), 'doppione');
    assert.equal((await uno(db, 'select cognome from public.iscrizioni where id = $1', [a.id])).cognome, 'Rossi');
    await db.query("update public.iscrizioni set stato = 'entrato', ora_check_in = now() where id = $1", [b.id]);
    assert.equal(await o.cambiaNominativo({ id: b.id, nome: 'X', cognome: 'Y', dataNascita: '1990-01-01', email: null }), 'non_modificabile');
    const c = await crea(db, ev, lotto, { cognome: 'Terzo', email: 'c@esempio.it', stato: 'in_lista', importo: 0 });
    await o.anonimizzaIscrizioni([{ id: c.id, eta: 30 }], tra(1));
    assert.equal(await o.cambiaNominativo({ id: c.id, nome: 'X', cognome: 'Y', dataNascita: '1990-01-01', email: null }), 'non_modificabile');
    // Un'iscrizione in attesa non ha ancora una prevendita valida.
    const d = await crea(db, ev, lotto, { cognome: 'Quarto', email: 'd@esempio.it' });
    assert.equal(await o.cambiaNominativo({ id: d.id, nome: 'X', cognome: 'Y', dataNascita: '1990-01-01', email: null }), 'non_modificabile');
  });
});

test('le operazioni del codice (operazioni.ts) restituiscono forme stabili anche per gli esiti negativi', async () => {
  await conDb(async (db, ev, lotto) => {
    const o = ops(db);
    const id = randomUUID();
    const dati = { id, eventoId: ev, lottoId: lotto, prId: null, nome: 'Anna', cognome: 'Prova', dataNascita: '2000-01-01', email: 'anna@esempio.it', tokenQr: 'MM1.x', codice: 'ABCD1234', stato: 'in_attesa' as const,
      importo: 10, categoria: null, canale: 'diretto', consensoMarketing: false, scade: tra(30), pagamentoOnline: true, adesso: ADESSO.toISOString() };
    assert.deepEqual(await o.creaIscrizione(dati), { esito: 'creata', id });
    const stessa = await o.creaIscrizione({ ...dati, id: randomUUID(), tokenQr: 'MM1.y', codice: 'EFGH5678' });
    assert.deepEqual(stessa, { esito: 'ripresa', id });
    assert.deepEqual(await o.creaIscrizione({ ...dati, id: randomUUID(), tokenQr: 'MM1.z', codice: 'IJKL9012', email: 'altra@esempio.it' }), { esito: 'sospesa_altra_email' });
    await conferma(db, id, 'pi_s');
    assert.deepEqual(await o.creaIscrizione({ ...dati, id: randomUUID(), tokenQr: 'MM1.w', codice: 'MNOP3456' }), { esito: 'doppione', email: 'anna@esempio.it' });
    assert.deepEqual(await o.confermaPagamentoIscrizione({ id, pagamento: 'pi_s', centesimi: 1000, valuta: 'eur', importoOk: true, serataChiusa: false, adesso: ADESSO.toISOString() }), { esito: 'gia' });
    assert.deepEqual(await o.confermaPagamentoIscrizione({ id: randomUUID(), pagamento: 'pi_q', centesimi: 1000, valuta: 'eur', importoOk: true, serataChiusa: false, adesso: ADESSO.toISOString() }), { esito: 'sconosciuta' });
    assert.deepEqual(await o.confermaPagamentoIscrizione({ id, pagamento: 'pi_r', centesimi: 1000, valuta: 'EUR', importoOk: true, serataChiusa: false, adesso: ADESSO.toISOString() }),
      { esito: 'da_rimborsare', motivo: 'secondo_pagamento', principale: false, centesimi: 1000 });
    assert.deepEqual(await o.concludiRimborso({ pagamento: 'pi_non_esiste', da: 'x', adesso: ADESSO.toISOString() }), { esito: 'sconosciuto', chiusaOrdine: false, iscrizioneId: null, prenotazioneId: null });
    assert.equal(await o.scadenzeIscrizioni(tra(500)), 0);
    assert.equal(await o.anonimizzaIscrizioni([], tra(500)), 0);
    void ({} as Json);
  });
});
