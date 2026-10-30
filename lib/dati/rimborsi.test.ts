// Test dei rimborsi: importo controllato, pagamenti doppi tra i "Da rimborsare", rimborso che non parte due volte, totali della serata.
// Archivio temporaneo come in permessi.test.ts (non tocca .data/). Si lancia con: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cartella = mkdtempSync(path.join(tmpdir(), 'mm-rimborsi-'));
process.env.MM_CARTELLA_DATI = cartella;

type Mod = {
  archivio: typeof import('./archivio');
  pubblico: typeof import('./pubblico');
  admin: typeof import('./admin');
  prevendita: typeof import('./prevendita');
  tavoli: typeof import('./tavoli');
  rimborsi: typeof import('./rimborsi');
  rimborso: typeof import('../rimborso');
  pagamenti: typeof import('../pagamenti');
  regole: typeof import('../regole');
};
let m: Mod;

before(async () => {
  m = {
    archivio: await import('./archivio'),
    pubblico: await import('./pubblico'),
    admin: await import('./admin'),
    prevendita: await import('./prevendita'),
    tavoli: await import('./tavoli'),
    rimborsi: await import('./rimborsi'),
    rimborso: await import('../rimborso'),
    pagamenti: await import('../pagamenti'),
    regole: await import('../regole'),
  };
});
after(() => rmSync(cartella, { recursive: true, force: true }));

async function sessione(email: string) {
  const d = await m.archivio.leggi();
  const utente = d.utenti.find((u) => u.email === email)!;
  return { utente, pr: utente.prId ? d.pr.find((p) => p.id === utente.prId)! : null };
}
const ORIGINE = 'http://prova';
const lista = (id: string) => ({ tipo: 'prevendita' as const, id });
const tavolo = (id: string) => ({ tipo: 'tavolo' as const, id });

/** Una serata nuova per ogni test: i conti non si mescolano. */
async function nuovaSerata(slug: string) {
  const admin = await sessione('admin@maremmamusica.test');
  const ev0 = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  const { id: _id, createdAt: _c, updatedAt: _u, piantinaUrl: _p, numero: _n, ...dati } = ev0;
  return m.admin.salvaEvento(admin, null, { ...dati, slug, nome: slug, pubblicato: true });
}
async function iscrivi(slug: string, cognome: string) {
  const r = await m.pubblico.creaIscrizione({ slug, handlePr: null, nome: 'Anna', cognome, dataNascita: '1995-03-14', email: `${cognome.toLowerCase()}@esempio.it`, marketing: false });
  assert.ok(r.ok);
  return r.ok ? r.iscrizione : null!;
}
async function prenota(eventoId: string, nome: string, spesa: number, n: number) {
  const admin = await sessione('admin@maremmamusica.test');
  await m.admin.salvaTavolo(admin, { eventoId, zona: null, posti: 6, spesaMinima: spesa, stato: 'libero', nota: null, visibileDaPr: true, prAbilitati: null, ordine: n, nome });
  const t = (await m.admin.eventoAdmin(admin, eventoId))!.tavoli.find((x) => x.nome === nome)!;
  const r = await m.tavoli.prenotaTavolo({ tavoloId: t.id, nome: 'Lia', cognome: nome, email: `${nome.toLowerCase()}@esempio.it`, telefono: `331 55500${String(n).padStart(2, '0')}`, persone: 4 }, null);
  assert.ok(r.ok);
  return r.ok ? r.prenotazione : null!;
}
const iscrizione = async (id: string) => (await m.archivio.leggi()).iscrizioni.find((i) => i.id === id)!;
const prenotazione = async (id: string) => (await m.archivio.leggi()).prenotazioni.find((p) => p.id === id)!;

test('importo: coincide solo se centesimi ed euro sono quelli del prezzo', () => {
  const { importoCorretto } = m.regole;
  assert.equal(importoCorretto(10, { centesimi: 1000, valuta: 'eur' }), true);
  assert.equal(importoCorretto(10, { centesimi: 1000, valuta: 'EUR' }), true, 'la valuta non distingue maiuscole');
  assert.equal(importoCorretto(10, { centesimi: 999, valuta: 'eur' }), false);
  assert.equal(importoCorretto(10, { centesimi: 1000, valuta: 'usd' }), false, 'valuta diversa');
  assert.equal(importoCorretto(10.5, { centesimi: 1050, valuta: 'eur' }), true, 'decimali senza errori di arrotondamento');
  assert.equal(importoCorretto(19.9, { centesimi: 1990, valuta: 'eur' }), true);
  assert.equal(importoCorretto(10, null), true, 'senza importo (pagina di prova) non c’è da confrontare');
});

test('importo sbagliato: la prevendita e il tavolo non si confermano, il pagamento va tra i rimborsi da fare', async () => {
  const ev = await nuovaSerata('importo-sbagliato');
  const admin = await sessione('admin@maremmamusica.test');

  // Prevendita da 10 € pagata 5 € (e poi in dollari): non conferma, resta in attesa
  const i = await iscrivi(ev.slug, 'Sbagliato');
  const poco = await m.prevendita.confermaPagamentoIscrizione(i.id, 'pi_poco', new Date(), { centesimi: 500, valuta: 'eur' });
  assert.deepEqual([poco.esito, poco.esito === 'da_rimborsare' && poco.motivo, poco.esito === 'da_rimborsare' && poco.importo], ['da_rimborsare', 'importo', 5]);
  const dopo = await iscrizione(i.id);
  assert.deepEqual([dopo.stato, dopo.metodoPagamento, dopo.pagamentoOnline!.pagamento], ['in_attesa', null, null], 'non conferma niente');
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(i.id, 'pi_poco', new Date(), { centesimi: 500, valuta: 'eur' })).esito, 'gia', 'lo stesso evento due volte non raddoppia');
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(i.id, 'pi_usd', new Date(), { centesimi: 1000, valuta: 'usd' })).esito, 'da_rimborsare');
  // Poi paga giusto: si conferma, e i due sbagliati restano da restituire
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(i.id, 'pi_giusto', new Date(), { centesimi: 1000, valuta: 'eur' })).esito, 'confermata');
  const voci = m.rimborsi.vociRimborso(await m.archivio.leggi()).filter((v) => v.eventoId === ev.id);
  assert.deepEqual(voci.map((v) => [v.bersaglio.pagamento, v.motivo, v.importo, v.stato]).sort(), [['pi_poco', 'importo', 5, 'da_rimborsare'], ['pi_usd', 'importo', 10, 'da_rimborsare']]);

  // Tavolo da 200 € pagato 150 €
  const p = await prenota(ev.id, 'Importo', 200, 1);
  const t = await m.tavoli.confermaPagamentoOnline(p.id, 'pi_t_poco', new Date(), { centesimi: 15000, valuta: 'eur' });
  assert.deepEqual([t.esito, t.esito === 'da_rimborsare' && t.motivo], ['da_rimborsare', 'importo']);
  assert.equal((await prenotazione(p.id)).stato, 'in_attesa', 'il tavolo non si conferma');
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((x) => x.nome === 'Importo')!.stato, 'riservato');
  assert.equal((await m.admin.serataLive(admin, ev.id))!.rimborsi.n, 3);
});

test('doppio pagamento: compare tra i rimborsi con importo, persona e motivo; l’ordine resta valido', async () => {
  const ev = await nuovaSerata('doppio-pagamento');
  const admin = await sessione('admin@maremmamusica.test');
  const i = await iscrivi(ev.slug, 'Doppio');
  await m.prevendita.confermaPagamentoIscrizione(i.id, 'prova_primo');
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(i.id, 'prova_secondo')).esito, 'da_rimborsare');
  const p = await prenota(ev.id, 'Doppione', 250, 2);
  await m.tavoli.confermaPagamentoOnline(p.id, 'prova_t1');
  assert.equal((await m.tavoli.confermaPagamentoOnline(p.id, 'prova_t2')).esito, 'da_rimborsare');

  const { daFare, fatti } = await m.rimborsi.rimborsiAdmin(admin, { eventoId: ev.id });
  assert.deepEqual(daFare.map((v) => [v.bersaglio.tipo, v.persona, v.importo, v.motivo, v.stato]).sort(),
    [['prevendita', 'Anna Doppio', 10, 'secondo_pagamento', 'da_rimborsare'], ['tavolo', 'Lia Doppione · tavolo Doppione', 250, 'secondo_pagamento', 'da_rimborsare']]);
  assert.equal(fatti.length, 0);
  assert.equal((await iscrizione(i.id)).stato, 'pagato', 'il QR vale ancora');
  assert.equal((await prenotazione(p.id)).stato, 'confermata');
  const live = (await m.admin.serataLive(admin, ev.id))!;
  assert.deepEqual([live.rimborsi.n, live.rimborsi.importo], [2, 260]);

  // Si rimborsa solo il pagamento in più: l’ordine non cambia
  await m.rimborso.rimborsaPagamento(admin, { ...lista(i.id), pagamento: 'prova_secondo' }, ORIGINE);
  assert.equal((await iscrizione(i.id)).stato, 'pagato');
  assert.equal((await iscrizione(i.id)).pagamentoOnline!.pagamento, 'prova_primo');
  const dopo = await m.rimborsi.rimborsiAdmin(admin, { eventoId: ev.id });
  assert.deepEqual([dopo.daFare.length, dopo.fatti.length], [1, 1]);
  assert.equal(m.admin.daRimborsareAncora(await iscrizione(i.id)), false);
  // Il filtro dei motivi
  assert.equal((await m.rimborsi.rimborsiAdmin(admin, { motivo: 'importo' })).daFare.some((v) => v.eventoId === ev.id), false);
});

test('rimborso ripetuto: doppio clic e nuovo tentativo non lo fanno partire due volte', async () => {
  const ev = await nuovaSerata('rimborso-ripetuto');
  const admin = await sessione('admin@maremmamusica.test');
  const altroAdmin = admin;
  const i = await iscrivi(ev.slug, 'Ripetuto');
  await m.prevendita.confermaPagamentoIscrizione(i.id, 'prova_r1');

  // Doppio clic (o due admin insieme): una sola richiesta va avanti, l’altra viene fermata
  const esiti = await Promise.allSettled([m.rimborso.rimborsaPagamento(admin, lista(i.id), ORIGINE), m.rimborso.rimborsaPagamento(altroAdmin, lista(i.id), ORIGINE)]);
  assert.equal(esiti.filter((e) => e.status === 'fulfilled').length, 1);
  assert.match(String((esiti.find((e) => e.status === 'rejected') as PromiseRejectedResult).reason), /già in corso/);
  const fatto = await iscrizione(i.id);
  assert.deepEqual([fatto.stato, fatto.pagamentoOnline!.rimborso!.stato, fatto.pagamentoOnline!.daRimborsare], ['rimborsato', 'fatto', false]);
  // Un clic dopo: già rimborsato, niente da fare
  assert.deepEqual(await m.rimborso.rimborsaPagamento(admin, lista(i.id), ORIGINE), { gia: true });
  assert.equal((await m.rimborsi.avviaRimborso(admin, lista(i.id))).esito, 'gia');

  // Lo stato "in corso" ha una chiave che non cambia ai tentativi dopo un errore incerto; dopo un rifiuto netto la chiave è nuova
  const j = await iscrivi(ev.slug, 'Chiave');
  await m.prevendita.confermaPagamentoIscrizione(j.id, 'prova_r2');
  const adesso = new Date();
  const a1 = await m.rimborsi.avviaRimborso(admin, lista(j.id), adesso);
  assert.equal(a1.esito, 'avviato');
  await assert.rejects(m.rimborsi.avviaRimborso(admin, lista(j.id), new Date(adesso.getTime() + 5_000)), /già in corso/);
  const a2 = await m.rimborsi.avviaRimborso(admin, lista(j.id), new Date(adesso.getTime() + 60_000));
  assert.deepEqual([a2.esito, a2.esito === 'avviato' && a2.chiave], ['avviato', a1.esito === 'avviato' && a1.chiave], 'stessa chiave al nuovo tentativo');
  await m.rimborsi.rimborsoRespinto(admin, lista(j.id));
  const a3 = await m.rimborsi.avviaRimborso(admin, lista(j.id), new Date(adesso.getTime() + 61_000));
  assert.notEqual(a3.esito === 'avviato' && a3.chiave, a1.esito === 'avviato' && a1.chiave, 'dopo un rifiuto netto si riparte con una chiave nuova');
  assert.equal((await iscrizione(j.id)).stato, 'pagato', 'finché non è rimborsato l’ordine resta com’è');
});

test('rimborso con Stripe: chiave di idempotenza, errore di rete, rifiuto e “già rimborsato”', async () => {
  const ev = await nuovaSerata('rimborso-stripe');
  const admin = await sessione('admin@maremmamusica.test');
  const vera = globalThis.fetch;
  process.env.STRIPE_SECRET_KEY = 'sk_test_prova';
  const chiamate: { url: string; chiave: string | null; corpo: string }[] = [];
  let risposte: (() => Response | Promise<Response>)[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    chiamate.push({ url, chiave: new Headers(init?.headers).get('Idempotency-Key'), corpo: String(init?.body) });
    const prossima = risposte.shift();
    if (!prossima) throw new Error('chiamata non prevista');
    return prossima();
  }) as typeof fetch;
  const json = (stato: number, corpo: unknown) => () => new Response(JSON.stringify(corpo), { status: stato });
  try {
    const i = await iscrivi(ev.slug, 'Stripe');
    await m.prevendita.confermaPagamentoIscrizione(i.id, 'pi_stripe_1');

    // 1) la rete cade: non si sa se è partito, l’iscrizione resta com’è e il rimborso è "in corso"
    risposte = [() => { throw new TypeError('fetch failed'); }];
    await assert.rejects(m.rimborso.rimborsaPagamento(admin, lista(i.id), ORIGINE), /Non so se il rimborso è partito/);
    assert.deepEqual([(await iscrizione(i.id)).stato, (await iscrizione(i.id)).pagamentoOnline!.rimborso!.stato], ['pagato', 'in_corso']);
    // 2) riprova dopo un po’ con la stessa chiave: Stripe lo fa una volta sola
    await m.archivio.modifica((d) => { d.iscrizioni.find((x) => x.id === i.id)!.pagamentoOnline!.rimborso!.avviatoAt = new Date(Date.now() - 120_000).toISOString(); });
    risposte = [json(200, { id: 're_1' })];
    assert.deepEqual(await m.rimborso.rimborsaPagamento(admin, lista(i.id), ORIGINE), { gia: false });
    assert.equal(chiamate.length, 2);
    assert.ok(chiamate[0].chiave?.startsWith('mm-rimborso-') && chiamate[0].chiave === chiamate[1].chiave, 'stessa chiave di idempotenza');
    assert.deepEqual([chiamate[1].url, chiamate[1].corpo], ['https://api.stripe.com/v1/refunds', 'payment_intent=pi_stripe_1']);
    assert.equal((await iscrizione(i.id)).stato, 'rimborsato');
    // 3) altro clic: non chiama più Stripe
    assert.deepEqual(await m.rimborso.rimborsaPagamento(admin, lista(i.id), ORIGINE), { gia: true });
    assert.equal(chiamate.length, 2);

    // Rifiuto netto di Stripe (4xx): l’ordine resta com’è e non resta nulla "in corso"
    const j = await iscrivi(ev.slug, 'Rifiuto');
    await m.prevendita.confermaPagamentoIscrizione(j.id, 'pi_stripe_2');
    risposte = [json(400, { error: { message: 'No such payment_intent', code: 'resource_missing' } })];
    await assert.rejects(m.rimborso.rimborsaPagamento(admin, lista(j.id), ORIGINE), /No such payment_intent/);
    assert.deepEqual([(await iscrizione(j.id)).stato, (await iscrizione(j.id)).pagamentoOnline!.rimborso ?? null], ['pagato', null]);
    // Stripe dice che era già stato restituito (per esempio dalla Dashboard): si considera fatto
    risposte = [json(400, { error: { message: 'Charge already refunded', code: 'charge_already_refunded' } })];
    assert.deepEqual(await m.rimborso.rimborsaPagamento(admin, lista(j.id), ORIGINE), { gia: false });
    assert.equal((await iscrizione(j.id)).stato, 'rimborsato');
  } finally {
    globalThis.fetch = vera;
    delete process.env.STRIPE_SECRET_KEY;
  }
});

test('webhook: importo sbagliato non conferma, charge.refunded registra il rimborso una volta sola', async () => {
  const ev = await nuovaSerata('webhook');
  const admin = await sessione('admin@maremmamusica.test');
  const { POST } = await import('../../app/api/pagamenti/stripe/route');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_prova';
  const invia = async (corpo: object) => {
    const testo = JSON.stringify(corpo);
    const t = Math.floor(Date.now() / 1000);
    const firma = createHmac('sha256', 'whsec_prova').update(`${t}.${testo}`).digest('hex');
    const r = await POST(new Request('http://prova/api/pagamenti/stripe', { method: 'POST', body: testo, headers: { 'stripe-signature': `t=${t},v1=${firma}` } }));
    return r.status;
  };
  const sessionePagata = (iscrizione: string, centesimi: number, pi: string, valuta = 'eur') => ({
    type: 'checkout.session.completed',
    data: { object: { id: `cs_${pi}`, payment_status: 'paid', payment_intent: pi, metadata: { iscrizione }, amount_total: centesimi, currency: valuta } },
  });

  const i = await iscrivi(ev.slug, 'Webhook');
  assert.equal(await invia(sessionePagata(i.id, 800, 'pi_wh_poco')), 200);
  assert.equal((await iscrizione(i.id)).stato, 'in_attesa', 'importo sbagliato: non confermata');
  assert.equal(m.rimborsi.vociRimborso(await m.archivio.leggi()).filter((v) => v.eventoId === ev.id && v.motivo === 'importo').length, 1);
  assert.equal(await invia(sessionePagata(i.id, 1000, 'pi_wh_ok')), 200);
  assert.equal((await iscrizione(i.id)).stato, 'pagato', 'importo giusto: confermata');
  assert.equal(await invia(sessionePagata(i.id, 1000, 'pi_wh_ok')), 200, 'stesso evento due volte');
  assert.equal((await iscrizione(i.id)).pagamentoOnline!.inPiu!.length, 1);

  // Rimborso fatto dalla Dashboard di Stripe: l’iscrizione si chiude, e un secondo avviso non cambia niente
  const rimborsato = { type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_wh_ok', refunded: true, amount_refunded: 1000 } } };
  assert.equal(await invia(rimborsato), 200);
  assert.deepEqual([(await iscrizione(i.id)).stato, (await iscrizione(i.id)).pagamentoOnline!.rimborso!.stato], ['rimborsato', 'fatto']);
  const quando = (await iscrizione(i.id)).pagamentoOnline!.rimborso!.fattoAt;
  assert.equal(await invia(rimborsato), 200);
  assert.equal((await iscrizione(i.id)).pagamentoOnline!.rimborso!.fattoAt, quando, 'registrato una volta sola');
  assert.deepEqual(await m.rimborso.rimborsaPagamento(admin, lista(i.id), ORIGINE), { gia: true }, 'dopo il webhook il pulsante non rimborsa di nuovo');
  // Rimborso parziale: non chiude niente
  const j = await iscrivi(ev.slug, 'Parziale');
  await invia(sessionePagata(j.id, 1000, 'pi_wh_parz'));
  await invia({ type: 'charge.refunded', data: { object: { id: 'ch_2', payment_intent: 'pi_wh_parz', refunded: false, amount_refunded: 300 } } });
  assert.equal((await iscrizione(j.id)).stato, 'pagato');
  // Senza firma giusta il webhook non fa niente
  const senza = await POST(new Request('http://prova/api/pagamenti/stripe', { method: 'POST', body: JSON.stringify(rimborsato), headers: { 'stripe-signature': 't=1,v1=00' } }));
  assert.equal(senza.status, 400);
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

test('totali della serata: lordo, rimborsato, netto, prevendite per tipo, tavoli pagati, entrati', async () => {
  const ev = await nuovaSerata('totali');
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const vuoti = (await m.admin.serataLive(admin, ev.id))!.soldi;
  assert.deepEqual([vuoti.lordo, vuoti.rimborsato, vuoti.netto], [0, 0, 0]);

  // Tre prevendite da 10 €: una rimborsata, una con un secondo pagamento (10 € ancora da restituire)
  const [a, b, c] = [await iscrivi(ev.slug, 'Alfa'), await iscrivi(ev.slug, 'Beta'), await iscrivi(ev.slug, 'Gamma')];
  for (const x of [a, b, c]) await m.prevendita.confermaPagamentoIscrizione(x.id, `prova_${x.cognome}`);
  await m.prevendita.confermaPagamentoIscrizione(b.id, 'prova_Beta_bis');
  await m.rimborso.rimborsaPagamento(admin, lista(a.id), ORIGINE);
  // Un tavolo da 200 € pagato e uno da 100 € pagato e rimborsato
  const t1 = await prenota(ev.id, 'Uno', 200, 3);
  const t2 = await prenota(ev.id, 'Due', 100, 4);
  await m.tavoli.confermaPagamentoOnline(t1.id, 'prova_t1');
  await m.tavoli.confermaPagamentoOnline(t2.id, 'prova_t2');
  await m.rimborso.rimborsaPagamento(admin, tavolo(t2.id), ORIGINE);
  // Uno entra alla porta
  const gamma = await iscrizione(c.id);
  assert.equal((await m.archivio.leggi()).iscrizioni.find((x) => x.id === c.id)!.stato, 'pagato');
  const { checkIn } = await import('./porta');
  assert.equal((await checkIn(staff, ev.id, gamma.tokenQr, { porta: 'P1', ora: new Date().toISOString() })).esito, 'entrato');

  const live = (await m.admin.serataLive(admin, ev.id))!;
  // lordo = 3 × 10 + 10 (secondo pagamento) + 200 + 100 = 340; rimborsato = 10 + 100 = 110; netto = 230, di cui 10 € ancora da restituire
  assert.deepEqual(live.soldi, { lordo: 340, rimborsato: 110, netto: 230, daRestituire: 10, prevendite: 40, tavoli: 300, porta: 0 });
  assert.deepEqual([live.rimborsi.n, live.rimborsi.importo], [1, 10]);
  assert.deepEqual([live.inLista, live.entrati, live.tavoli.pagati, live.tavoli.incassato], [2, 1, 1, 200]);
  assert.equal(live.perTipo.reduce((t, x) => t + x.venduti, 0), 2, 'le prevendite vendute non contano la rimborsata');
  // Dopo aver restituito anche il secondo pagamento: tutto rimborsato e niente più da restituire
  await m.rimborso.rimborsaPagamento(admin, { ...lista(b.id), pagamento: 'prova_Beta_bis' }, ORIGINE);
  const dopo = (await m.admin.serataLive(admin, ev.id))!.soldi;
  assert.deepEqual([dopo.lordo, dopo.rimborsato, dopo.netto, dopo.daRestituire], [340, 120, 220, 0]);
});

test('annulla senza rimborso solo per ciò che non è pagato', async () => {
  const ev = await nuovaSerata('annulla-solo-non-pagato');
  const admin = await sessione('admin@maremmamusica.test');
  const pagata = await iscrivi(ev.slug, 'Pagata');
  await m.prevendita.confermaPagamentoIscrizione(pagata.id, 'prova_pagata');
  await assert.rejects(m.admin.cambiaStatoIscrizione(admin, pagata.id, 'annulla'), /Annulla e rimborsa/);
  assert.equal((await iscrizione(pagata.id)).stato, 'pagato');
  // Una non pagata (in lista gratis, o dati di prova) si annulla senza rimborso
  await m.archivio.modifica((d) => { const x = d.iscrizioni.find((y) => y.id === pagata.id)!; x.stato = 'in_lista'; x.metodoPagamento = null; });
  await m.admin.cambiaStatoIscrizione(admin, pagata.id, 'annulla');
  assert.equal((await iscrizione(pagata.id)).stato, 'annullato');
  // Un tavolo in attesa si annulla; uno pagato no
  const p = await prenota(ev.id, 'Libero', 150, 5);
  await m.tavoli.annullaPrenotazione(admin, p.id);
  assert.equal((await prenotazione(p.id)).stato, 'annullata');
  const q = await prenota(ev.id, 'Pagato', 150, 6);
  await m.tavoli.confermaPagamentoOnline(q.id, 'prova_q');
  await assert.rejects(m.tavoli.annullaPrenotazione(admin, q.id), /Annulla e rimborsa/);
});
