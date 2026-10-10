// Test del livello dati su un archivio temporaneo (non tocca .data/).
// Si lancia con: npm test  (usa --conditions=react-server per i moduli 'server-only')
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cartella = mkdtempSync(path.join(tmpdir(), 'mm-test-'));
process.env.MM_CARTELLA_DATI = cartella;

type Mod = {
  archivio: typeof import('./archivio');
  pubblico: typeof import('./pubblico');
  areaPr: typeof import('./area-pr');
  porta: typeof import('./porta');
  gestione: typeof import('./gestione-pr');
  admin: typeof import('./admin');
};
let m: Mod;

before(async () => {
  m = {
    archivio: await import('./archivio'),
    pubblico: await import('./pubblico'),
    areaPr: await import('./area-pr'),
    porta: await import('./porta'),
    gestione: await import('./gestione-pr'),
    admin: await import('./admin'),
  };
});
after(() => rmSync(cartella, { recursive: true, force: true }));

async function sessione(email: string) {
  const d = await m.archivio.leggi();
  const utente = d.utenti.find((u) => u.email === email)!;
  return { utente, pr: utente.prId ? d.pr.find((p) => p.id === utente.prId)! : null };
}

test('prevendita: iscrizione, doppione, minorenne, lista del PR', async () => {
  const base = { slug: 'halloween-party', nome: 'Test', cognome: 'Doppio', dataNascita: '1999-01-01', email: 't@esempio.it', marketing: false };
  const ok = await m.pubblico.creaIscrizione({ ...base, handlePr: 'test-pr' });
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.iscrizione.importo, 10);
  const doppio = await m.pubblico.creaIscrizione({ ...base, handlePr: null, cognome: ' doppio ' });
  assert.ok(!doppio.ok && doppio.campo === 'cognome');
  const minore = await m.pubblico.creaIscrizione({ ...base, cognome: 'Giovane', dataNascita: '2010-01-01', handlePr: null });
  assert.ok(!minore.ok && minore.campo === 'nascita');
  const pr = (await m.archivio.leggi()).pr.find((p) => p.handle === 'test-pr')!;
  assert.equal(ok.ok && ok.iscrizione.prId, pr.id);
  const sconosciuto = await m.pubblico.creaIscrizione({ ...base, cognome: 'Altro', handlePr: 'non-esiste' });
  assert.equal(sconosciuto.ok && sconosciuto.iscrizione.prId, null, 'handle sconosciuto → Lista Maremma Musica');
});

test('area PR: vede solo i propri iscritti, non può toccare quelli degli altri', async () => {
  const s = await sessione('test-pr@maremmamusica.test');
  const serate = await m.areaPr.serateDelPr(s);
  const halloween = serate.find((x) => x.evento.slug === 'halloween-party')!;
  const d = await m.archivio.leggi();
  const mie = d.iscrizioni.filter((i) => i.prId === s.pr!.id && i.eventoId === halloween.evento.id).map((i) => i.id).sort();
  assert.deepEqual(halloween.mie.map((i) => i.id).sort(), mie);
  assert.ok(halloween.classifica.every((r) => r.incassato === null), 'niente incassi degli altri');
  const altrui = d.iscrizioni.find((i) => i.prId && i.prId !== s.pr!.id)!;
  await assert.rejects(m.areaPr.prSegnaPagato(s, altrui.id, true), /non_autorizzato/);
  const staff = await sessione('porta@maremmamusica.test');
  await assert.rejects(m.areaPr.serateDelPr(staff), /non_autorizzato/);
});

test('porta: QR falsificato non valido, doppio passaggio bloccato, PR non può fare check-in', async () => {
  const s = await sessione('porta@maremmamusica.test');
  const d = await m.archivio.leggi();
  const i = d.iscrizioni.find((x) => x.stato === 'pagato')!;
  const o = { incassa: false, metodo: 'porta_contanti' as const, porta: 'P1', ora: new Date().toISOString() };
  const falso = i.tokenQr.slice(0, -2) + 'xx';
  assert.equal((await m.porta.checkIn(s, i.eventoId, falso, o)).esito, 'non_valido');
  assert.equal((await m.porta.checkIn(s, i.eventoId, i.tokenQr, o)).esito, 'entrato');
  assert.equal((await m.porta.checkIn(s, i.eventoId, i.tokenQr, o)).esito, 'gia_entrato');
  const pr = await sessione('test-pr@maremmamusica.test');
  await assert.rejects(m.porta.checkIn(pr, i.eventoId, i.tokenQr, o), /non_autorizzato/);
});

test('attività PR: admin e staff sì (staff senza email dei PR), i PR no', async () => {
  const admin = await m.gestione.panoramicaPr(await sessione('admin@maremmamusica.test'), 'tutte');
  const staff = await m.gestione.panoramicaPr(await sessione('porta@maremmamusica.test'), 'tutte');
  assert.ok(admin.righe.some((r) => r.email), 'l’admin vede i contatti');
  assert.ok(staff.righe.every((r) => r.email === null), 'lo staff no');
  assert.deepEqual(staff.righe.map((r) => r.inLista), admin.righe.map((r) => r.inLista));
  const d = await m.archivio.leggi();
  const attesi = d.iscrizioni.filter((i) => i.prId && i.metodoPagamento === 'pr' && ['in_lista', 'pagato', 'entrato'].includes(i.stato)).reduce((t, i) => t + i.importo, 0);
  assert.equal(staff.totali.daRitirare, attesi, 'soldi da ritirare dai PR');
  await assert.rejects(m.gestione.panoramicaPr(await sessione('test-pr@maremmamusica.test'), null), /non_autorizzato/);
  await assert.rejects(m.gestione.dettaglioPr(await sessione('zarro@maremmamusica.test'), 'test-pr', null), /non_autorizzato/);
  const det = await m.gestione.dettaglioPr(await sessione('porta@maremmamusica.test'), 'zarro-pollicino', 'tutte');
  assert.ok(det && det.email === null && det.attivita.length > 0);
});

test('consegna dei soldi dal PR: staff conferma, il PR non può più togliere il pagato, solo l’admin annulla', async () => {
  const staff = await sessione('porta@maremmamusica.test');
  const admin = await sessione('admin@maremmamusica.test');
  const zarro = await sessione('zarro@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const halloween = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  // Zarro segna un altro cliente come pagato: ora ha 2 clienti pagati in mano
  const altro = d0.iscrizioni.find((i) => i.prId === zarro.pr!.id && i.stato === 'in_lista')!;
  await m.areaPr.prSegnaPagato(zarro, altro.id, true);
  const prima = (await m.gestione.dettaglioPr(staff, 'zarro-pollicino', halloween.id))!;
  assert.equal(prima.numeri.daRitirare, 20);

  await assert.rejects(m.gestione.confermaConsegna(staff, zarro.pr!.id, halloween.id, 10), /cifra è cambiata/, 'cifra sbagliata: si ferma');
  const c = await m.gestione.confermaConsegna(staff, zarro.pr!.id, halloween.id, 20);
  assert.equal(c.confermataDa, 'porta@maremmamusica.test');
  const dopo = (await m.gestione.dettaglioPr(staff, 'zarro-pollicino', halloween.id))!;
  assert.equal(dopo.numeri.daRitirare, 0);
  assert.equal(dopo.numeri.consegnato, 20);
  assert.equal(dopo.attivita[0].tipo, 'consegna');
  await assert.rejects(m.gestione.confermaConsegna(staff, zarro.pr!.id, halloween.id, 0), /niente da ritirare/);

  assert.equal(await m.areaPr.prSegnaPagato(zarro, altro.id, false), 'pagato', 'dopo la consegna il PR non torna indietro');
  await assert.rejects(m.gestione.confermaConsegna(zarro, zarro.pr!.id, halloween.id, 0), /non_autorizzato/);
  await assert.rejects(m.gestione.annullaConsegna(staff, c.id), /non_autorizzato/);
  await m.gestione.annullaConsegna(admin, c.id);
  assert.equal((await m.gestione.dettaglioPr(admin, 'zarro-pollicino', halloween.id))!.numeri.daRitirare, 20, 'annullata: torna da ritirare');
});

test('canali: chi arriva senza PR è contato per canale, staff lo vede, il PR no', async () => {
  const base = { slug: 'halloween-party', dataNascita: '1995-03-03', marketing: false, handlePr: null };
  const ig = await m.pubblico.creaIscrizione({ ...base, nome: 'Ada', cognome: 'Social', email: 'ada@esempio.it', canale: 'instagram' });
  const tt = await m.pubblico.creaIscrizione({ ...base, nome: 'Bea', cognome: 'Video', email: 'bea@esempio.it', canale: 'tiktok' });
  const nessuno = await m.pubblico.creaIscrizione({ ...base, nome: 'Cleo', cognome: 'Diretta', email: 'cleo@esempio.it' });
  assert.ok(ig.ok && tt.ok && nessuno.ok);
  assert.equal(nessuno.ok && nessuno.iscrizione.canale, 'diretto');
  const staff = await sessione('porta@maremmamusica.test');
  const c = await m.gestione.canaliSerata(staff, null);
  const conta = (k: string) => c.senzaPr.canali.find((r) => r.canale === k)?.inLista ?? 0;
  const d = await m.archivio.leggi();
  const atteso = (k: string) => d.iscrizioni.filter((i) => !i.prId && i.eventoId === c.evento!.id && i.canale === k && ['in_lista', 'pagato', 'entrato'].includes(i.stato)).length;
  assert.equal(conta('instagram'), atteso('instagram'));
  assert.ok(conta('tiktok') >= 1);
  assert.ok(c.senzaPr.canali.every((r) => r.canale), 'ogni iscrizione ha un canale');
  await assert.rejects(m.gestione.canaliSerata(await sessione('test-pr@maremmamusica.test'), null), /non_autorizzato/);
  const voce = (await m.porta.elencoPorta(staff, c.evento!.id)).find((v) => ig.ok && v.id === ig.iscrizione.id)!;
  assert.equal(voce.canale, 'instagram', 'alla porta si vede da dove è arrivato');
});

test('ingresso in cassa: niente email né QR, entra subito, non duplica, metriche a parte', async () => {
  const staff = await sessione('porta@maremmamusica.test');
  const admin = await sessione('admin@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const ev = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const o = { metodo: 'porta_pos' as const, porta: 'P2', ora: new Date().toISOString() };
  const primaLive = (await m.admin.serataLive(admin, ev.id))!;

  const r = await m.porta.registraCassa(staff, ev.id, 'tel-1', { nome: 'Walter', cognome: 'Incassa', dataNascita: '1990-04-04', importo: 15 }, o);
  assert.equal(r.esito, 'entrato');
  assert.equal(r.esito === 'entrato' && r.incassato, 15);
  const i = (await m.archivio.leggi()).iscrizioni.find((x) => x.rifCassa === 'tel-1')!;
  assert.equal(i.email, '');
  assert.equal(i.origine, 'cassa');
  assert.equal(i.stato, 'entrato');
  assert.equal(i.metodoPagamento, 'porta_pos');

  // La sincronizzazione ripetuta (risposta persa col campo che va e viene) non crea un doppione
  await m.porta.registraCassa(staff, ev.id, 'tel-1', { nome: 'Walter', cognome: 'Incassa', dataNascita: '1990-04-04', importo: 15 }, o);
  assert.equal((await m.archivio.leggi()).iscrizioni.filter((x) => x.rifCassa === 'tel-1').length, 1);

  const minore = await m.porta.registraCassa(staff, ev.id, 'tel-2', { nome: 'Tim', cognome: 'Piccolo', dataNascita: '2012-01-01', importo: 15 }, o);
  assert.equal(minore.esito, 'non_valido');
  const inLista = d0.iscrizioni.find((x) => x.eventoId === ev.id && x.stato === 'in_lista')!;
  const doppio = await m.porta.registraCassa(staff, ev.id, 'tel-3', { nome: inLista.nome, cognome: inLista.cognome.toUpperCase(), dataNascita: inLista.dataNascita, importo: 15 }, o);
  assert.ok(doppio.esito === 'non_valido' && /già in lista/.test(doppio.motivo), 'chi è in lista non si registra in cassa');

  const live = (await m.admin.serataLive(admin, ev.id))!;
  assert.equal(live.cassa.ingressi, primaLive.cassa.ingressi + 1);
  assert.equal(live.inLista, primaLive.inLista, 'la cassa non gonfia la lista');
  assert.equal(live.entrati, primaLive.entrati + 1);
  assert.equal(live.incassato, primaLive.incassato + 15);
  assert.ok(!live.classifica.some((c) => c.nome === 'Cassa'), 'la cassa non entra nella classifica PR');
  const voce = (await m.porta.elencoPorta(staff, ev.id)).find((v) => v.id === i.id)!;
  assert.equal(voce.origine, 'cassa');

  const pr = await sessione('test-pr@maremmamusica.test');
  await assert.rejects(m.porta.registraCassa(pr, ev.id, 'tel-4', { nome: 'X', cognome: 'Y', dataNascita: '1990-01-01', importo: 10 }, o), /non_autorizzato/);
});

test('tavoli: solo l’admin li crea e modifica, niente doppioni di nome nella stessa serata', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const ev = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const altra = d0.eventi.find((e) => e.slug !== 'halloween-party')!;
  const base = { eventoId: ev.id, nome: 'T1', zona: 'Privé', posti: 8, spesaMinima: 300, stato: 'libero' as const, nota: null, visibileDaPr: true, ordine: 0 };

  await m.admin.salvaTavolo(admin, base);
  await assert.rejects(m.admin.salvaTavolo(admin, { ...base, nome: ' t1 ' }), /già un tavolo/);
  await m.admin.salvaTavolo(admin, { ...base, eventoId: altra.id }); // stesso nome in un'altra serata: va bene
  await assert.rejects(m.admin.salvaTavolo(admin, { ...base, nome: 'T9', eventoId: 'non-esiste' }), /Serata non trovata/);
  await assert.rejects(m.admin.salvaTavolo(staff, { ...base, nome: 'T2' }), /non_autorizzato/);
  await assert.rejects(m.admin.salvaTavolo(pr, { ...base, nome: 'T2' }), /non_autorizzato/);

  const t = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli;
  assert.equal(t.length, 1);
  await m.admin.salvaTavolo(admin, { ...base, id: t[0].id, stato: 'riservato', nota: 'Rossi', spesaMinima: 350 });
  const dopo = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli[0];
  assert.deepEqual([dopo.stato, dopo.nota, dopo.spesaMinima], ['riservato', 'Rossi', 350]);

  await assert.rejects(m.admin.eliminaTavolo(staff, dopo.id), /non_autorizzato/);
  await m.admin.eliminaTavolo(admin, dopo.id);
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.length, 0);
  assert.equal((await m.admin.eventoAdmin(admin, altra.id))!.tavoli.length, 1, 'l’altra serata resta com’era');
});
