// Migrazione dei tavoli (supabase/migrations/20261106000000_schema_tavoli.sql) provata su un Postgres vero in memoria: ordine delle
// migrazioni, permessi, copia dalla riga unica, vincoli e ogni funzione nei suoi casi singoli. Le richieste davvero simultanee si
// provano a parte (schema-tavoli.gara.test.ts), perché PGlite ha una sola connessione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { creaDb, scriviRiga, MIGRAZIONI_ANAGRAFICHE } from './prova-db';
import { datiIniziali } from './seed';
import type { Archivio, PrenotazioneTavolo, Tavolo } from './tipi';
import { ADESSO, avviaRimborso, concludiRimborso, conferma, crea, importa, istante, nuovaSerata, q, tra, uno, verifica, type Json } from './prova-vendite';
import { annullaPrenotazione, attivePerTavolo, confermaTavolo, ingressoTavolo, nuovoTavolo, prenota, statoPrenotazione } from './prova-tavoli';

const SEGRETO = 'segreto-di-prova-che-non-deve-mai-comparire';

async function conDb<T>(prova: (db: PGlite) => Promise<T>): Promise<T> {
  const db = await creaDb();
  try {
    return await prova(db);
  } finally {
    await db.close();
  }
}

/** Lo stato del tavolo come lo vede la vista (usa l'orologio vero del database). */
const statoTavolo = async (db: PGlite, id: string) => (await uno(db, 'select stato from public.tavoli_con_stato where id = $1', [id])).stato as string;

test('la migrazione dei tavoli si ferma pulita se mancano le tappe 1 o 2', async () => {
  const file = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261106000000_schema_tavoli.sql'), 'utf8');
  const vuoto = await creaDb(['20261005000000_archivio_mvp.sql']);
  try {
    await assert.rejects(vuoto.exec(file), /tappa 1/);
  } finally {
    await vuoto.close();
  }
  const solo1 = await creaDb(MIGRAZIONI_ANAGRAFICHE);
  try {
    await assert.rejects(solo1.exec(file), /tappa 2/);
    assert.equal((await uno(solo1, "select to_regclass('public.tavoli') as t")).t, null, 'non ha creato niente');
    assert.equal((await uno(solo1, "select to_regclass('public.prenotazioni_tavoli') as t")).t, null);
  } finally {
    await solo1.close();
  }
});

test('le tabelle, la vista e le funzioni dei tavoli sono chiuse a chiunque non sia il server', async () => {
  await conDb(async (db) => {
    for (const t of ['tavoli', 'prenotazioni_tavoli', 'ingressi_tavoli']) {
      const r = await uno(db, `select c.relrowsecurity as rls, has_table_privilege('anon', c.oid, 'select') as anon, has_table_privilege('authenticated', c.oid, 'select') as auth,
        has_table_privilege('service_role', c.oid, 'insert') as srv, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::text as policy
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = $1`, [t]);
      assert.deepEqual(r, { rls: true, anon: false, auth: false, srv: true, policy: '0' }, t);
    }
    const v = await uno(db, `select has_table_privilege('anon', 'public.tavoli_con_stato', 'select') as anon, has_table_privilege('authenticated', 'public.tavoli_con_stato', 'select') as auth,
      has_table_privilege('service_role', 'public.tavoli_con_stato', 'select') as srv`);
    assert.deepEqual(v, { anon: false, auth: false, srv: true }, 'vista');
    const funzioni = await q(db, `select p.oid::regprocedure::text as f, has_function_privilege('anon', p.oid, 'execute') as anon,
      has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as srv
      from pg_proc p where p.pronamespace = 'public'::regnamespace`);
    assert.ok(funzioni.length >= 22, 'le funzioni ci sono tutte');
    for (const f of funzioni) assert.deepEqual([f.anon, f.auth, f.srv], [false, false, true], String(f.f));
    const aperte = await q(db, `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname not in ('chiave_cognome', 'tiene_posto')
      and (not prosecdef or proconfig is null or not (proconfig::text like '%search_path=%'))`);
    assert.deepEqual(aperte, []);
  });
});

test('prenota_tavolo: il tavolo è di uno solo, le richieste scadute lo liberano', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const t = await nuovoTavolo(db, eventoId, { spesa: 150 });
    const a = await prenota(db, t, { persone: 4 });
    assert.equal(a.esito, 'creata');
    const riga = await uno(db, 'select spesa_minima, stato, evento_id, pagamento_online, inserita_da, telefono_cifre from public.prenotazioni_tavoli where id = $1', [a.id]);
    assert.deepEqual([Number(riga.spesa_minima), riga.stato, riga.evento_id, riga.pagamento_online, riga.inserita_da], [150, 'in_attesa', eventoId, true, 'cliente']);
    assert.equal(String(riga.telefono_cifre).length, 9);
    // Un altro cliente: il tavolo è preso.
    assert.equal((await prenota(db, t)).esito, 'tavolo_non_disponibile');
    // Tavolo non in vendita o che non esiste.
    const fuori = await nuovoTavolo(db, eventoId, { inVendita: false });
    assert.equal((await prenota(db, fuori)).esito, 'tavolo_non_disponibile');
    assert.equal((await prenota(db, randomUUID())).esito, 'tavolo_sconosciuto');
    // Passato il termine senza pagare, il tavolo torna libero (e la vecchia richiesta risulta scaduta, con l'orario della chiusura).
    const dopo = tra(31);
    const b = await prenota(db, t, { adesso: dopo, scade: tra(61) });
    assert.equal(b.esito, 'creata');
    const vecchia = await uno(db, 'select stato, chiusa_at, avviso_chiusura_at from public.prenotazioni_tavoli where id = $1', [a.id]);
    assert.deepEqual([vecchia.stato, istante(vecchia.chiusa_at), vecchia.avviso_chiusura_at], ['scaduta', Date.parse(dopo), null]);
    assert.equal(await attivePerTavolo(db, t), 1);
    // Valore non valido per chi inserisce.
    await assert.rejects(prenota(db, t, { inseritaDa: 'boh' }), /inserita_da_non_valido/);
  });
});

test('prenota_tavolo: un cliente tiene un solo tavolo per serata, il PR e la crew possono inserirne di più', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const [t1, t2, t3, t4] = await Promise.all([1, 2, 3, 4].map((i) => nuovoTavolo(db, eventoId, { nome: `T${i}` })));
    const a = await prenota(db, t1, { email: 'cliente@esempio.it', telefono: '+39 333 1111111' });
    assert.equal(a.esito, 'creata');
    await confermaTavolo(db, a.id, 'pi_c1');   // (una richiesta non pagata si chiuderebbe da sola: vedi il test dopo)
    // Stessa email o stesso numero (scritto in un altro modo): niente secondo tavolo.
    assert.equal((await prenota(db, t2, { email: 'CLIENTE@esempio.it', telefono: '+39 340 9999999' })).esito, 'email_gia');
    assert.equal((await prenota(db, t2, { email: 'altro@esempio.it', telefono: '333 1111111' })).esito, 'telefono_gia');
    // Il PR e la crew possono inserire più richieste per clienti diversi, anche con la stessa email.
    assert.equal((await prenota(db, t2, { email: 'cliente@esempio.it', inseritaDa: 'pr' })).esito, 'creata');
    assert.equal((await prenota(db, t3, { email: 'cliente@esempio.it', inseritaDa: 'crew' })).esito, 'creata');
    // Ma un cliente non ne ottiene un altro se una richiesta (anche del PR) lo tiene già.
    assert.equal((await prenota(db, t4, { email: 'cliente@esempio.it' })).esito, 'email_gia');
    // Un'altra serata non c'entra.
    const altra = await nuovaSerata(db, 10);
    assert.equal((await prenota(db, await nuovoTavolo(db, altra.eventoId), { email: 'cliente@esempio.it', telefono: '+39 333 1111111' })).esito, 'creata');
  });
});

test('prenota_tavolo: la pagina di pagamento lasciata a metà si chiude e si riparte; il cliente scaduto non resta bloccato', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const [t1, t2] = await Promise.all([1, 2].map((i) => nuovoTavolo(db, eventoId, { nome: `T${i}` })));
    const a = await prenota(db, t1, { email: 'lascia@esempio.it', telefono: '+39 333 2222222' });
    // Prova un altro tavolo con la stessa email dopo pochi minuti: la prima richiesta (ancora aperta, non pagata) si chiude e vale la nuova.
    const b = await prenota(db, t2, { email: 'lascia@esempio.it', telefono: '+39 333 2222222', adesso: tra(5), scade: tra(35) });
    assert.equal(b.esito, 'creata');
    const vecchia = await uno(db, 'select stato, chiusa_at, avviso_chiusura_at from public.prenotazioni_tavoli where id = $1', [a.id]);
    assert.deepEqual([vecchia.stato, istante(vecchia.chiusa_at), istante(vecchia.avviso_chiusura_at)], ['annullata', Date.parse(tra(5)), Date.parse(tra(5))]);
    assert.equal(await attivePerTavolo(db, t1), 0, 'il primo tavolo è libero');
    // Una richiesta pagata invece non si chiude mai da sola.
    await confermaTavolo(db, b.id, 'pi_b', { adesso: tra(6) });
    assert.equal((await prenota(db, t1, { email: 'lascia@esempio.it', adesso: tra(7), scade: tra(37) })).esito, 'email_gia');
    // Il cliente con una richiesta scaduta (non ancora segnata) può prenderne un'altra: scade per prima.
    const { eventoId: altra } = await nuovaSerata(db, 10);
    const [u1, u2] = await Promise.all([1, 2].map((i) => nuovoTavolo(db, altra, { nome: `U${i}` })));
    await prenota(db, u1, { email: 'scaduto@esempio.it', telefono: '+39 333 3333333' });
    assert.equal((await prenota(db, u2, { email: 'scaduto@esempio.it', telefono: '+39 333 3333333', adesso: tra(40), scade: tra(70) })).esito, 'creata');
    assert.equal(await statoPrenotazione(db, (await uno(db, "select id from public.prenotazioni_tavoli where tavolo_id = $1", [u1])).id as string), 'scaduta');
  });
});

test('la vista dice lo stato del tavolo: libero, riservato, confermato, non in vendita', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const t = await nuovoTavolo(db, eventoId);
    const adesso = new Date();
    assert.equal(await statoTavolo(db, t), 'libero');
    const p = await prenota(db, t, { adesso: adesso.toISOString(), scade: new Date(adesso.getTime() + 30 * 60_000).toISOString() });
    assert.equal(await statoTavolo(db, t), 'riservato');
    await confermaTavolo(db, p.id, 'pi_vista', { adesso: adesso.toISOString() });
    assert.equal(await statoTavolo(db, t), 'confermato');
    await annullaPrenotazione(db, p.id).catch(() => undefined);
    await concludiRimborso(db, 'pi_vista', adesso.toISOString());
    assert.equal(await statoTavolo(db, t), 'libero', 'rimborsata: il tavolo è libero da solo');
    await db.query('update public.tavoli set in_vendita = false where id = $1', [t]);
    assert.equal(await statoTavolo(db, t), 'non_in_vendita');
    // Una richiesta in attesa col termine passato non tiene più il tavolo.
    const u = await nuovoTavolo(db, eventoId);
    await prenota(db, u, { adesso: tra(-120), scade: tra(-90) });
    assert.equal(await statoTavolo(db, u), 'libero');
  });
});

test('conferma_pagamento_prenotazione: conferma, ripetizione, secondo pagamento, importo, richiesta chiusa', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const t = await nuovoTavolo(db, eventoId);
    const a = await prenota(db, t);
    assert.deepEqual(await confermaTavolo(db, a.id, 'pi_1'), { esito: 'confermata' });
    const riga = await uno(db, 'select stato, metodo_pagamento, pagato_da, pagamento_online, chiusa_at, avviso_chiusura_at, pagato_at from public.prenotazioni_tavoli where id = $1', [a.id]);
    assert.deepEqual([riga.stato, riga.metodo_pagamento, riga.pagato_da, riga.pagamento_online, riga.chiusa_at, riga.avviso_chiusura_at, istante(riga.pagato_at)],
      ['confermata', 'online', 'pagamento online', true, null, null, ADESSO.getTime()]);
    // Lo stesso pagamento ripetuto: niente di nuovo.
    for (let n = 0; n < 3; n++) assert.deepEqual(await confermaTavolo(db, a.id, 'pi_1'), { esito: 'gia' });
    // Un altro pagamento sulla stessa prenotazione: va restituito, la prenotazione non cambia.
    assert.deepEqual(await confermaTavolo(db, a.id, 'pi_1b'), { esito: 'da_rimborsare', motivo: 'secondo_pagamento', principale: false, centesimi: 10000 });
    assert.equal((await uno(db, 'select count(*)::int as n from public.pagamenti where prenotazione_id = $1', [a.id])).n, 2);
    // Importo o valuta sbagliati: non conferma niente; il pagamento giusto che arriva dopo conferma.
    const b = await prenota(db, await nuovoTavolo(db, eventoId));
    assert.deepEqual(await confermaTavolo(db, b.id, 'pi_2', { importoOk: false, centesimi: 9000 }), { esito: 'da_rimborsare', motivo: 'importo', principale: false, centesimi: 9000 });
    assert.equal(await statoPrenotazione(db, b.id), 'in_attesa');
    assert.deepEqual(await confermaTavolo(db, b.id, 'pi_2b'), { esito: 'confermata' });
    assert.deepEqual(await confermaTavolo(db, randomUUID(), 'pi_x'), { esito: 'sconosciuta' });
    // Richiesta annullata (il cliente ha lasciato il tavolo): il pagamento arriva lo stesso, si restituisce.
    const c = await prenota(db, await nuovoTavolo(db, eventoId));
    await annullaPrenotazione(db, c.id, c.email);
    assert.deepEqual(await confermaTavolo(db, c.id, 'pi_3'), { esito: 'da_rimborsare', motivo: 'ordine_chiuso', principale: true, centesimi: 10000 });
    assert.equal(await statoPrenotazione(db, c.id), 'annullata');
    const pagata = await uno(db, "select pagato_at, metodo_pagamento from public.prenotazioni_tavoli where id = $1", [c.id]);
    assert.deepEqual([istante(pagata.pagato_at), pagata.metodo_pagamento], [ADESSO.getTime(), 'online']);
    assert.deepEqual(await q(db, "select ruolo, motivo, da_rimborsare from public.pagamenti where id = 'pi_3'"), [{ ruolo: 'principale', motivo: 'ordine_chiuso', da_rimborsare: true }]);
  });
});

test('conferma_pagamento_prenotazione: un pagamento in ritardo vale solo se il tavolo è ancora libero', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    // Scaduta (anche se nessuno l'ha ancora segnata) e tavolo rimasto libero: vale.
    const t1 = await nuovoTavolo(db, eventoId, { nome: 'T1' });
    const a = await prenota(db, t1);
    assert.deepEqual(await confermaTavolo(db, a.id, 'pi_a', { adesso: tra(90) }), { esito: 'confermata' });
    // Scaduta e segnata scaduta, tavolo libero: vale lo stesso.
    const t2 = await nuovoTavolo(db, eventoId, { nome: 'T2' });
    const b = await prenota(db, t2);
    await uno(db, 'select public.scadenze_prenotazioni($1::timestamptz) as r', [tra(40)]);
    assert.equal(await statoPrenotazione(db, b.id), 'scaduta');
    assert.deepEqual(await confermaTavolo(db, b.id, 'pi_b', { adesso: tra(90) }), { esito: 'confermata' });
    assert.equal(await statoPrenotazione(db, b.id), 'confermata');
    // Scaduta e il tavolo l'ha preso un altro: si restituisce, l'altro cliente non si tocca.
    const t3 = await nuovoTavolo(db, eventoId, { nome: 'T3' });
    const c = await prenota(db, t3);
    const altro = await prenota(db, t3, { adesso: tra(40), scade: tra(70) });
    assert.equal(altro.esito, 'creata');
    assert.deepEqual(await confermaTavolo(db, c.id, 'pi_c', { adesso: tra(45) }), { esito: 'da_rimborsare', motivo: 'ordine_chiuso', principale: true, centesimi: 10000 });
    assert.deepEqual([await statoPrenotazione(db, c.id), await statoPrenotazione(db, altro.id)], ['scaduta', 'in_attesa']);
    // Scaduta e il tavolo nel frattempo non è più in vendita: si restituisce.
    const t4 = await nuovoTavolo(db, eventoId, { nome: 'T4' });
    const d = await prenota(db, t4);
    await uno(db, 'select public.scadenze_prenotazioni($1::timestamptz) as r', [tra(40)]);
    await db.query('update public.tavoli set in_vendita = false where id = $1', [t4]);
    assert.deepEqual(await confermaTavolo(db, d.id, 'pi_d', { adesso: tra(90) }), { esito: 'da_rimborsare', motivo: 'ordine_chiuso', principale: true, centesimi: 10000 });
  });
});

test('annulla_prenotazione: una volta sola, non le pagate; il tavolo si libera', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const t = await nuovoTavolo(db, eventoId);
    const a = await prenota(db, t);
    assert.deepEqual(await annullaPrenotazione(db, a.id, 'admin@esempio.it', tra(3)), { esito: 'annullata' });
    const riga = await uno(db, 'select stato, chiusa_da, chiusa_at, avviso_chiusura_at from public.prenotazioni_tavoli where id = $1', [a.id]);
    assert.deepEqual([riga.stato, riga.chiusa_da, istante(riga.chiusa_at), istante(riga.avviso_chiusura_at)], ['annullata', 'admin@esempio.it', Date.parse(tra(3)), Date.parse(tra(3))]);
    assert.deepEqual(await annullaPrenotazione(db, a.id), { esito: 'gia_chiusa' });
    assert.deepEqual(await annullaPrenotazione(db, randomUUID()), { esito: 'sconosciuta' });
    assert.equal((await prenota(db, t, { adesso: tra(4), scade: tra(34) })).esito, 'creata', 'il tavolo è libero');
    const pagata = await prenota(db, await nuovoTavolo(db, eventoId));
    await confermaTavolo(db, pagata.id, 'pi_pagata');
    assert.deepEqual(await annullaPrenotazione(db, pagata.id), { esito: 'pagata' });
    assert.equal(await statoPrenotazione(db, pagata.id), 'confermata');
  });
});

test('scadenze, avvisi di chiusura e promemoria: ognuno scatta una volta sola', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const tavoli = await Promise.all([1, 2, 3, 4].map((i) => nuovoTavolo(db, eventoId, { nome: `T${i}` })));
    const cliente = await prenota(db, tavoli[0], { inseritaDa: 'cliente' });
    const pr = await prenota(db, tavoli[1], { inseritaDa: 'pr', scade: tra(24 * 60) });
    const crew = await prenota(db, tavoli[2], { inseritaDa: 'crew', scade: tra(10) });
    const scadenze = async (t: string) => (await uno(db, 'select public.scadenze_prenotazioni($1::timestamptz) as r', [t])).r;
    const avvisi = async (t: string) => (await uno(db, 'select public.avvisi_chiusura($1::timestamptz) as r', [t])).r as string[];
    const promemoria = async (ore: number, t: string) => (await uno(db, 'select public.promemoria_prenotazioni($1, $2::timestamptz) as r', [ore, t])).r as string[];

    // Promemoria: solo PR e crew, solo se hanno il link da almeno `ore` ore e il termine non è passato; una volta sola.
    assert.deepEqual(await promemoria(3, tra(60)), [], 'troppo presto');
    assert.deepEqual(await promemoria(3, tra(4 * 60 - 1)), [pr.id], 'la crew è già scaduta; il cliente non riceve promemoria');
    assert.deepEqual(await promemoria(3, tra(4 * 60)), [], 'una volta sola');
    assert.equal(await statoPrenotazione(db, crew.id), 'scaduta', 'il promemoria fa decadere prima le scadute');
    // Scadenze: il cliente (30 minuti) e la crew sono scaduti; la richiesta del PR no.
    assert.equal(await scadenze(tra(61)), 0, 'già segnate dal promemoria... tranne il cliente');
  });
});

test('ingresso_tavolo: una persona per passaggio fino al numero prenotato, il rif ripetuto non conta', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const t = await nuovoTavolo(db, eventoId);
    const p = await prenota(db, t, { persone: 3 });
    // Non pagato: non entra.
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r0'), { esito: 'non_pagato', entrati: 0, persone: 3 });
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r0', 'P1', ADESSO.toISOString(), tra(40)), { esito: 'chiusa', entrati: 0, persone: 3 }, 'richiesta scaduta');
    await confermaTavolo(db, p.id, 'pi_porta');
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r1', 'P1', tra(1)), { esito: 'entrato', entrati: 1, persone: 3 });
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r1', 'P2', tra(2)), { esito: 'gia_contato', entrati: 1, persone: 3 });
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r2'), { esito: 'entrato', entrati: 2, persone: 3 });
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r3'), { esito: 'entrato', entrati: 3, persone: 3 });
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r4'), { esito: 'completo', entrati: 3, persone: 3 });
    assert.deepEqual(await ingressoTavolo(db, p.id, 'r3'), { esito: 'gia_contato', entrati: 3, persone: 3 }, 'un rif già contato resta tale anche a tavolo completo');
    const righe = await q(db, 'select rif, porta, ora from public.ingressi_tavoli where prenotazione_id = $1 order by rif', [p.id]);
    assert.deepEqual(righe.map((r) => [r.rif, r.porta, istante(r.ora)]), [['r1', 'P1', Date.parse(tra(1))], ['r2', 'P1', ADESSO.getTime()], ['r3', 'P1', ADESSO.getTime()]]);
    assert.deepEqual(await ingressoTavolo(db, randomUUID(), 'x'), { esito: 'sconosciuta' });
    // Rimborsata o annullata: chiusa.
    const q2 = await prenota(db, await nuovoTavolo(db, eventoId));
    await confermaTavolo(db, q2.id, 'pi_q2');
    await concludiRimborso(db, 'pi_q2');
    assert.equal((await ingressoTavolo(db, q2.id, 'r1')).esito, 'chiusa');
  });
});

test('rimborso di un tavolo: si chiude una volta sola e il tavolo torna libero; il pagamento in più non chiude niente', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const t = await nuovoTavolo(db, eventoId);
    const p = await prenota(db, t);
    await confermaTavolo(db, p.id, 'pi_t');
    await confermaTavolo(db, p.id, 'pi_t2');                                   // pagamento in più
    assert.deepEqual(await avviaRimborso(db, 'pi_t', 'chiave-1'), { esito: 'avviato', chiave: 'chiave-1', centesimi: 10000, principale: true });
    assert.deepEqual(await avviaRimborso(db, 'pi_t', 'chiave-2', new Date(ADESSO.getTime() + 5_000)), { esito: 'in_corso' });
    const fatto = await concludiRimborso(db, 'pi_t', tra(5));
    assert.deepEqual([fatto.esito, fatto.chiusa_ordine, fatto.prenotazione_id, fatto.iscrizione_id], ['chiuso', true, p.id, null]);
    const riga = await uno(db, 'select stato, chiusa_da, chiusa_at, avviso_chiusura_at from public.prenotazioni_tavoli where id = $1', [p.id]);
    assert.deepEqual([riga.stato, riga.chiusa_da, istante(riga.chiusa_at), istante(riga.avviso_chiusura_at)], ['rimborsata', 'admin@esempio.it', Date.parse(tra(5)), Date.parse(tra(5))]);
    assert.equal((await concludiRimborso(db, 'pi_t')).esito, 'gia');
    assert.equal(await attivePerTavolo(db, t), 0);
    assert.equal((await prenota(db, t, { adesso: tra(6), scade: tra(36) })).esito, 'creata');
    // Il pagamento "in più" si rimborsa senza toccare la prenotazione.
    const piu = await concludiRimborso(db, 'pi_t2', tra(7));
    assert.deepEqual([piu.esito, piu.chiusa_ordine], ['chiuso', false]);
    assert.equal(await statoPrenotazione(db, p.id), 'rimborsata');
  });
});

test('anonimizza_prenotazioni: la durata è un parametro, si cancellano solo i dati personali, una volta sola', async () => {
  await conDb(async (db) => {
    const finita = await nuovaSerata(db, 10);                                  // serata tra un giorno (nuovaSerata) → la spostiamo indietro
    await db.query("update public.eventi set data = $2::timestamptz, data_fine = $3::timestamptz where id = $1", [finita.eventoId, tra(-24 * 60 * 10), tra(-24 * 60 * 10 + 300)]);
    const t = await nuovoTavolo(db, finita.eventoId, { spesa: 200 });
    const p = await prenota(db, t, { persone: 5, adesso: tra(-24 * 60 * 10 - 60), scade: tra(-24 * 60 * 10 - 30), prId: null });
    await confermaTavolo(db, p.id, 'pi_anon', { adesso: tra(-24 * 60 * 10 - 40), centesimi: 20000 });
    await ingressoTavolo(db, p.id, 'r1', 'P1', tra(-24 * 60 * 10 + 30), tra(-24 * 60 * 10 + 30));
    const futura = await nuovaSerata(db, 10);
    const f = await prenota(db, await nuovoTavolo(db, futura.eventoId), { adesso: tra(0) });
    const anon = async (giorni: number | null, quando = ADESSO.toISOString()) => (await uno(db, 'select public.anonimizza_prenotazioni($1, $2::timestamptz) as r', [giorni, quando])).r;
    await assert.rejects(anon(null), /giorni_non_validi/);
    await assert.rejects(anon(-1), /giorni_non_validi/);
    assert.equal(await anon(30), 0, 'la serata è finita da 10 giorni: con 30 non tocca niente');
    assert.equal(await anon(5), 1, 'con 5 sì');
    assert.equal(await anon(5), 0, 'una volta sola');
    const r = await uno(db, 'select nome, cognome, email, telefono, telefono_cifre, anonimizzata, anonimizzata_at, stato, persone, spesa_minima, tavolo_id, token_qr, codice from public.prenotazioni_tavoli where id = $1', [p.id]);
    assert.deepEqual([r.nome, r.cognome, r.email, r.telefono, r.telefono_cifre, r.anonimizzata, istante(r.anonimizzata_at), r.stato, r.persone, Number(r.spesa_minima), r.tavolo_id],
      [null, null, null, null, null, true, ADESSO.getTime(), 'confermata', 5, 200, t]);
    assert.ok(r.token_qr && r.codice);
    assert.equal((await uno(db, 'select count(*)::int as n from public.ingressi_tavoli where prenotazione_id = $1', [p.id])).n, 1);
    assert.equal((await uno(db, 'select count(*)::int as n from public.pagamenti where prenotazione_id = $1', [p.id])).n, 1);
    assert.equal((await uno(db, 'select anonimizzata from public.prenotazioni_tavoli where id = $1', [f.id])).anonimizzata, false, 'la serata di domani non si tocca');
    // Una serata senza chiusura vale 8 ore dopo l'apertura.
    await db.query('update public.eventi set data_fine = null where id = $1', [futura.eventoId]);
    await db.query("update public.eventi set data = $2::timestamptz where id = $1", [futura.eventoId, tra(-24 * 60 * 3)]);
    assert.equal(await anon(2), 1);
  });
});

test('la copia con tavoli, prenotazioni, ingressi e pagamenti dà gli stessi numeri e gli stessi valori', async () => {
  const dati: Archivio = datiIniziali(SEGRETO, new Date('2026-10-20T10:00:00+02:00'));
  const ev = dati.eventi[0];
  const pr = dati.pr[0];
  const tavoli: Tavolo[] = [
    { id: randomUUID(), eventoId: ev.id, nome: 'T1', zona: 'Pista', posti: 6, spesaMinima: 150, stato: 'confermato', nota: 'nota interna', visibileDaPr: true, prAbilitati: [pr.id], ordine: 1, x: 10.5, y: 20 },
    { id: randomUUID(), eventoId: ev.id, nome: 'T2', zona: null, posti: null, spesaMinima: 0, stato: 'libero', nota: null, visibileDaPr: false, prAbilitati: null, ordine: 2, x: null, y: null },
    { id: randomUUID(), eventoId: ev.id, nome: 'T3', zona: 'Privé', posti: 8, spesaMinima: 300.5, stato: 'non_in_vendita', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 3, x: 99.9, y: 0 },
    { id: randomUUID(), eventoId: ev.id, nome: 'T4', zona: null, posti: 4, spesaMinima: 100, stato: 'libero', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 4, x: null, y: null },
  ];
  const base = (n: number, tavoloId: string, o: Partial<PrenotazioneTavolo>): PrenotazioneTavolo => ({
    id: randomUUID(), tavoloId, eventoId: ev.id, prId: null, nome: `Nome${n}`, cognome: `Cognome${n}`, email: `p${n}@esempio.it`, telefono: `+39 333 000000${n}`, persone: 4,
    spesaMinima: 150, stato: 'in_attesa', scade: '2026-10-29T15:00:00.000Z', tokenQr: `MM1.tok${n}`, codice: `COD0000${n}`, inseritaDa: 'cliente',
    consensoPrivacyAt: '2026-10-29T14:00:00.000Z', createdAt: '2026-10-29T14:00:00.000Z', pagatoAt: null, metodoPagamento: null, pagatoDa: null, chiusaAt: null,
    chiusaDa: null, promemoriaAt: null, avvisoChiusuraAt: null, pagamentoOnline: { sessione: `cs_${n}`, pagamento: null, daRimborsare: false }, ingressi: [], ...o,
  });
  const pagata = base(1, tavoli[0].id, {
    stato: 'confermata', prId: pr.id, pagatoAt: '2026-10-29T14:10:00.000Z', metodoPagamento: 'online', pagatoDa: 'pagamento online', persone: 6,
    pagamentoOnline: { sessione: 'cs_1', pagamento: 'pi_T1', daRimborsare: false, inPiu: [{ pagamento: 'pi_T1b', centesimi: 15000, valuta: 'eur', motivo: 'secondo_pagamento', at: '2026-10-29T14:20:00.000Z' }] },
    ingressi: [{ rif: 'r1', ora: '2026-10-31T23:00:00.000Z', porta: 'P1' }, { rif: 'r2', ora: '2026-10-31T23:05:00+01:00', porta: 'P2' }],
  });
  const rimborsata = base(2, tavoli[1].id, {
    stato: 'rimborsata', inseritaDa: 'crew', pagatoAt: '2026-10-28T10:00:00.000Z', metodoPagamento: 'online', pagatoDa: 'pagamento online', chiusaAt: '2026-10-28T12:00:00.000Z', chiusaDa: 'admin@esempio.it',
    avvisoChiusuraAt: '2026-10-28T12:00:00.000Z', promemoriaAt: '2026-10-28T09:00:00.000Z',
    pagamentoOnline: { sessione: null, pagamento: 'pi_T2', daRimborsare: false, rimborso: { stato: 'fatto', chiave: 'mm-rimborso-9', avviatoAt: '2026-10-28T12:00:00.000Z', fattoAt: '2026-10-28T12:00:04.000Z', da: 'admin@esempio.it' } },
  });
  const lasciata = base(3, tavoli[3].id, { stato: 'scaduta', chiusaAt: '2026-10-29T15:00:00.000Z', inseritaDa: 'pr', prId: pr.id });
  const vecchia = base(4, tavoli[3].id, { stato: 'in_attesa', scade: '2026-11-30T15:00:00.000Z' });
  const daRimborsare = base(5, tavoli[2].id, {
    stato: 'annullata', chiusaAt: '2026-10-29T16:00:00.000Z', chiusaDa: 'p5@esempio.it', pagatoAt: '2026-10-29T16:30:00.000Z', metodoPagamento: 'online',
    pagamentoOnline: { sessione: null, pagamento: 'pi_T5', daRimborsare: true, motivo: 'ordine_chiuso' },
  });
  dati.tavoli.push(...tavoli);
  dati.prenotazioni.push(pagata, rimborsata, lasciata, vecchia, daRimborsare);
  const db = await creaDb();
  try {
    await scriviRiga(db, dati, 7);
    const esito = await importa(db);
    assert.deepEqual(esito, {
      eventi: 4, lotti: dati.lotti.length, pr: dati.pr.length, utenti: dati.utenti.length, porte: 0, iscrizioni: dati.iscrizioni.length, tavoli: 4, prenotazioni: 5, ingressi: 2,
      pagamenti: dati.iscrizioni.length + 4, accessi: 0, versione: 7,
    });
    const rt = await q(db, 'select * from public.tavoli order by ordine');
    assert.deepEqual(rt.map((r) => [r.id, r.nome, r.zona, r.posti, Number(r.spesa_minima), r.in_vendita, r.nota, r.visibile_da_pr, r.pr_abilitati, r.ordine, r.x == null ? null : Number(r.x), r.y == null ? null : Number(r.y)]),
      tavoli.map((t) => [t.id, t.nome, t.zona, t.posti, t.spesaMinima, t.stato !== 'non_in_vendita', t.nota, t.visibileDaPr, t.prAbilitati, t.ordine, t.x, t.y]));
    for (const p of [pagata, rimborsata, lasciata, vecchia, daRimborsare]) {
      const r = await uno(db, 'select * from public.prenotazioni_tavoli where id = $1', [p.id]);
      assert.deepEqual(
        { tavolo: r.tavolo_id, evento: r.evento_id, pr: r.pr_id, nome: r.nome, cognome: r.cognome, email: r.email, telefono: r.telefono, persone: r.persone, spesa: Number(r.spesa_minima), stato: r.stato,
          scade: istante(r.scade), token: r.token_qr, codice: r.codice, da: r.inserita_da, privacy: istante(r.consenso_privacy_at), creata: istante(r.created_at), pagatoAt: istante(r.pagato_at),
          metodo: r.metodo_pagamento, pagatoDa: r.pagato_da, chiusaAt: istante(r.chiusa_at), chiusaDa: r.chiusa_da, promemoria: istante(r.promemoria_at), avviso: istante(r.avviso_chiusura_at),
          online: r.pagamento_online, sessione: r.pagamento_sessione, anon: r.anonimizzata },
        { tavolo: p.tavoloId, evento: p.eventoId, pr: p.prId, nome: p.nome, cognome: p.cognome, email: p.email, telefono: p.telefono, persone: p.persone, spesa: p.spesaMinima, stato: p.stato,
          scade: istante(p.scade), token: p.tokenQr, codice: p.codice, da: p.inseritaDa, privacy: istante(p.consensoPrivacyAt), creata: istante(p.createdAt), pagatoAt: istante(p.pagatoAt),
          metodo: p.metodoPagamento, pagatoDa: p.pagatoDa, chiusaAt: istante(p.chiusaAt), chiusaDa: p.chiusaDa, promemoria: istante(p.promemoriaAt), avviso: istante(p.avvisoChiusuraAt),
          online: true, sessione: p.pagamentoOnline?.sessione ?? null, anon: false },
        p.cognome);
    }
    const ing = await q(db, 'select rif, porta, ora from public.ingressi_tavoli where prenotazione_id = $1 order by rif', [pagata.id]);
    assert.deepEqual(ing.map((i) => [i.rif, i.porta, istante(i.ora)]), [['r1', 'P1', Date.parse('2026-10-31T23:00:00.000Z')], ['r2', 'P2', Date.parse('2026-10-31T23:05:00+01:00')]]);
    const pag = await q(db, "select id, ruolo, centesimi, valuta, motivo, da_rimborsare, rimborso_stato, rimborso_chiave, rimborso_da from public.pagamenti where prenotazione_id is not null order by id");
    assert.deepEqual(pag, [
      { id: 'pi_T1', ruolo: 'principale', centesimi: 15000, valuta: 'eur', motivo: null, da_rimborsare: false, rimborso_stato: null, rimborso_chiave: null, rimborso_da: null },
      { id: 'pi_T1b', ruolo: 'in_piu', centesimi: 15000, valuta: 'eur', motivo: 'secondo_pagamento', da_rimborsare: true, rimborso_stato: null, rimborso_chiave: null, rimborso_da: null },
      { id: 'pi_T2', ruolo: 'principale', centesimi: 15000, valuta: 'eur', motivo: null, da_rimborsare: false, rimborso_stato: 'fatto', rimborso_chiave: 'mm-rimborso-9', rimborso_da: 'admin@esempio.it' },
      { id: 'pi_T5', ruolo: 'principale', centesimi: 15000, valuta: 'eur', motivo: 'ordine_chiuso', da_rimborsare: true, rimborso_stato: null, rimborso_chiave: null, rimborso_da: null },
    ]);
    // Lo stato dei tavoli è derivato dalle prenotazioni (con l'orologio vero del database: le richieste di prova sono nel passato).
    assert.equal(await statoTavolo(db, tavoli[0].id), 'confermato');
    assert.equal(await statoTavolo(db, tavoli[2].id), 'non_in_vendita');
    const v = await verifica(db);
    assert.equal(v.ok, true, v.differenze.join(' | '));
    for (const g of ['tavoli', 'prenotazioni', 'ingressi', 'pagamenti']) assert.equal(v.conteggi[g].riga, v.conteggi[g].tabella, g);
    assert.deepEqual(await importa(db), esito, 'rilanciabile');
    assert.equal((await verifica(db)).ok, true);
  } finally {
    await db.close();
  }
});

test('la copia dei tavoli si ferma, senza copiare niente, davanti a dati incoerenti', async () => {
  const guasti: [string, (d: Archivio) => void, RegExp][] = [
    ['due richieste attive sullo stesso tavolo', (d) => {
      const t = d.tavoli[0];
      for (const n of [1, 2]) d.prenotazioni.push({ ...prenotazioneBase(d, t.id, n), stato: 'in_attesa' });
    }, /prenotazioni_tavolo_attiva/],
    ['rif doppio', (d) => {
      const p = prenotazioneBase(d, d.tavoli[0].id, 1);
      p.ingressi = [{ rif: 'r', ora: '2026-10-31T23:00:00.000Z', porta: 'P1' }, { rif: 'r', ora: '2026-10-31T23:01:00.000Z', porta: 'P1' }];
      d.prenotazioni.push({ ...p, stato: 'confermata', pagatoAt: '2026-10-29T14:10:00.000Z' });
    }, /ingressi_tavoli_prenotazione_id_rif_key/],
    ['pagamento in comune fra una prenotazione e una iscrizione', (d) => {
      d.prenotazioni.push({ ...prenotazioneBase(d, d.tavoli[0].id, 1), stato: 'confermata', pagatoAt: '2026-10-29T14:10:00.000Z', pagamentoOnline: { sessione: null, pagamento: d.iscrizioni[0].pagamentoOnline!.pagamento, daRimborsare: false } });
    }, /pagamenti_pkey/],
  ];
  for (const [nome, guasto, atteso] of guasti) {
    const dati = datiIniziali(SEGRETO, new Date('2026-10-20T10:00:00+02:00'));
    dati.tavoli.push({ id: randomUUID(), eventoId: dati.eventi[0].id, nome: 'T1', zona: null, posti: 6, spesaMinima: 150, stato: 'libero', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 1, x: null, y: null });
    guasto(dati);
    const db = await creaDb();
    try {
      await scriviRiga(db, dati);
      await assert.rejects(importa(db), atteso, nome);
      assert.equal((await q(db, 'select 1 from public.tavoli')).length, 0, `${nome}: niente a metà`);
      assert.equal((await q(db, 'select 1 from public.eventi')).length, 0, `${nome}: niente a metà`);
    } finally {
      await db.close();
    }
  }
});

function prenotazioneBase(d: Archivio, tavoloId: string, n: number): PrenotazioneTavolo {
  return {
    id: randomUUID(), tavoloId, eventoId: d.eventi[0].id, prId: null, nome: `Nome${n}`, cognome: `Cognome${n}`, email: `q${n}@esempio.it`, telefono: `+39 333 111000${n}`, persone: 4,
    spesaMinima: 150, stato: 'in_attesa', scade: '2026-10-29T15:00:00.000Z', tokenQr: `MM1.tq${n}`, codice: `CODQ000${n}`, inseritaDa: 'cliente',
    consensoPrivacyAt: '2026-10-29T14:00:00.000Z', createdAt: '2026-10-29T14:00:00.000Z', pagatoAt: null, metodoPagamento: null, pagatoDa: null, chiusaAt: null,
    chiusaDa: null, promemoriaAt: null, avvisoChiusuraAt: null, pagamentoOnline: { sessione: null, pagamento: null, daRimborsare: false }, ingressi: [],
  };
}

test('i vincoli di tavoli, prenotazioni e ingressi tengono', async () => {
  await conDb(async (db) => {
    const { eventoId } = await nuovaSerata(db, 10);
    const t = await nuovoTavolo(db, eventoId, { nome: 'T1' });
    const a = await prenota(db, t, { email: 'uno@esempio.it', telefono: '+39 333 4440001' });
    const fallisce = async (sql: string, p: unknown[] = [], codice?: string) =>
      assert.rejects(db.query(sql, p), (e: { code?: string }) => !codice || e.code === codice, sql);
    const ins = (id: string, stato: string, extra = '') => db.query(
      `insert into public.prenotazioni_tavoli (id, tavolo_id, evento_id, nome, cognome, email, telefono, persone, spesa_minima, stato, scade, token_qr, codice, inserita_da, consenso_privacy_at ${extra})
       values ($1, $2, $3, 'N', 'C', $4, '+39 333 9990000', 2, 10, $5, now(), $6, $7, 'pr', now())`, [id, t, eventoId, `${id.slice(0, 6)}@esempio.it`, stato, `tk${id}`, id.slice(0, 8)]);
    // Un solo cliente attivo per tavolo, anche scrivendo a mano.
    await assert.rejects(ins(randomUUID(), 'confermata'), (e: { code?: string }) => e.code === '23505');
    // Fuori dagli stati attivi il tavolo può avere quante storie vuole.
    await ins(randomUUID(), 'annullata'); await ins(randomUUID(), 'scaduta'); await ins(randomUUID(), 'rimborsata');
    // Nomi dei tavoli unici per serata (senza badare a maiuscole e spazi); uno stesso nome in un'altra serata va bene.
    await fallisce("insert into public.tavoli (id, evento_id, nome) values (gen_random_uuid(), $1, '  t1 ')", [eventoId], '23505');
    const altra = await nuovaSerata(db, 10);
    await db.query("insert into public.tavoli (id, evento_id, nome) values (gen_random_uuid(), $1, 'T1')", [altra.eventoId]);
    // Mappa: x senza y; fuori misura. Posti e persone fuori misura. Spesa negativa.
    await fallisce('update public.tavoli set x = 10 where id = $1', [t], '23514');
    await fallisce('update public.tavoli set x = 10, y = 101 where id = $1', [t], '23514');
    await fallisce('update public.tavoli set posti = 0 where id = $1', [t], '23514');
    await fallisce('update public.tavoli set spesa_minima = -1 where id = $1', [t], '23514');
    await fallisce('update public.prenotazioni_tavoli set persone = 100 where id = $1', [a.id], '23514');
    await fallisce("update public.prenotazioni_tavoli set stato = 'boh' where id = $1", [a.id], '23514');
    await fallisce("update public.prenotazioni_tavoli set inserita_da = 'boh' where id = $1", [a.id], '23514');
    // Dati personali: a metà non vanno; metodo di pagamento solo se pagata; email non valida.
    await fallisce('update public.prenotazioni_tavoli set nome = null where id = $1', [a.id], '23514');
    await fallisce("update public.prenotazioni_tavoli set email = 'non-una-email' where id = $1", [a.id], '23514');
    await fallisce("update public.prenotazioni_tavoli set metodo_pagamento = 'online' where id = $1", [a.id], '23514');
    await fallisce("update public.prenotazioni_tavoli set anonimizzata = true where id = $1", [a.id], '23514');
    // Un tavolo con prenotazioni non si cancella; una serata con tavoli sì (si porta via i tavoli, non le prenotazioni).
    await fallisce('delete from public.tavoli where id = $1', [t], '23001');
    await fallisce('delete from public.eventi where id = $1', [eventoId], '23001');
    // Ingressi: stesso rif due volte; sparisce con la prenotazione. I pagamenti puntano a prenotazioni che esistono.
    await confermaTavolo(db, a.id, 'pi_v');
    await ingressoTavolo(db, a.id, 'r1');
    await fallisce("insert into public.ingressi_tavoli (prenotazione_id, rif, ora, porta) values ($1, 'r1', now(), 'P1')", [a.id], '23505');
    await fallisce("insert into public.pagamenti (id, prenotazione_id, ruolo, centesimi) values ('senza', gen_random_uuid(), 'in_piu', 100)", [], '23503');
    await fallisce("insert into public.pagamenti (id, prenotazione_id, ruolo, centesimi) values ('altro_principale', $1, 'principale', 100)", [a.id], '23505');
    // Il pagamento è anche di una iscrizione: non può essere di tutte e due.
    const i = await crea(db, eventoId, null, { cognome: 'Doppio', email: 'doppio@esempio.it' });
    await fallisce("insert into public.pagamenti (id, iscrizione_id, prenotazione_id, ruolo, centesimi) values ('tutti_e_due', $1, $2, 'in_piu', 100)", [i.id, a.id], '23514');
    // Ripetere la migrazione non rompe niente (sono tutte "create … if not exists" o "create or replace").
    const file = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261106000000_schema_tavoli.sql'), 'utf8');
    await db.exec(file);
    assert.equal((await q(db, 'select 1 from public.tavoli')).length, 2);
  });
});

test('la copia gira ancora con i soli dati delle vendite (nessun tavolo nella riga)', async () => {
  await conDb(async (db) => {
    const d = datiIniziali(SEGRETO, new Date('2026-10-20T10:00:00+02:00'));
    await scriviRiga(db, d);
    const esito = await importa(db);
    assert.deepEqual([esito.tavoli, esito.prenotazioni, esito.ingressi], [0, 0, 0]);
    assert.equal((await verifica(db)).ok, true);
    // Il resto del giro di vendita funziona dopo la copia come prima.
    const { eventoId } = await nuovaSerata(db, 2);
    const i = await crea(db, eventoId, null, { cognome: 'Dopo', email: 'dopo@esempio.it' });
    assert.deepEqual(await conferma(db, i.id, 'pi_dopo'), { esito: 'confermata' });
    void ({} as Json);
  });
});
