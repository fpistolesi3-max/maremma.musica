// Migrazione delle vendite (supabase/migrations/20261105000000_schema_vendite.sql) provata su un Postgres vero in memoria:
// copia dalla riga unica, vincoli e ogni funzione nei suoi casi singoli. Le richieste davvero simultanee si provano a parte
// (schema-vendite.gara.test.ts), perché PGlite ha una sola connessione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { creaDb, scriviRiga, MIGRAZIONI_VENDITE } from './prova-db';
import { datiIniziali } from './seed';
import { chiaveCognome } from '../regole';
import {
  ADESSO, avviaRimborso, concludiRimborso, conferma, crea, importa, istante, pagamenti, q, segnaIngresso, stato, tra, uno, usaCodice, usaToken, verifica, type Json,
} from './prova-vendite';
import type { Archivio } from './tipi';

const SEGRETO = 'segreto-di-prova-che-non-deve-mai-comparire';

function archivio(): Archivio {
  return datiIniziali(SEGRETO, new Date('2026-10-20T10:00:00+02:00'));
}

async function conDb<T>(prova: (db: PGlite, d: Archivio) => Promise<T>, preparazione?: (d: Archivio) => void): Promise<T> {
  const db = await creaDb(MIGRAZIONI_VENDITE);
  try {
    const d = archivio();
    preparazione?.(d);
    await scriviRiga(db, d);
    return await prova(db, d);
  } finally {
    await db.close();
  }
}

/** Una serata e un tipo di prevendita da usare nei test, con i posti indicati. */
async function serata(db: PGlite, d: Archivio, posti: number | null) {
  const evento = d.eventi[0];
  const lotto = d.lotti.find((l) => l.eventoId === evento.id)!;
  await importa(db);
  await db.query('delete from public.pagamenti where true'); await db.query('delete from public.iscrizioni where true');
  await db.query('update public.lotti set quantita = $1 where id = $2', [posti, lotto.id]);
  return { eventoId: evento.id, lottoId: lotto.id };
}

test('le tabelle e le funzioni nuove sono chiuse a chiunque non sia il server', async () => {
  const db = await creaDb(MIGRAZIONI_VENDITE);
  try {
    for (const t of ['iscrizioni', 'pagamenti', 'accessi']) {
      const r = await uno(db, `select c.relrowsecurity as rls, has_table_privilege('anon', c.oid, 'select') as anon, has_table_privilege('authenticated', c.oid, 'select') as auth,
        has_table_privilege('service_role', c.oid, 'insert') as srv, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::text as policy
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = $1`, [t]);
      assert.deepEqual(r, { rls: true, anon: false, auth: false, srv: true, policy: '0' }, t);
    }
    const funzioni = await q(db, `select p.oid::regprocedure::text as f, has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as srv
      from pg_proc p where p.pronamespace = 'public'::regnamespace`);
    assert.ok(funzioni.length >= 14, 'le funzioni ci sono tutte');
    for (const f of funzioni) assert.deepEqual([f.anon, f.auth, f.srv], [false, false, true], String(f.f));
    // Tutte le funzioni che scrivono hanno il percorso di ricerca vuoto e girano come il proprietario.
    // (chiave_cognome e tiene_posto sono calcoli puri, non leggono tabelle: non servono i diritti del proprietario.)
    const aperte = await q(db, `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname not in ('chiave_cognome', 'tiene_posto')
      and (not prosecdef or proconfig is null or not (proconfig::text like '%search_path=%'))`);
    assert.deepEqual(aperte, []);
    const pure = await q(db, `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('chiave_cognome', 'tiene_posto')
      and (proconfig is null or not (proconfig::text like '%search_path=%'))`);
    assert.deepEqual(pure, []);
  } finally {
    await db.close();
  }
});

test('la chiave "stessa persona" del database è uguale a quella del codice', async () => {
  const db = await creaDb(MIGRAZIONI_VENDITE);
  try {
    const nomi = ["D'Àngelo ", 'd’angelo', 'Müller', 'MULLER', 'Nuñez', 'Núñez', 'De Rossi', 'derossi', 'Pucci-Bianchi', 'Çelik', 'Łukasz', 'Øverli', 'Straße', 'O\'Brien', '', '   ', '123', 'Niccolò',
      'Ñandú', 'Ångström', 'ÉMILE', 'İstanbul', 'ǅ', 'Dž'];
    for (const n of nomi) assert.equal((await uno(db, 'select public.chiave_cognome($1) as k', [n])).k, chiaveCognome(n), JSON.stringify(n));
  } finally {
    await db.close();
  }
});

test('la copia con iscrizioni e pagamenti dà gli stessi numeri e gli stessi valori', async () => {
  await conDb(async (db, d) => {
    const esito = await importa(db);
    assert.deepEqual(esito, { eventi: 4, lotti: d.lotti.length, pr: d.pr.length, utenti: d.utenti.length, porte: 0, iscrizioni: d.iscrizioni.length, pagamenti: d.iscrizioni.length, accessi: 0, versione: 1 });

    const righe = await q(db, 'select * from public.iscrizioni');
    assert.equal(righe.length, d.iscrizioni.length);
    for (const i of d.iscrizioni) {
      const r = righe.find((x) => x.id === i.id)!;
      assert.deepEqual(
        { eventoId: r.evento_id, lottoId: r.lotto_id, prId: r.pr_id, nome: r.nome, cognome: r.cognome, chiave: r.chiave_cognome, nascita: r.data_nascita && new Date(r.data_nascita as string).toISOString().slice(0, 10),
          email: r.email, token: r.token_qr, codice: r.codice, stato: r.stato, metodo: r.metodo_pagamento, importo: Number(r.importo), pagatoAt: istante(r.pagato_at), scade: r.scade,
          oraCheckIn: r.ora_check_in, porta: r.porta, rifiuto: r.rifiuto_ingresso, categoria: r.categoria, canale: r.canale, privacy: istante(r.consenso_privacy_at),
          marketing: r.consenso_marketing, annullatoAt: r.annullato_at, creata: istante(r.created_at), online: r.pagamento_online, sessione: r.pagamento_sessione, anon: r.anonimizzata },
        { eventoId: i.eventoId, lottoId: i.lottoId, prId: i.prId, nome: i.nome, cognome: i.cognome, chiave: chiaveCognome(i.cognome), nascita: i.dataNascita,
          email: i.email, token: i.tokenQr, codice: i.codice, stato: i.stato, metodo: i.metodoPagamento, importo: i.importo, pagatoAt: istante(i.pagatoAt), scade: null,
          oraCheckIn: null, porta: null, rifiuto: null, categoria: i.categoria, canale: i.canale, privacy: istante(i.consensoPrivacyAt),
          marketing: i.consensoMarketing, annullatoAt: null, creata: istante(i.createdAt), online: true, sessione: null, anon: false },
        i.cognome);
      const p = await uno(db, "select * from public.pagamenti where iscrizione_id = $1 and ruolo = 'principale'", [i.id]);
      assert.equal(p.id, i.pagamentoOnline!.pagamento);
      assert.equal(p.centesimi, Math.round(i.importo * 100));
      assert.equal(p.valuta, 'eur');
      assert.equal(p.da_rimborsare, false);
    }
    const v = await verifica(db);
    assert.equal(v.ok, true, v.differenze.join(' | '));
    for (const g of ['iscrizioni', 'pagamenti', 'accessi']) assert.equal(v.conteggi[g].riga, v.conteggi[g].tabella, g);
    // Rilanciabile.
    assert.deepEqual(await importa(db), esito);
    assert.equal((await verifica(db)).ok, true);
  });
});

test('la copia porta pagamenti in più, rimborsi, iscrizioni anonime, "non rientra", prevendite in attesa e accessi', async () => {
  const dati = archivio();
  const [a, b, c, e, f] = dati.iscrizioni;
  const utente = dati.utenti[0];
  Object.assign(a, { pagamentoOnline: { sessione: 'cs_1', pagamento: 'pi_A', daRimborsare: false,
    inPiu: [{ pagamento: 'pi_A2', centesimi: 1000, valuta: 'EUR', motivo: 'secondo_pagamento', at: '2026-10-29T10:00:00.000Z',
      rimborso: { stato: 'fatto', chiave: 'mm-rimborso-1', avviatoAt: '2026-10-29T11:00:00.000Z', fattoAt: '2026-10-29T11:00:05.000Z', da: 'admin@esempio.it' } },
    { pagamento: 'pi_A3', centesimi: 500, valuta: 'eur', motivo: 'importo', at: '2026-10-29T10:30:00.000Z' }] } });
  Object.assign(b, { stato: 'rimborsato', annullatoAt: '2026-10-29T12:00:00.000Z', pagamentoOnline: { sessione: null, pagamento: 'pi_B', daRimborsare: false, motivo: 'lotto_pieno',
    rimborso: { stato: 'fatto', chiave: 'mm-rimborso-2', avviatoAt: '2026-10-29T12:00:00.000Z', fattoAt: '2026-10-29T12:00:03.000Z', da: 'admin@esempio.it' } } });
  Object.assign(c, { pagamentoOnline: { sessione: null, pagamento: 'pi_C', daRimborsare: true, motivo: 'doppione',
    rimborso: { stato: 'in_corso', chiave: 'mm-rimborso-3', avviatoAt: '2026-10-29T13:00:00.000Z', fattoAt: null, da: 'admin@esempio.it' } } });
  Object.assign(e, { nome: '', cognome: '', dataNascita: '', email: '', anonimizzata: true, anonimizzataAt: '2026-10-29T14:00:00.000Z', etaAllaSerata: 23 });
  Object.assign(f, { stato: 'in_attesa', metodoPagamento: null, pagatoAt: null, scade: '2026-10-29T15:00:00.000Z', rifiutoIngresso: { ora: '2026-10-31T23:00:00.000Z', porta: 'P1', da: 'staff@esempio.it' },
    pagamentoOnline: { sessione: 'cs_f', pagamento: null, daRimborsare: false } });
  dati.accessi.push(
    { id: randomUUID(), utenteId: utente.id, tokenHash: 'h1', codiceHash: 'c1', scade: '2026-10-29T16:00:00.000Z', usato: false, tentativi: 2 },
    { id: randomUUID(), utenteId: randomUUID(), tokenHash: 'h2', codiceHash: 'c2', scade: '2026-10-29T16:00:00.000Z', usato: true, tentativi: 0 }); // utente che non esiste più
  await conDb(async (db) => {
    const esito = await importa(db);
    assert.equal(esito.accessi, 1, 'l\'accesso di un utente sparito non si porta');
    assert.equal(esito.pagamenti, dati.iscrizioni.length - 1 + 2, 'una iscrizione senza pagamento, due pagamenti in più');
    const inPiu = await q(db, "select * from public.pagamenti where ruolo = 'in_piu' order by id");
    assert.deepEqual(inPiu.map((p) => [p.id, p.centesimi, p.valuta, p.motivo, p.da_rimborsare, p.rimborso_stato]), [
      ['pi_A2', 1000, 'eur', 'secondo_pagamento', false, 'fatto'], ['pi_A3', 500, 'eur', 'importo', true, null]]);
    const pb = await uno(db, "select * from public.pagamenti where id = 'pi_B'");
    assert.deepEqual([pb.motivo, pb.rimborso_stato, pb.rimborso_chiave, pb.rimborso_da], ['lotto_pieno', 'fatto', 'mm-rimborso-2', 'admin@esempio.it']);
    const pc = await uno(db, "select * from public.pagamenti where id = 'pi_C'");
    assert.deepEqual([pc.da_rimborsare, pc.rimborso_stato, pc.rimborso_fatto_at], [true, 'in_corso', null]);
    const anon = await uno(db, 'select * from public.iscrizioni where id = $1', [e.id]);
    assert.deepEqual([anon.nome, anon.cognome, anon.chiave_cognome, anon.data_nascita, anon.email, anon.anonimizzata, anon.eta_alla_serata], [null, null, null, null, null, true, 23]);
    const att = await uno(db, 'select * from public.iscrizioni where id = $1', [f.id]);
    assert.deepEqual([att.stato, istante(att.scade), att.rifiuto_ingresso, att.pagamento_online, att.pagamento_sessione], ['in_attesa', Date.parse('2026-10-29T15:00:00.000Z'), { ora: '2026-10-31T23:00:00.000Z', porta: 'P1', da: 'staff@esempio.it' }, true, 'cs_f']);
    assert.equal((await q(db, 'select 1 from public.pagamenti where iscrizione_id = $1', [f.id])).length, 0);
    const v = await verifica(db);
    assert.equal(v.ok, true, v.differenze.join(' | '));
  }, (d) => { Object.assign(d, dati); });
});

test('la copia si ferma, senza copiare niente, davanti a ciò che le tabelle non portano', async () => {
  const casi: [string, (d: Archivio) => void, RegExp][] = [
    ['ingresso in cassa', (d) => { (d.iscrizioni[0] as unknown as Json).origine = 'cassa'; }, /cassa_e_consegne_non_supportate/],
    ['consegne', (d) => { d.consegne.push({ id: randomUUID() } as never); }, /cassa_e_consegne_non_supportate/],
    ['tavoli', (d) => { d.tavoli.push({ id: randomUUID() } as never); }, /tavoli_non_ancora_supportati/],
    ['prenotazioni', (d) => { d.prenotazioni.push({ id: randomUUID() } as never); }, /tavoli_non_ancora_supportati/],
    ['pagamento doppio', (d) => { d.iscrizioni[1].pagamentoOnline!.pagamento = d.iscrizioni[0].pagamentoOnline!.pagamento; }, /pagamenti_pkey/],
    ['doppione di persona', (d) => { Object.assign(d.iscrizioni[1], { cognome: d.iscrizioni[0].cognome, dataNascita: d.iscrizioni[0].dataNascita }); }, /iscrizioni_unica_persona/],
    ['QR doppio', (d) => { d.iscrizioni[1].tokenQr = d.iscrizioni[0].tokenQr; }, /iscrizioni_token_qr_key/],
  ];
  for (const [nome, guasto, atteso] of casi) {
    await conDb(async (db) => {
      await assert.rejects(importa(db), atteso, nome);
      assert.equal((await q(db, 'select 1 from public.iscrizioni')).length, 0, `${nome}: niente a metà`);
      assert.equal((await q(db, 'select 1 from public.eventi')).length, 0, `${nome}: niente a metà`);
    }, guasto);
  }
});

test('i vincoli di iscrizioni, pagamenti e accessi tengono', async () => {
  await conDb(async (db, d) => {
    await importa(db);
    const i0 = d.iscrizioni[0];
    const fallisce = async (sql: string, p: unknown[] = [], codice?: string) =>
      assert.rejects(db.query(sql, p), (e: { code?: string }) => !codice || e.code === codice, sql);
    // Una persona, un QR (anche scritto con accenti o maiuscole diverse).
    await fallisce(`insert into public.iscrizioni (id, evento_id, nome, cognome, chiave_cognome, data_nascita, email, token_qr, codice, stato, consenso_privacy_at)
      values (gen_random_uuid(), $1, 'X', 'Y', public.chiave_cognome($2), $3, 'x@esempio.it', 't', 'c', 'pagato', now())`, [i0.eventoId, i0.cognome.toUpperCase(), i0.dataNascita], '23505');
    // In attesa senza termine; dati personali a metà; email non valida; canale non valido; importo negativo; stato sconosciuto.
    await fallisce("update public.iscrizioni set stato = 'in_attesa', scade = null where id = $1", [i0.id], '23514');
    await fallisce('update public.iscrizioni set email = null where id = $1', [i0.id], '23514');
    await fallisce("update public.iscrizioni set email = 'non-una-email' where id = $1", [i0.id], '23514');
    await fallisce("update public.iscrizioni set anonimizzata = true where id = $1", [i0.id], '23514');
    await fallisce("update public.iscrizioni set canale = 'Con Spazi' where id = $1", [i0.id], '23514');
    await fallisce('update public.iscrizioni set importo = -1 where id = $1', [i0.id], '23514');
    await fallisce("update public.iscrizioni set stato = 'boh' where id = $1", [i0.id], '23514');
    await fallisce("update public.iscrizioni set metodo_pagamento = 'porta_contanti' where id = $1", [i0.id], '23514');
    // Una serata con iscrizioni non si cancella.
    await fallisce('delete from public.eventi where id = $1', [i0.eventoId], '23001');
    // Pagamenti: un solo principale per iscrizione; né iscrizione né prenotazione; rimborso incoerente; stesso id due volte.
    await fallisce("insert into public.pagamenti (id, iscrizione_id, ruolo, centesimi) values ('altro', $1, 'principale', 1000)", [i0.id], '23505');
    await fallisce("insert into public.pagamenti (id, ruolo, centesimi) values ('senza_ordine', 'in_piu', 1000)", [], '23514');
    await fallisce("insert into public.pagamenti (id, iscrizione_id, ruolo, centesimi) values ($1, $2, 'in_piu', 1000)", [i0.pagamentoOnline!.pagamento, i0.id], '23505');
    await fallisce("update public.pagamenti set rimborso_stato = 'fatto' where id = $1", [i0.pagamentoOnline!.pagamento], '23514');
    await fallisce("update public.pagamenti set motivo = 'boh' where id = $1", [i0.pagamentoOnline!.pagamento], '23514');
    // Accessi: l'utente deve esistere; il token è unico.
    await fallisce("insert into public.accessi (id, utente_id, token_hash, codice_hash, scade) values (gen_random_uuid(), gen_random_uuid(), 'a', 'b', now())", [], '23503');
    await db.query("insert into public.accessi (id, utente_id, token_hash, codice_hash, scade) values (gen_random_uuid(), $1, 'a', 'b', now())", [d.utenti[0].id]);
    await fallisce("insert into public.accessi (id, utente_id, token_hash, codice_hash, scade) values (gen_random_uuid(), $1, 'a', 'b', now())", [d.utenti[0].id], '23505');
    // Cancellare l'utente porta via i suoi accessi.
    await db.query('delete from public.accessi where true');
  });
});

test('crea_iscrizione: i posti del tipo, la persona già in lista, la richiesta ripresa', async () => {
  await conDb(async (db, d) => {
    const { eventoId, lottoId } = await serata(db, d, 2);
    const a = await crea(db, eventoId, lottoId, { cognome: 'Primo', email: 'primo@esempio.it' });
    assert.equal(a.esito, 'creata');
    assert.equal(await stato(db, a.id), 'in_attesa');
    // Stessa persona, stessa email, ancora in attesa: riprende la stessa iscrizione (e lo stesso posto).
    const ripresa = await crea(db, eventoId, lottoId, { cognome: 'PRIMO', email: 'Primo@Esempio.it' });
    assert.deepEqual([ripresa.esito, ripresa.id === a.id], ['ripresa', true], 'restituisce la richiesta già aperta');
    assert.equal((await uno(db, 'select count(*)::int as n from public.iscrizioni')).n, 1);
    // Stessa persona con un'altra email: aspetta che scada o paghi.
    assert.equal((await crea(db, eventoId, lottoId, { cognome: 'Primo', email: 'altra@esempio.it' })).esito, 'sospesa_altra_email');
    // Un secondo posto, poi il tipo è pieno.
    assert.equal((await crea(db, eventoId, lottoId, { cognome: 'Secondo', email: 's@esempio.it' })).esito, 'creata');
    assert.equal((await crea(db, eventoId, lottoId, { cognome: 'Terzo', email: 't@esempio.it' })).esito, 'lotto_pieno');
    // Chi non ha pagato in tempo lascia il posto (anche senza che qualcuno l'abbia segnata "scaduta").
    const dopo = tra(31);
    assert.equal((await crea(db, eventoId, lottoId, { cognome: 'Terzo', email: 't@esempio.it', adesso: dopo, scade: tra(61) })).esito, 'creata');
    // Gratis: nasce valida subito e tiene il posto.
    await db.query("update public.lotti set quantita = 4 where id = $1", [lottoId]);
    const g = await crea(db, eventoId, lottoId, { cognome: 'Gratis', email: 'g@esempio.it', stato: 'in_lista', importo: 0, adesso: dopo });
    assert.equal(g.esito, 'creata');
    assert.equal(await stato(db, g.id), 'in_lista');
    // Già in lista (valida): niente secondo QR, con l'email di quella esistente.
    const doppio = await crea(db, eventoId, lottoId, { cognome: 'GRATIS', email: 'nuova@esempio.it', stato: 'in_lista', importo: 0, adesso: dopo });
    assert.deepEqual([doppio.esito, doppio.email], ['doppione', 'g@esempio.it']);
    // Senza tipo non c'è limite; il tipo che non esiste è un errore.
    assert.equal((await crea(db, eventoId, null, { cognome: 'Libero', email: 'l@esempio.it', stato: 'in_lista', importo: 0 })).esito, 'creata');
    await assert.rejects(crea(db, eventoId, randomUUID(), { cognome: 'Altro' }), /lotto_non_trovato/);
    await assert.rejects(crea(db, eventoId, lottoId, { cognome: 'Stato', stato: 'pagato' }), /stato_non_valido/);
    // Nome e cognome con spazi attorno e l'email in minuscolo.
    const r = await uno(db, "select nome, cognome, email, chiave_cognome from public.iscrizioni where id = $1", [g.id]);
    assert.deepEqual(r, { nome: 'Anna', cognome: 'Gratis', email: 'g@esempio.it', chiave_cognome: 'gratis' });
  });
});

test('conferma_pagamento_iscrizione: conferma, ripetizione, secondo pagamento, importo, ordine chiuso, serata chiusa', async () => {
  await conDb(async (db, d) => {
    const { eventoId, lottoId } = await serata(db, d, 10);
    const a = await crea(db, eventoId, lottoId, { cognome: 'Uno', email: 'uno@esempio.it' });
    assert.deepEqual(await conferma(db, a.id, 'pi_1'), { esito: 'confermata' });
    const riga = await uno(db, 'select stato, scade, metodo_pagamento, pagamento_online, pagato_at from public.iscrizioni where id = $1', [a.id]);
    assert.deepEqual([riga.stato, riga.scade, riga.metodo_pagamento, riga.pagamento_online, istante(riga.pagato_at)], ['pagato', null, 'online', true, ADESSO.getTime()]);
    // Lo stesso pagamento ripetuto (webhook, ritorno del cliente, controllo giornaliero): niente di nuovo.
    for (let n = 0; n < 3; n++) assert.deepEqual(await conferma(db, a.id, 'pi_1'), { esito: 'gia' });
    assert.equal((await pagamenti(db, a.id)).length, 1);
    // Un altro pagamento sullo stesso ordine non sovrascrive quello vero: va restituito.
    assert.deepEqual(await conferma(db, a.id, 'pi_1b'), { esito: 'da_rimborsare', motivo: 'secondo_pagamento', principale: false, centesimi: 1000 });
    // Importo o valuta sbagliati: non conferma niente.
    const b = await crea(db, eventoId, lottoId, { cognome: 'Due', email: 'due@esempio.it' });
    assert.deepEqual(await conferma(db, b.id, 'pi_2', { importoOk: false, centesimi: 900 }), { esito: 'da_rimborsare', motivo: 'importo', principale: false, centesimi: 900 });
    assert.equal(await stato(db, b.id), 'in_attesa');
    // ...e il pagamento giusto arriva dopo: ora conferma.
    assert.deepEqual(await conferma(db, b.id, 'pi_2b'), { esito: 'confermata' });
    // Ordine che non esiste.
    assert.deepEqual(await conferma(db, randomUUID(), 'pi_x'), { esito: 'sconosciuta' });
    // Ordine annullato (il cliente ha lasciato il posto): il pagamento arriva lo stesso, si restituisce.
    const c = await crea(db, eventoId, lottoId, { cognome: 'Tre', email: 'tre@esempio.it' });
    await db.query("update public.iscrizioni set stato = 'annullato', annullato_at = now() where id = $1", [c.id]);
    assert.deepEqual(await conferma(db, c.id, 'pi_3'), { esito: 'da_rimborsare', motivo: 'ordine_chiuso', principale: true, centesimi: 1000 });
    assert.equal(await stato(db, c.id), 'annullato');
    assert.deepEqual((await pagamenti(db, c.id)).map((p) => [p.ruolo, p.motivo, p.da_rimborsare]), [['principale', 'ordine_chiuso', true]]);
    // Orario limite passato (lo decide il codice): si restituisce.
    const e = await crea(db, eventoId, lottoId, { cognome: 'Quattro', email: 'quattro@esempio.it' });
    assert.deepEqual(await conferma(db, e.id, 'pi_4', { chiusa: true }), { esito: 'da_rimborsare', motivo: 'serata_iniziata', principale: true, centesimi: 1000 });
    // Pagamento in ritardo su una prevendita scaduta: vale lo stesso se il posto c'è.
    const f = await crea(db, eventoId, lottoId, { cognome: 'Cinque', email: 'cinque@esempio.it' });
    await db.query("update public.iscrizioni set stato = 'scaduta' where id = $1", [f.id]);
    assert.deepEqual(await conferma(db, f.id, 'pi_5', { adesso: tra(90) }), { esito: 'confermata' });
    // I centesimi e la valuta si salvano come arrivano (valuta in minuscolo).
    assert.deepEqual((await pagamenti(db, f.id)).map((p) => [p.centesimi]), [[1000]]);
    const v = await uno(db, "select valuta from public.pagamenti where id = 'pi_5'"); assert.equal(v.valuta, 'eur');
  });
});

test('conferma_pagamento_iscrizione: tipo pieno e persona già in lista', async () => {
  await conDb(async (db, d) => {
    const { eventoId, lottoId } = await serata(db, d, 1);
    // Due prevendite della stessa serata, le prime due scadute: tengono il posto solo se pagano.
    const a = await crea(db, eventoId, lottoId, { cognome: 'Uno', email: 'uno@esempio.it' });
    const dopo = tra(40);
    const b = await crea(db, eventoId, lottoId, { cognome: 'Due', email: 'due@esempio.it', adesso: dopo, scade: tra(70) });
    assert.equal(b.esito, 'creata', 'il posto di A era scaduto');
    // A paga in ritardo ma il posto ora lo tiene B (in attesa e nel termine): A va restituito.
    assert.deepEqual(await conferma(db, a.id, 'pi_a', { adesso: dopo }), { esito: 'da_rimborsare', motivo: 'lotto_pieno', principale: true, centesimi: 1000 });
    // B paga: il posto è suo.
    assert.deepEqual(await conferma(db, b.id, 'pi_b', { adesso: dopo }), { esito: 'confermata' });

    // Persona già in lista: la seconda richiesta (scaduta nel frattempo, stessa persona) paga lo stesso ma va restituita.
    await db.query("update public.lotti set quantita = null where id = $1", [lottoId]);
    const c = await crea(db, eventoId, lottoId, { cognome: 'Tre', email: 'tre@esempio.it' });
    const dopo2 = tra(100);
    const c2 = await crea(db, eventoId, lottoId, { cognome: 'Tre', email: 'tre@esempio.it', adesso: dopo2, scade: tra(130) });
    assert.equal(c2.esito, 'creata');
    assert.deepEqual(await conferma(db, c2.id, 'pi_c2', { adesso: dopo2 }), { esito: 'confermata' });
    assert.deepEqual(await conferma(db, c.id, 'pi_c', { adesso: dopo2 }), { esito: 'da_rimborsare', motivo: 'doppione', principale: true, centesimi: 1000 });
    assert.equal((await uno(db, "select count(*)::int as n from public.iscrizioni where chiave_cognome = 'tre' and stato = 'pagato'")).n, 1);
  });
});

test('rimborso in due fasi: un clic solo, chiave riusata, ordine chiuso una volta', async () => {
  await conDb(async (db, d) => {
    const { eventoId, lottoId } = await serata(db, d, 10);
    const a = await crea(db, eventoId, lottoId, { cognome: 'Uno', email: 'uno@esempio.it' });
    await conferma(db, a.id, 'pi_1');
    await conferma(db, a.id, 'pi_1b'); // pagamento in più
    const avvia = (p: string, chiave: string, adesso: Date) => avviaRimborso(db, p, chiave, adesso);

    assert.deepEqual(await avvia('boh', 'k', ADESSO), { esito: 'sconosciuto' });
    const primo = await avvia('pi_1', 'chiave-1', ADESSO);
    assert.deepEqual(primo, { esito: 'avviato', chiave: 'chiave-1', centesimi: 1000, principale: true });
    // Secondo clic dopo pochi secondi: rifiutato. Dopo 30 secondi (errore di rete incerto): ricomincia con la stessa chiave.
    assert.deepEqual(await avvia('pi_1', 'chiave-2', new Date(ADESSO.getTime() + 10_000)), { esito: 'in_corso' });
    assert.deepEqual(await avvia('pi_1', 'chiave-3', new Date(ADESSO.getTime() + 31_000)), { esito: 'avviato', chiave: 'chiave-1', centesimi: 1000, principale: true });
    // Stripe rifiuta: si ricomincia con una chiave nuova.
    assert.equal((await uno(db, "select public.rimborso_respinto('pi_1') as r")).r, true);
    assert.equal((await uno(db, "select public.rimborso_respinto('pi_1') as r")).r, false);
    assert.deepEqual(await avvia('pi_1', 'chiave-4', ADESSO), { esito: 'avviato', chiave: 'chiave-4', centesimi: 1000, principale: true });

    const concludi = (p: string, adesso = tra(5)) => concludiRimborso(db, p, adesso);
    assert.deepEqual(await concludi('boh'), { esito: 'sconosciuto' });
    const fatto = await concludi('pi_1');
    assert.deepEqual([fatto.esito, fatto.chiusa_ordine], ['chiuso', true]);
    const r = await uno(db, 'select stato, annullato_at from public.iscrizioni where id = $1', [a.id]);
    assert.deepEqual([r.stato, istante(r.annullato_at)], ['rimborsato', Date.parse(tra(5))]);
    // Ripetuto: niente da fare; e non si può riavviare.
    assert.deepEqual(await concludi('pi_1'), { esito: 'gia' });
    assert.deepEqual(await avvia('pi_1', 'chiave-5', ADESSO), { esito: 'gia' });
    const p = await uno(db, "select rimborso_stato, rimborso_chiave, rimborso_da, da_rimborsare from public.pagamenti where id = 'pi_1'");
    assert.deepEqual(p, { rimborso_stato: 'fatto', rimborso_chiave: 'chiave-4', rimborso_da: 'admin@esempio.it', da_rimborsare: false });

    // Un pagamento "in più" si rimborsa senza toccare l'ordine; fatto dalla dashboard di Stripe (senza fase 1) prende una chiave propria.
    const b = await crea(db, eventoId, lottoId, { cognome: 'Due', email: 'due@esempio.it' });
    await conferma(db, b.id, 'pi_2'); await conferma(db, b.id, 'pi_2b');
    const esterno = await concludi('pi_2b');
    assert.deepEqual([esterno.esito, esterno.chiusa_ordine], ['chiuso', false]);
    assert.equal(await stato(db, b.id), 'pagato');
    const pe = await uno(db, "select rimborso_stato, rimborso_chiave, da_rimborsare from public.pagamenti where id = 'pi_2b'");
    assert.equal(pe.rimborso_stato, 'fatto'); assert.match(String(pe.rimborso_chiave), /^mm-rimborso-/); assert.equal(pe.da_rimborsare, false);
    // Rimborso del principale dalla dashboard di Stripe: chiude l'ordine.
    assert.equal((await concludi('pi_2')).chiusa_ordine, true);
    assert.equal(await stato(db, b.id), 'rimborsato');
  });
});

test('segna_ingresso: il primo passaggio vince, gli altri trovano l\'ora del primo', async () => {
  await conDb(async (db, d) => {
    const { eventoId, lottoId } = await serata(db, d, 10);
    const a = await crea(db, eventoId, lottoId, { cognome: 'Uno', email: 'uno@esempio.it' });
    const entra = (id: string, ora: string, porta: string, evento = eventoId) => segnaIngresso(db, id, evento, ora, porta);
    // Ancora in attesa: non entra.
    assert.deepEqual(await entra(a.id, tra(10), 'P1'), { esito: 'non_valida', stato: 'in_attesa' });
    await conferma(db, a.id, 'pi_1');
    const uno_ = await entra(a.id, tra(10), 'P1');
    assert.deepEqual([uno_.esito, istante(uno_.ora_check_in), uno_.porta], ['entrato', Date.parse(tra(10)), 'P1']);
    const due = await entra(a.id, tra(11), 'P2');
    assert.deepEqual([due.esito, istante(due.ora_check_in), due.porta], ['gia_entrato', Date.parse(tra(10)), 'P1']);
    assert.equal(await stato(db, a.id), 'entrato');
    // Un'altra serata, un QR che non esiste, una prevendita rimborsata.
    assert.equal((await entra(a.id, tra(12), 'P1', d.eventi[1].id)).esito, 'sconosciuta');
    assert.equal((await entra(randomUUID(), tra(12), 'P1')).esito, 'sconosciuta');
    const b = await crea(db, eventoId, lottoId, { cognome: 'Due', email: 'due@esempio.it' });
    await conferma(db, b.id, 'pi_2');
    await db.query("update public.iscrizioni set stato = 'rimborsato' where id = $1", [b.id]);
    assert.deepEqual(await entra(b.id, tra(12), 'P1'), { esito: 'non_valida', stato: 'rimborsato' });
    // Gratis (in lista) entra come le altre.
    const g = await crea(db, eventoId, lottoId, { cognome: 'Gratis', email: 'g@esempio.it', stato: 'in_lista', importo: 0 });
    assert.equal((await entra(g.id, tra(13), 'P1')).esito, 'entrato');
  });
});

test('accessi: il link vale una volta, il codice ha cinque tentativi', async () => {
  await conDb(async (db, d) => {
    await importa(db);
    const u = d.utenti[0].id;
    const nuovo = (token: string, codice: string, scade = tra(60)) =>
      db.query('insert into public.accessi (id, utente_id, token_hash, codice_hash, scade) values (gen_random_uuid(), $1, $2, $3, $4)', [u, token, codice, scade]);
    const token = (t: string) => usaToken(db, t);
    const codice = (c: string) => usaCodice(db, u, c);

    await nuovo('t1', 'c1');
    assert.equal(await token('sbagliato'), null);
    assert.equal(await token('t1'), u);
    assert.equal(await token('t1'), null, 'il link non vale due volte');
    await nuovo('t2', 'c2', tra(-1));
    assert.equal(await token('t2'), null, 'scaduto');

    // Codice giusto: vale una volta sola.
    await nuovo('t3', 'c3');
    assert.equal(await codice('c3'), true);
    assert.equal(await codice('c3'), false);
    // Codice sbagliato: ogni tentativo conta; dopo cinque anche quello giusto non vale più.
    await nuovo('t4', 'c4');
    for (let n = 0; n < 5; n++) assert.equal(await codice('x'), false);
    assert.equal(await codice('c4'), false, 'sesto tentativo: bruciato');
    assert.equal((await uno(db, "select usato from public.accessi where token_hash = 't4'")).usato, true);
    // Quattro tentativi sbagliati e poi quello giusto: vale.
    await nuovo('t5', 'c5');
    for (let n = 0; n < 4; n++) assert.equal(await codice('x'), false);
    assert.equal(await codice('c5'), true);
    // Nessun accesso aperto, o scaduto.
    assert.equal(await codice('c5'), false);
    await nuovo('t6', 'c6', tra(-5));
    assert.equal(await codice('c6'), false);
  });
});

test('scadenze e anonimizzazione: idempotenti, e la riga anonima non dà fastidio all\'indice', async () => {
  await conDb(async (db, d) => {
    const { eventoId, lottoId } = await serata(db, d, 10);
    const a = await crea(db, eventoId, lottoId, { cognome: 'Uno', email: 'uno@esempio.it' });
    const b = await crea(db, eventoId, lottoId, { cognome: 'Due', email: 'due@esempio.it', scade: tra(120) });
    const scadenze = async (t: string) => (await uno(db, 'select public.scadenze_iscrizioni($1::timestamptz) as r', [t])).r;
    assert.equal(await scadenze(tra(10)), 0);
    assert.equal(await scadenze(tra(31)), 1);
    assert.equal(await scadenze(tra(31)), 0);
    assert.deepEqual([await stato(db, a.id), await stato(db, b.id)], ['scaduta', 'in_attesa']);

    await conferma(db, b.id, 'pi_b');
    const anon = async (dati: unknown[]) => (await uno(db, 'select public.anonimizza_iscrizioni($1::jsonb,$2::timestamptz) as r', [JSON.stringify(dati), tra(1000)])).r;
    assert.equal(await anon([{ id: b.id, eta: 25 }, { id: randomUUID(), eta: 30 }]), 1);
    assert.equal(await anon([{ id: b.id, eta: 99 }]), 0, 'una volta sola');
    const r = await uno(db, 'select nome, cognome, chiave_cognome, data_nascita, email, anonimizzata, eta_alla_serata, anonimizzata_at, stato, importo, canale, pr_id from public.iscrizioni where id = $1', [b.id]);
    assert.deepEqual([r.nome, r.cognome, r.chiave_cognome, r.data_nascita, r.email, r.anonimizzata, r.eta_alla_serata, istante(r.anonimizzata_at), r.stato, Number(r.importo), r.canale],
      [null, null, null, null, null, true, 25, Date.parse(tra(1000)), 'pagato', 10, 'diretto']);
    // Due righe anonime della stessa serata non si scontrano; la stessa persona può rifare la prevendita per un'altra serata.
    const c = await crea(db, eventoId, lottoId, { cognome: 'Tre', email: 'tre@esempio.it', stato: 'in_lista', importo: 0 });
    assert.equal(await anon([{ id: c.id, eta: 31 }]), 1);
    assert.equal((await uno(db, 'select count(*)::int as n from public.iscrizioni where anonimizzata')).n, 2);
    assert.equal((await crea(db, eventoId, lottoId, { cognome: 'Due', email: 'due@esempio.it', adesso: tra(2000), scade: tra(2030) })).esito, 'creata');
  });
});
