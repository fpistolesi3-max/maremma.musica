// Test di gara dei tavoli: richieste davvero simultanee, ciascuna su una sua connessione, contro un Postgres vero (il database di PROVA
// su Supabase). Come schema-vendite.gara.test.ts: girano solo con MM_TEST_PG_URL (file `.env.test.local`, vedi README), in uno schema
// creato e cancellato a ogni giro, e non partono se l'indirizzo è quello del sito vero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaUrlProva, creaAmbiente, leggiUrlProva, type Ambiente } from './prova-pg';
import { avviaRimborso, concludiRimborso, nuovaSerata, q, tra, uno, type Json } from './prova-vendite';
import { annullaPrenotazione, attivePerTavolo, confermaTavolo, ingressoTavolo, nuovoTavolo, prenota, statoPrenotazione } from './prova-tavoli';

const url = leggiUrlProva();
const SALTA = url ? false : 'Test di gara saltati: manca MM_TEST_PG_URL (di solito in .env.test.local, vedi README, sezione "Test di gara")';

const conta = (esiti: string[]) => esiti.reduce<Record<string, number>>((m, e) => ({ ...m, [e]: (m[e] ?? 0) + 1 }), {});
const insieme = <T>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));
const esito = (e: Json) => `${e.esito as string}${e.motivo ? `/${e.motivo as string}` : ''}`;

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

test('gara tavoli: 30 richieste insieme per lo stesso tavolo → una sola lo prende', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const tavolo = await nuovoTavolo(db, eventoId);
  const esiti = await insieme(30, () => prenota(db, tavolo));
  assert.deepEqual(conta(esiti.map(esito)), { creata: 1, tavolo_non_disponibile: 29 });
  assert.equal(await attivePerTavolo(db, tavolo), 1);
}));

test('gara tavoli: lo stesso cliente che prova 10 tavoli insieme ne tiene uno solo (per email e per telefono)', { skip: SALTA }, () => conAmbiente(async (db) => {
  // Una pagina di pagamento lasciata a metà dallo stesso cliente si chiude e la nuova richiesta prende il suo posto (regola di
  // lib/dati/tavoli.ts): se due richieste si vedono, vince l'ultima. Quello che non deve mai succedere è che ne restino due aperte.
  const { eventoId } = await nuovaSerata(db, 10);
  const tavoli = await Promise.all(Array.from({ length: 10 }, (_, i) => nuovoTavolo(db, eventoId, { nome: `T${i}` })));
  const perEmail = await insieme(10, (i) => prenota(db, tavoli[i], { email: 'stesso@esempio.it' }));
  const e = conta(perEmail.map(esito));
  assert.ok((e.creata ?? 0) >= 1 && (e.creata ?? 0) + (e.email_gia ?? 0) === 10, JSON.stringify(e));
  assert.equal((await uno(db, "select count(*)::int as n from public.prenotazioni_tavoli where evento_id = $1 and stato = 'in_attesa'", [eventoId])).n, 1);

  const { eventoId: altra } = await nuovaSerata(db, 10);
  const altri = await Promise.all(Array.from({ length: 10 }, (_, i) => nuovoTavolo(db, altra, { nome: `U${i}` })));
  const perTelefono = await insieme(10, (i) => prenota(db, altri[i], { email: `diversa${i}@esempio.it`, telefono: i % 2 ? '+39 333 1234567' : '333-1234567' }));
  const t = conta(perTelefono.map(esito));
  assert.ok((t.creata ?? 0) >= 1 && (t.creata ?? 0) + (t.telefono_gia ?? 0) === 10, JSON.stringify(t));
  assert.equal((await uno(db, "select count(*)::int as n from public.prenotazioni_tavoli where evento_id = $1 and stato = 'in_attesa'", [altra])).n, 1);
}));

test('gara tavoli: il cliente con una richiesta pagata non ne ottiene altre, nemmeno insieme', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const tavoli = await Promise.all(Array.from({ length: 10 }, (_, i) => nuovoTavolo(db, eventoId, { nome: `P${i}` })));
  const prima = await prenota(db, tavoli[0], { email: 'pagata@esempio.it', telefono: '+39 333 5550000' });
  await confermaTavolo(db, prima.id, 'pi_pagata');
  const esiti = await insieme(9, (i) => prenota(db, tavoli[i + 1], { email: 'pagata@esempio.it', telefono: `+39 333 55500${i}1` }));
  assert.deepEqual(conta(esiti.map(esito)), { email_gia: 9 });
}));

test('gara tavoli: il PR può inserire più richieste, anche con la stessa email, ma sempre su tavoli diversi', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const tavoli = await Promise.all(Array.from({ length: 6 }, (_, i) => nuovoTavolo(db, eventoId, { nome: `T${i}` })));
  const esiti = await insieme(12, (i) => prenota(db, tavoli[i % 6], { inseritaDa: 'pr', email: 'cliente-del-pr@esempio.it', telefono: '+39 333 7654321' }));
  assert.deepEqual(conta(esiti.map(esito)), { creata: 6, tavolo_non_disponibile: 6 });
}));

test('gara tavoli: lo stesso webhook arrivato 20 volte insieme conferma una volta sola', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const tavolo = await nuovoTavolo(db, eventoId);
  const p = await prenota(db, tavolo);
  const esiti = await insieme(20, () => confermaTavolo(db, p.id, 'pi_tavolo'));
  assert.deepEqual(conta(esiti.map((e) => e.esito as string)), { confermata: 1, gia: 19 });
  assert.equal(await statoPrenotazione(db, p.id), 'confermata');
  assert.equal((await uno(db, 'select count(*)::int as n from public.pagamenti where prenotazione_id = $1', [p.id])).n, 1);
}));

test('gara tavoli: 20 pagamenti diversi sulla stessa prenotazione → uno conferma, 19 vanno restituiti', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const p = await prenota(db, await nuovoTavolo(db, eventoId));
  const esiti = await insieme(20, (i) => confermaTavolo(db, p.id, `pi_${i}`));
  assert.deepEqual(conta(esiti.map(esito)), { confermata: 1, 'da_rimborsare/secondo_pagamento': 19 });
  assert.equal((await uno(db, "select count(*)::int as n from public.pagamenti where prenotazione_id = $1 and ruolo = 'principale'", [p.id])).n, 1);
}));

test('gara tavoli: pagamento in ritardo e nuova richiesta insieme → il tavolo è di uno solo, mai di due', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  // Dieci volte, su tavoli diversi, per far venire fuori un eventuale blocco incrociato o un tavolo doppio.
  for (let giro = 0; giro < 10; giro++) {
    const tavolo = await nuovoTavolo(db, eventoId, { nome: `G${giro}` });
    const vecchia = await prenota(db, tavolo, { scade: tra(30) });                       // ha fino a tra 30 minuti
    const dopo = tra(45);                                                                 // ...ma ora è scaduta (non ancora segnata)
    const [paga, nuova] = await Promise.all([
      confermaTavolo(db, vecchia.id, `pi_${giro}`, { adesso: dopo }),
      prenota(db, tavolo, { adesso: dopo, scade: tra(75) }),
    ]);
    assert.equal(await attivePerTavolo(db, tavolo), 1, `giro ${giro}: un solo cliente tiene il tavolo`);
    const coppia = `${paga.esito}+${nuova.esito}`;
    // O ha vinto il pagamento (la nuova richiesta trova il tavolo preso), o ha vinto la nuova (il pagamento va restituito).
    assert.ok(coppia === 'confermata+tavolo_non_disponibile' || coppia === 'da_rimborsare+creata', `giro ${giro}: ${coppia}`);
    if (paga.esito === 'da_rimborsare') assert.equal(paga.motivo, 'ordine_chiuso');
  }
}));

test('gara tavoli: annulla e paga insieme → o è pagata o è annullata, mai le due cose', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  for (let giro = 0; giro < 8; giro++) {
    const p = await prenota(db, await nuovoTavolo(db, eventoId, { nome: `A${giro}` }));
    const [annulla, paga] = await Promise.all([annullaPrenotazione(db, p.id), confermaTavolo(db, p.id, `pi_a${giro}`)]);
    const coppia = `${annulla.esito}+${esito(paga)}`;
    assert.ok(coppia === 'annullata+da_rimborsare/ordine_chiuso' || coppia === 'pagata+confermata', `giro ${giro}: ${coppia}`);
    assert.equal(await statoPrenotazione(db, p.id), annulla.esito === 'annullata' ? 'annullata' : 'confermata');
  }
}));

test('gara tavoli: annullata 5 volte insieme, chiusa una volta sola', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const p = await prenota(db, await nuovoTavolo(db, eventoId));
  const esiti = await insieme(5, () => annullaPrenotazione(db, p.id));
  assert.deepEqual(conta(esiti.map((e) => e.esito as string)), { annullata: 1, gia_chiusa: 4 });
}));

test('gara tavoli: 12 passaggi alla porta per un tavolo da 4 → entrano 4, gli altri trovano il tavolo completo', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const p = await prenota(db, await nuovoTavolo(db, eventoId), { persone: 4 });
  await confermaTavolo(db, p.id, 'pi_porta');
  const esiti = await insieme(12, (i) => ingressoTavolo(db, p.id, `rif-${i}`, `P${i % 3}`));
  assert.deepEqual(conta(esiti.map((e) => e.esito as string)), { entrato: 4, completo: 8 });
  assert.equal((await uno(db, 'select count(*)::int as n from public.ingressi_tavoli where prenotazione_id = $1', [p.id])).n, 4);
}));

test('gara tavoli: la stessa sincronizzazione ripetuta 5 volte insieme conta una persona sola', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const p = await prenota(db, await nuovoTavolo(db, eventoId), { persone: 4 });
  await confermaTavolo(db, p.id, 'pi_rif');
  const esiti = await insieme(5, () => ingressoTavolo(db, p.id, 'stesso-rif'));
  assert.deepEqual(conta(esiti.map((e) => e.esito as string)), { entrato: 1, gia_contato: 4 });
  assert.equal((await uno(db, 'select count(*)::int as n from public.ingressi_tavoli where prenotazione_id = $1', [p.id])).n, 1);
}));

test('gara tavoli: il rimborso premuto due volte parte una volta sola, si conclude una volta sola e il tavolo torna libero', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const tavolo = await nuovoTavolo(db, eventoId);
  const p = await prenota(db, tavolo);
  await confermaTavolo(db, p.id, 'pi_rimb_t');
  const avvii = await insieme(2, (i) => avviaRimborso(db, 'pi_rimb_t', `chiave-${i}`));
  assert.deepEqual(conta(avvii.map((e) => e.esito as string)), { avviato: 1, in_corso: 1 });
  const fine: Json[] = await insieme(5, () => concludiRimborso(db, 'pi_rimb_t', tra(5)));
  assert.deepEqual(conta(fine.map((e) => e.esito as string)), { chiuso: 1, gia: 4 });
  assert.equal(fine.filter((e) => e.chiusa_ordine === true).length, 1, 'l\'email al cliente parte una volta sola');
  assert.equal(await statoPrenotazione(db, p.id), 'rimborsata');
  assert.equal((await prenota(db, tavolo, { adesso: tra(10), scade: tra(40) })).esito, 'creata', 'il tavolo è libero');
}));

test('gara tavoli: mescolando richieste, pagamenti, annullamenti, scadenze e passaggi non ci sono blocchi incrociati né errori', { skip: SALTA }, () => conAmbiente(async (db) => {
  const { eventoId } = await nuovaSerata(db, 10);
  const tavoli = await Promise.all(Array.from({ length: 8 }, (_, i) => nuovoTavolo(db, eventoId, { nome: `M${i}` })));
  const pronte = await Promise.all(tavoli.slice(0, 4).map((t) => prenota(db, t, { persone: 3 })));
  const lavori: Promise<unknown>[] = [
    ...pronte.map((p, i) => confermaTavolo(db, p.id, `pi_mix${i}`, { adesso: tra(10) })),
    ...pronte.map((p) => annullaPrenotazione(db, p.id)),
    ...tavoli.map((t) => prenota(db, t, { adesso: tra(40), scade: tra(70) })),
    ...tavoli.map((t) => prenota(db, t, { inseritaDa: 'pr', adesso: tra(41), scade: tra(71) })),
    ...pronte.map((p, i) => ingressoTavolo(db, p.id, `rif-mix-${i}`)),
    ...Array.from({ length: 4 }, () => uno(db, 'select public.scadenze_prenotazioni($1::timestamptz) as r', [tra(35)])),
    uno(db, 'select public.avvisi_chiusura($1::timestamptz) as r', [tra(35)]),
    uno(db, 'select public.promemoria_prenotazioni(3, $1::timestamptz) as r', [tra(35)]),
  ];
  const finiti = await Promise.allSettled(lavori);
  assert.deepEqual(finiti.filter((f) => f.status === 'rejected').map((f) => String((f as PromiseRejectedResult).reason)), []);
  // Il tavolo ha sempre al massimo un cliente.
  const doppi = await q(db, "select tavolo_id, count(*)::int as n from public.prenotazioni_tavoli where stato in ('in_attesa', 'confermata') group by 1 having count(*) > 1");
  assert.deepEqual(doppi, []);
}));
