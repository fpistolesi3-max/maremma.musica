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
  prevendita: typeof import('./prevendita');
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
    prevendita: await import('./prevendita'),
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
  assert.equal(ok.ok && ok.iscrizione.stato, 'in_attesa', 'a pagamento: vale solo dopo il pagamento online');
  // Ci riprova prima di pagare: riprende la stessa iscrizione, non ne fa un'altra
  const ancora = await m.pubblico.creaIscrizione({ ...base, handlePr: null, cognome: ' doppio ' });
  assert.ok(ancora.ok && ok.ok && ancora.iscrizione.id === ok.iscrizione.id);
  const altraEmail = await m.pubblico.creaIscrizione({ ...base, handlePr: null, email: 'altra@esempio.it' });
  assert.ok(!altraEmail.ok && altraEmail.campo === 'email');
  assert.ok(ok.ok && (await m.prevendita.confermaPagamentoIscrizione(ok.iscrizione.id, 'prova_t1')).esito === 'confermata');
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
  assert.ok(halloween.classifica.every((r) => r.incassato === null), 'niente incassi degli altri');
  // Il PR vede solo chi ha pagato: chi ha chiesto la prevendita senza pagarla non c'è
  const mie = d.iscrizioni.filter((i) => i.prId === s.pr!.id && i.eventoId === halloween.evento.id && i.stato !== 'in_attesa' && i.stato !== 'scaduta').map((i) => i.id).sort();
  assert.deepEqual(halloween.mie.map((i) => i.id).sort(), mie);
  assert.ok(halloween.mie.every((i) => i.stato !== 'in_attesa'));
  const staff = await sessione('porta@maremmamusica.test');
  await assert.rejects(m.areaPr.serateDelPr(staff), /non_autorizzato/);
});

test('porta: QR falsificato non valido, doppio passaggio bloccato, PR non può fare check-in', async () => {
  const s = await sessione('porta@maremmamusica.test');
  const d = await m.archivio.leggi();
  const i = d.iscrizioni.find((x) => x.stato === 'pagato')!;
  const o = { porta: 'P1', ora: new Date().toISOString() };
  const falso = i.tokenQr.slice(0, -2) + 'xx';
  assert.equal((await m.porta.checkIn(s, i.eventoId, falso, o)).esito, 'non_valido');
  assert.equal((await m.porta.checkIn(s, i.eventoId, i.tokenQr, o)).esito, 'entrato');
  assert.equal((await m.porta.checkIn(s, i.eventoId, i.tokenQr, o)).esito, 'gia_entrato');
  const pr = await sessione('test-pr@maremmamusica.test');
  await assert.rejects(m.porta.checkIn(pr, i.eventoId, i.tokenQr, o), /non_autorizzato/);
});

test('porta: categoria da confermare, "Non rientra" salvato, solo lo staff, si può comunque far entrare', async () => {
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const i = d0.iscrizioni.find((x) => x.stato === 'pagato' && x.origine === 'lista')!;
  await m.archivio.modifica((d) => { d.iscrizioni.find((x) => x.id === i.id)!.categoria = 'Donne'; });
  const o = { porta: 'P1', ora: new Date().toISOString() };
  assert.equal((await m.porta.checkIn(staff, i.eventoId, i.tokenQr, o)).esito, 'da_confermare', 'senza conferma non entra');
  assert.equal((await m.archivio.leggi()).iscrizioni.find((x) => x.id === i.id)!.stato, 'pagato');
  await assert.rejects(m.porta.rifiutaIngresso(pr, i.eventoId, i.tokenQr, { porta: 'P1', ora: o.ora }), /non_autorizzato/);
  assert.equal((await m.porta.rifiutaIngresso(staff, i.eventoId, i.tokenQr, { porta: 'P1', ora: o.ora })).esito, 'rifiutato');
  const dopo = (await m.archivio.leggi()).iscrizioni.find((x) => x.id === i.id)!;
  assert.equal(dopo.stato, 'pagato', 'l’iscrizione resta valida');
  assert.equal(dopo.rifiutoIngresso?.porta, 'P1');
  assert.equal(dopo.rifiutoIngresso?.da, staff.utente.email);
  const voce = (await m.porta.elencoPorta(staff, i.eventoId)).find((v) => v.id === i.id)!;
  assert.equal(voce.rifiuto?.porta, 'P1', 'il rifiuto arriva a tutte le porte');
  const live = await m.admin.serataLive(await sessione('admin@maremmamusica.test'), i.eventoId);
  assert.equal(live!.rifiuti.some((r) => r.id === i.id), true, 'l’admin lo vede nella serata');
  assert.equal((await m.porta.checkIn(staff, i.eventoId, i.tokenQr, { ...o, confermato: true })).esito, 'entrato', 'ripassato: si può comunque far entrare');
  assert.equal((await m.porta.rifiutaIngresso(staff, i.eventoId, i.tokenQr, { porta: 'P1', ora: o.ora })).esito, 'gia_entrato', 'già entrato: nessun rifiuto');
});

test('attività PR e canali: solo admin (lo staff vede solo la porta), i PR no', async () => {
  const admin = await m.gestione.panoramicaPr(await sessione('admin@maremmamusica.test'), 'tutte');
  assert.ok(admin.righe.some((r) => r.email), 'l’admin vede i contatti');
  const d = await m.archivio.leggi();
  const attesi = d.iscrizioni.filter((i) => i.prId && i.metodoPagamento === 'online' && ['in_lista', 'pagato', 'entrato'].includes(i.stato)).reduce((t, i) => t + i.importo, 0);
  assert.equal(admin.totali.incassatoOnline, attesi, 'prevendita dei PR pagata online');
  assert.ok(!('daRitirare' in admin.totali), 'niente più soldi da ritirare dai PR');
  const det = await m.gestione.dettaglioPr(await sessione('admin@maremmamusica.test'), 'zarro-pollicino', 'tutte');
  assert.ok(det && det.attivita.length > 0);
  for (const chi of ['porta@maremmamusica.test', 'test-pr@maremmamusica.test', 'zarro@maremmamusica.test']) {
    const s = await sessione(chi);
    await assert.rejects(m.gestione.panoramicaPr(s, 'tutte'), /non_autorizzato/, chi);
    await assert.rejects(m.gestione.dettaglioPr(s, 'zarro-pollicino', 'tutte'), /non_autorizzato/, chi);
    await assert.rejects(m.gestione.canaliSerata(s, 'tutte'), /non_autorizzato/, chi);
  }
});

test('prevendita online: posto fermo, pagamento, ritardo da rimborsare, porta, permessi', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const zarro = await sessione('zarro@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const halloween = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const base = { slug: 'halloween-party', dataNascita: '1996-02-02', marketing: false, handlePr: 'zarro-pollicino' };
  const r = await m.pubblico.creaIscrizione({ ...base, nome: 'Paola', cognome: 'Paga', email: 'paola@esempio.it' });
  assert.ok(r.ok);
  const id = r.ok ? r.iscrizione.id : '';
  assert.ok(r.ok && r.iscrizione.scade && r.iscrizione.pagamentoOnline, 'termine per pagare e pagamento online');

  // Prima di pagare: niente QR alla porta, non conta per il PR né in classifica
  const o = { porta: 'P1', ora: new Date().toISOString() };
  assert.equal((await m.porta.checkIn(staff, halloween.id, id, o)).esito, 'non_pagato');
  const live0 = (await m.admin.serataLive(admin, halloween.id))!;
  assert.ok(live0.prevendita.inAttesa >= 1);
  const prima = live0.classifica.find((c) => c.prId === zarro.pr!.id)!.inLista;
  assert.ok(!(await m.areaPr.serateDelPr(zarro)).find((x) => x.evento.id === halloween.id)!.mie.some((i) => i.id === id));

  // Solo id + email giusti aprono il pagamento
  assert.equal(await m.prevendita.iscrizioneDaPagare(id, 'altro@esempio.it'), null);
  assert.ok(await m.prevendita.iscrizioneDaPagare(id, 'PAOLA@esempio.it'));

  // Pagamento (webhook): vale una volta sola anche se arriva due volte
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(id, 'pi_lista_1')).esito, 'confermata');
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(id, 'pi_lista_1')).esito, 'gia');
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(id, 'pi_lista_doppio')).esito, 'gia', 'secondo pagamento: il QR resta valido');
  const pagata = (await m.archivio.leggi()).iscrizioni.find((i) => i.id === id)!;
  assert.deepEqual([pagata.stato, pagata.metodoPagamento, pagata.pagamentoOnline!.pagamento], ['pagato', 'online', 'pi_lista_1']);
  const live1 = (await m.admin.serataLive(admin, halloween.id))!;
  assert.equal(live1.classifica.find((c) => c.prId === zarro.pr!.id)!.inLista, prima + 1, 'conta per il PR del link');
  assert.equal(live1.prevendita.incassato, live0.prevendita.incassato + 10);
  assert.equal((await m.porta.checkIn(staff, halloween.id, pagata.tokenQr, o)).esito, 'entrato');

  // Non paga in tempo: scade e il posto torna libero; il pagamento che arriva dopo vale se c'è ancora posto
  const t = await m.pubblico.creaIscrizione({ ...base, nome: 'Tito', cognome: 'Tardi', email: 'tito@esempio.it' });
  const tid = t.ok ? t.iscrizione.id : '';
  await m.archivio.modifica((d) => { d.iscrizioni.find((i) => i.id === tid)!.scade = new Date(Date.now() - 1000).toISOString(); });
  await m.prevendita.applicaScadenzeIscrizioni();
  assert.equal((await m.archivio.leggi()).iscrizioni.find((i) => i.id === tid)!.stato, 'scaduta');
  assert.ok(!(await m.porta.elencoPorta(staff, halloween.id)).some((v) => v.id === tid), 'le scadute non vanno alla porta');
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(tid, 'pi_tardi')).esito, 'confermata', 'lotto senza limite: vale');

  // Lotto pieno nel frattempo: il pagamento tardivo va restituito
  const u = await m.pubblico.creaIscrizione({ ...base, nome: 'Ugo', cognome: 'Ultimo', email: 'ugo@esempio.it' });
  const uid = u.ok ? u.iscrizione.id : '';
  await m.archivio.modifica((d) => {
    const i = d.iscrizioni.find((x) => x.id === uid)!;
    i.stato = 'scaduta';
    const l = d.lotti.find((x) => x.id === i.lottoId)!;
    l.quantita = d.iscrizioni.filter((x) => x.lottoId === l.id && ['in_lista', 'pagato', 'entrato'].includes(x.stato)).length;
  });
  assert.equal((await m.prevendita.confermaPagamentoIscrizione(uid, 'pi_ugo')).esito, 'da_rimborsare');
  assert.equal((await m.archivio.leggi()).iscrizioni.find((i) => i.id === uid)!.stato, 'scaduta', 'non diventa valida');
  assert.equal((await m.admin.serataLive(admin, halloween.id))!.prevendita.daRimborsare.n, 1);
  // Il rimborso lo fa solo l'admin
  await assert.rejects(m.prevendita.pagamentoIscrizioneDi(staff, uid), /non_autorizzato/);
  await assert.rejects(m.prevendita.chiudiRimborsoIscrizione(zarro, uid), /non_autorizzato/);
  assert.equal(await m.prevendita.pagamentoIscrizioneDi(admin, uid), 'pi_ugo');
  assert.equal((await m.prevendita.chiudiRimborsoIscrizione(admin, uid))!.stato, 'rimborsato');
  await m.archivio.modifica((d) => { d.lotti.find((x) => x.eventoId === halloween.id)!.quantita = null; });

  // Lascia il posto senza pagare: non si può riattivare (sarebbe un QR regalato)
  const v = await m.pubblico.creaIscrizione({ ...base, nome: 'Vera', cognome: 'Via', email: 'vera@esempio.it' });
  const vid = v.ok ? v.iscrizione.id : '';
  assert.equal(await m.prevendita.lasciaPosto(vid, 'altro@esempio.it'), false);
  assert.equal(await m.prevendita.lasciaPosto(vid, 'vera@esempio.it'), true);
  await assert.rejects(m.admin.cambiaStatoIscrizione(admin, vid, 'ripristina'), /mai stata pagata/);
});

test('orario limite della prevendita: default 01:00, modificabile per serata, arriva alla porta e il server lo fa rispettare', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const ev = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const l01 = new Date('2026-11-01T01:00:00+01:00').toISOString(); // apre il 31.10 alle 22:00: l'1 della notte dopo
  assert.equal(ev.prevenditaFinoAlle, undefined, 'le serate vecchie non hanno il campo: vale il default');
  assert.equal(await m.porta.limitePorta(staff, ev.id), l01);
  assert.equal((await m.porta.eventiPorta(staff)).find((e) => e.id === ev.id)!.limite, l01);
  await assert.rejects(m.porta.limitePorta(pr, ev.id), /non_autorizzato/);
  assert.equal((await m.admin.serataLive(admin, ev.id))!.prevenditaFinoAlle, l01, 'l’admin lo vede nella serata live');

  // L'admin lo cambia per la serata: arriva alla porta alla sincronizzazione successiva.
  const { id: _id, createdAt: _c, updatedAt: _u, piantinaUrl: _p, ...dati } = ev;
  const l0130 = new Date('2026-11-01T01:30:00+01:00').toISOString();
  await m.admin.salvaEvento(admin, ev.id, { ...dati, prevenditaFinoAlle: l0130 });
  assert.equal(await m.porta.limitePorta(staff, ev.id), l0130);

  // Il server rifà il controllo: un QR pagato dopo il limite non entra, uno fatto offline prima del limite sì (conta l'orario vero).
  await m.admin.salvaEvento(admin, ev.id, { ...dati, prevenditaFinoAlle: '2026-10-01T00:00:00.000Z' });
  const i = d0.iscrizioni.find((x) => x.eventoId === ev.id && x.stato === 'pagato' && x.origine === 'lista' && !x.categoria)!;
  const dopo = await m.porta.checkIn(staff, ev.id, i.tokenQr, { porta: 'P1', ora: new Date().toISOString() });
  assert.equal(dopo.esito, 'oltre_orario');
  assert.equal((await m.archivio.leggi()).iscrizioni.find((x) => x.id === i.id)!.stato, 'pagato', 'nessun ingresso registrato');
  const offline = await m.porta.checkIn(staff, ev.id, i.tokenQr, { porta: 'P1', ora: '2026-09-30T23:00:00.000Z' });
  assert.equal(offline.esito, 'entrato', 'ingresso fatto prima del limite e sincronizzato dopo');
  await m.archivio.modifica((d) => { const x = d.iscrizioni.find((y) => y.id === i.id)!; x.stato = 'pagato'; x.oraCheckIn = null; x.porta = null; });

  // Ingresso libero: nessun limite.
  await m.admin.salvaEvento(admin, ev.id, { ...dati, tipoIngresso: 'libero', prevenditaFinoAlle: '2026-10-01T00:00:00.000Z' });
  assert.equal(await m.porta.limitePorta(staff, ev.id), null);
  await m.admin.salvaEvento(admin, ev.id, { ...dati, prevenditaFinoAlle: null });
  assert.equal(await m.porta.limitePorta(staff, ev.id), l01, 'senza valore salvato torna il default');
});

test('canali: chi arriva senza PR è contato per canale, solo l’admin li vede; alla porta resta il canale di ognuno', async () => {
  const base = { slug: 'halloween-party', dataNascita: '1995-03-03', marketing: false, handlePr: null };
  const ig = await m.pubblico.creaIscrizione({ ...base, nome: 'Ada', cognome: 'Social', email: 'ada@esempio.it', canale: 'instagram' });
  const tt = await m.pubblico.creaIscrizione({ ...base, nome: 'Bea', cognome: 'Video', email: 'bea@esempio.it', canale: 'tiktok' });
  const nessuno = await m.pubblico.creaIscrizione({ ...base, nome: 'Cleo', cognome: 'Diretta', email: 'cleo@esempio.it' });
  assert.ok(ig.ok && tt.ok && nessuno.ok);
  // Contano solo pagate: le paghiamo (come farebbe il webhook)
  for (const r of [ig, tt, nessuno]) if (r.ok) await m.prevendita.confermaPagamentoIscrizione(r.iscrizione.id, `pi_${r.iscrizione.id}`);
  assert.equal(nessuno.ok && nessuno.iscrizione.canale, 'diretto');
  const staff = await sessione('porta@maremmamusica.test');
  const c = await m.gestione.canaliSerata(await sessione('admin@maremmamusica.test'), null);
  const conta = (k: string) => c.senzaPr.canali.find((r) => r.canale === k)?.inLista ?? 0;
  const d = await m.archivio.leggi();
  const atteso = (k: string) => d.iscrizioni.filter((i) => !i.prId && i.eventoId === c.evento!.id && i.canale === k && ['in_lista', 'pagato', 'entrato'].includes(i.stato)).length;
  assert.equal(conta('instagram'), atteso('instagram'));
  assert.ok(conta('tiktok') >= 1);
  assert.ok(c.senzaPr.canali.every((r) => r.canale), 'ogni iscrizione ha un canale');
  await assert.rejects(m.gestione.canaliSerata(await sessione('test-pr@maremmamusica.test'), null), /non_autorizzato/);
  await assert.rejects(m.gestione.canaliSerata(staff, null), /non_autorizzato/, 'lo staff vede solo la porta');
  const voce = (await m.porta.elencoPorta(staff, c.evento!.id)).find((v) => ig.ok && v.id === ig.iscrizione.id)!;
  assert.equal(voce.canale, 'instagram', 'alla porta si vede da dove è arrivato');
});

test('ingressi in cassa storici: restano leggibili come "Ingresso alla porta (storico)", non gonfiano lista e classifica, e non se ne registrano più', async () => {
  const staff = await sessione('porta@maremmamusica.test');
  const admin = await sessione('admin@maremmamusica.test');
  const ev = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  const primaLive = (await m.admin.serataLive(admin, ev.id))!;
  const ora = new Date().toISOString();
  await m.archivio.modifica((d) => {
    d.iscrizioni.push({
      id: 'storico-1', eventoId: ev.id, lottoId: null, categoria: null, prId: null, nome: 'Walter', cognome: 'Incassa', dataNascita: '1990-04-04', email: '',
      tokenQr: 'MM1.storico.x.y', codice: 'STORICO1', stato: 'entrato', metodoPagamento: 'porta_pos', importo: 15, pagatoAt: ora, scade: null, pagamentoOnline: null,
      oraCheckIn: ora, porta: 'P2', consensoPrivacyAt: ora, consensoMarketing: false, annullatoAt: null, createdAt: ora, canale: 'cassa', consegnaId: null, origine: 'cassa', rifCassa: 'tel-1',
    });
  });
  try {
    const live = (await m.admin.serataLive(admin, ev.id))!;
    assert.deepEqual([live.portaStorico.ingressi, live.portaStorico.incassato], [primaLive.portaStorico.ingressi + 1, primaLive.portaStorico.incassato + 15]);
    assert.equal(live.inLista, primaLive.inLista, 'non gonfia la lista');
    assert.equal(live.entrati, primaLive.entrati + 1, 'ma è entrato');
    assert.equal(live.incassato, primaLive.incassato + 15, 'e i suoi soldi restano nell’incassato della serata');
    assert.ok(!live.classifica.some((c) => /storico|Cassa/.test(c.nome)), 'non entra nella classifica dei PR');
    const voce = (await m.porta.elencoPorta(staff, ev.id)).find((v) => v.id === 'storico-1')!;
    assert.deepEqual([voce.origine, voce.lista], ['cassa', 'Ingresso alla porta (storico)']);
    const righe = await m.admin.iscrizioniAdmin(admin, { eventoId: ev.id, stato: 'porta_storico' });
    assert.ok(righe.length >= 1 && righe.every((x) => x.iscrizione.origine === 'cassa' && x.lista === 'Ingresso alla porta (storico)'));
    const csv = (await m.admin.csvEvento(admin, ev.id))!.testo;
    assert.ok(csv.includes('STORICO1;porta (storico);Walter;Incassa') && csv.includes('porta POS (storico)'), 'nel CSV compare come storico');
  } finally {
    await m.archivio.modifica((d) => { d.iscrizioni.splice(d.iscrizioni.findIndex((x) => x.id === 'storico-1'), 1); });
  }
  assert.equal('registraCassa' in m.porta, false, 'non si registrano più ingressi in cassa');
});

test('tavoli: solo l’admin li crea e modifica, niente doppioni di nome nella stessa serata', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const ev = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const altra = d0.eventi.find((e) => e.slug !== 'halloween-party')!;
  const base = { eventoId: ev.id, nome: 'T1', zona: 'Privé', posti: 8, spesaMinima: 300, stato: 'libero' as const, nota: null, visibileDaPr: true, prAbilitati: null, ordine: 0 };

  await m.admin.salvaTavolo(admin, base);
  await assert.rejects(m.admin.salvaTavolo(admin, { ...base, nome: ' t1 ' }), /già un tavolo/);
  await m.admin.salvaTavolo(admin, { ...base, eventoId: altra.id }); // stesso nome in un'altra serata: va bene
  await assert.rejects(m.admin.salvaTavolo(admin, { ...base, nome: 'T9', eventoId: 'non-esiste' }), /Serata non trovata/);
  await assert.rejects(m.admin.salvaTavolo(staff, { ...base, nome: 'T2' }), /non_autorizzato/);
  await assert.rejects(m.admin.salvaTavolo(pr, { ...base, nome: 'T2' }), /non_autorizzato/);

  const t = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli;
  assert.equal(t.length, 1);
  // "In attesa" e "pagato" non si mettono a mano: tutti i pagamenti passano dal sito
  await assert.rejects(m.admin.salvaTavolo(admin, { ...base, id: t[0].id, stato: 'riservato' }), /prenotazione pagata sul sito/);
  await m.admin.salvaTavolo(admin, { ...base, id: t[0].id, stato: 'non_in_vendita', nota: 'Rossi', spesaMinima: 350 });
  const dopo = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli[0];
  assert.deepEqual([dopo.stato, dopo.nota, dopo.spesaMinima], ['non_in_vendita', 'Rossi', 350]);

  // Mappa: la posizione resta dentro la piantina, sopravvive alla modifica del tavolo, si può togliere
  assert.deepEqual([dopo.x, dopo.y], [null, null]);
  await m.admin.posizionaTavolo(admin, dopo.id, 140, -3);
  await m.admin.salvaTavolo(admin, { ...base, id: dopo.id, nome: 'T1 bis' });
  const messo = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli[0];
  assert.deepEqual([messo.nome, messo.x, messo.y], ['T1 bis', 100, 0]);
  await assert.rejects(m.admin.posizionaTavolo(staff, dopo.id, 10, 10), /non_autorizzato/);
  await m.admin.posizionaTavolo(admin, dopo.id, null, null);
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli[0].x, null);
  await assert.rejects(m.admin.salvaPiantina(pr, ev.id, '/media/x.jpg'), /non_autorizzato/);
  await m.admin.salvaPiantina(admin, ev.id, '/media/x.jpg');
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.evento.piantinaUrl, '/media/x.jpg');

  await assert.rejects(m.admin.eliminaTavolo(staff, dopo.id), /non_autorizzato/);
  await m.admin.eliminaTavolo(admin, dopo.id);
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.length, 0);
  assert.equal((await m.admin.eventoAdmin(admin, altra.id))!.tavoli.length, 1, 'l’altra serata resta com’era');
});

test('tavoli: richiesta, PR a cui è affidato, pagamento, scadenza, permessi e metriche', async () => {
  const tv = await import('./tavoli');
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const zarro = await sessione('zarro@maremmamusica.test');
  const ev = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  const base = { eventoId: ev.id, zona: null, posti: 6, spesaMinima: 200, stato: 'libero' as const, nota: 'riservata', visibileDaPr: true, prAbilitati: null, ordine: 0 };
  await m.admin.salvaTavolo(admin, { ...base, nome: 'A1' });                                   // tutti i PR
  await m.admin.salvaTavolo(admin, { ...base, nome: 'A2', prAbilitati: [zarro.pr!.id] });      // solo Zarro
  await m.admin.salvaTavolo(admin, { ...base, nome: 'A3', visibileDaPr: false });              // nessun PR
  await m.admin.salvaTavolo(admin, { ...base, nome: 'A4', stato: 'non_in_vendita' });
  const id = async (nome: string) => (await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === nome)!.id;
  const chi = { nome: 'Rita', cognome: 'Tavola', email: 'rita@esempio.it', telefono: '333 1234567', persone: 4 };

  // Il visitatore vede i tavoli in vendita ma mai la nota né chi li ha presi
  const pubblici = (await tv.tavoliPubblici('halloween-party'))!.tavoli;
  assert.deepEqual(pubblici.map((t) => t.nome), ['A1', 'A2', 'A3']);
  assert.ok(!('nota' in pubblici[0]) && pubblici.every((t) => t.libero));
  // Il PR con la sessione vede solo quelli affidati a lui
  assert.deepEqual((await tv.tavoliPubblici('halloween-party', 'test-pr', true))!.tavoli.map((t) => t.nome), ['A1']);

  // Richiesta dal link del PR: sempre sua, anche su un tavolo affidato ad altri PR o a nessuno
  const r1 = await tv.prenotaTavolo({ ...chi, tavoloId: await id('A1') }, 'test-pr');
  assert.ok(r1.ok);
  const p1 = r1.ok ? r1.prenotazione : null!;
  assert.deepEqual([p1.prId, p1.stato, p1.spesaMinima], [pr.pr!.id, 'in_attesa', 200]);
  assert.ok(new Date(p1.scade).getTime() <= new Date(ev.data).getTime(), 'il termine non supera l’apertura');
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === 'A1')!.stato, 'riservato');
  // Paga sul sito: confermata da sola
  assert.equal((await tv.confermaPagamentoOnline(p1.id, 'pi_a1')).esito, 'confermata');
  const stessoNumero = await tv.prenotaTavolo({ ...chi, email: 'ugo@esempio.it', telefono: '+39 333-1234567', tavoloId: await id('A2') }, 'test-pr');
  assert.ok(!stessoNumero.ok && stessoNumero.campo === 'telefono', 'stesso telefono con un’altra email: non tiene fermo un secondo tavolo');
  const r2 = await tv.prenotaTavolo({ ...chi, email: 'ugo@esempio.it', telefono: '347 1112223', tavoloId: await id('A2') }, 'test-pr');
  assert.equal(r2.ok && r2.prenotazione.prId, pr.pr!.id, 'A2 è affidato solo a Zarro, ma il cliente è arrivato dal link di Test PR: è di Test PR');
  // Senza link (o con il link di un PR non attivo) resta a Maremma Musica
  const senza = await tv.prenotaTavolo({ ...chi, email: 'senza@esempio.it', telefono: '347 1112299', tavoloId: await id('A3') }, 'nessuno-cosi');
  assert.equal(senza.ok && senza.prenotazione.prId, null);
  await tv.annullaPrenotazione(admin, senza.ok ? senza.prenotazione.id : '');

  // Tavolo già preso, troppe persone, secondo tavolo con la stessa email, tavolo non in vendita
  const preso = await tv.prenotaTavolo({ ...chi, email: 'altro@esempio.it', tavoloId: await id('A1') }, null);
  assert.ok(!preso.ok && preso.campo === 'tavolo');
  const troppi = await tv.prenotaTavolo({ ...chi, email: 'tanti@esempio.it', persone: 9, tavoloId: await id('A3') }, null);
  assert.ok(!troppi.ok && troppi.campo === 'persone');
  const bis = await tv.prenotaTavolo({ ...chi, tavoloId: await id('A3') }, null);
  assert.ok(!bis.ok && bis.campo === 'email');
  const chiuso = await tv.prenotaTavolo({ ...chi, email: 'x@esempio.it', tavoloId: await id('A4') }, null);
  assert.ok(!chiuso.ok && chiuso.campo === 'tavolo');

  // Il PR inserisce per un cliente solo sui tavoli affidati a lui, e vede solo i propri
  const nonSuo = await tv.prPrenotaTavolo(pr, { ...chi, email: 'c1@esempio.it', tavoloId: await id('A3') });
  assert.ok(!nonSuo.ok && nonSuo.campo === 'tavolo');
  await assert.rejects(async () => tv.prPrenotaTavolo(staff, { ...chi, tavoloId: await id('A3') }), /non_autorizzato/);
  // Nell'area del PR ci sono anche le prenotazioni arrivate dal suo link su tavoli non affidati a lui
  assert.deepEqual((await tv.tavoliDelPr(pr, ev.id)).mie.map((v) => v.prenotazione.id).sort(), [p1.id, r2.ok ? r2.prenotazione.id : ''].sort());
  assert.equal((await tv.tavoliDelPr(zarro, ev.id)).mie.length, 0);
  await assert.rejects(tv.tavoliDelPr(staff, ev.id), /non_autorizzato/);

  // La prenotazione si legge solo con l'email giusta
  assert.equal(await tv.prenotazionePubblica(p1.id, 'sbagliata@esempio.it'), null);
  assert.equal((await tv.prenotazionePubblica(p1.id, 'RITA@esempio.it'))!.tavolo.nome, 'A1');

  // Nessun pagamento si segna a mano: un tavolo libero non diventa "pagato" o "in attesa" dal modulo
  await assert.rejects(async () => m.admin.salvaTavolo(admin, { ...base, id: await id('A3'), nome: 'A3', visibileDaPr: false, stato: 'confermato' }), /prenotazione pagata sul sito/);
  await assert.rejects(m.admin.salvaTavolo(admin, { ...base, nome: 'A9', stato: 'riservato' }), /libero o non in vendita/);
  await assert.rejects(tv.prenotazioniAdmin(staff, ev.id), /non_autorizzato/);
  // Pagato sul sito: con la prenotazione attiva lo stato del tavolo non si cambia a mano né si elimina
  assert.equal((await tv.confermaPagamentoOnline(p1.id, 'pi_a1')).esito, 'gia', 'lo stesso pagamento conta una volta');
  assert.equal((await tv.confermaPagamentoOnline(p1.id, 'pi_a1_doppio')).esito, 'gia', 'secondo pagamento: la prenotazione resta valida');
  const p1dopo = (await m.archivio.leggi()).prenotazioni.find((x) => x.id === p1.id)!;
  assert.deepEqual([p1dopo.stato, p1dopo.pagamentoOnline!.pagamento, p1dopo.pagamentoOnline!.daRimborsare], ['confermata', 'pi_a1', false]);
  await assert.rejects(async () => m.admin.salvaTavolo(admin, { ...base, id: await id('A1'), nome: 'A1', posti: 3 }), /prenotato per 4 persone/, 'posti sotto il gruppo prenotato');
  await m.admin.salvaTavolo(admin, { ...base, id: await id('A1'), nome: 'A1', stato: 'libero', posti: 4 });
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === 'A1')!.stato, 'confermato');
  await assert.rejects(async () => m.admin.eliminaTavolo(admin, await id('A1')), /prenotazione/);
  await assert.rejects(tv.annullaPrenotazione(pr, p1.id), /non_autorizzato/, 'pagata: il PR non la annulla più');
  await assert.rejects(tv.annullaPrenotazione(zarro, r2.ok ? r2.prenotazione.id : ''), /non_autorizzato/);

  const live = (await m.admin.serataLive(admin, ev.id))!.tavoli;
  assert.deepEqual([live.totale, live.pagati, live.incassato, live.persone, live.inAttesa, live.atteso, live.liberi], [3, 1, 200, 4, 1, 200, 1]);
  assert.deepEqual(live.perLista.map((r) => [r.nome, r.pagati, r.inAttesa]), [['Test PR', 1, 1]]);

  // Termine passato senza pagamento: la prenotazione decade da sola e il tavolo torna libero
  const p2 = r2.ok ? r2.prenotazione.id : '';
  await m.archivio.modifica((d) => { d.prenotazioni.find((p) => p.id === p2)!.scade = new Date(Date.now() - 1000).toISOString(); });
  assert.equal((await tv.tavoliPubblici('halloween-party'))!.tavoli.find((t) => t.nome === 'A2')!.libero, true);
  assert.equal((await tv.prenotazionePubblica(p2, 'ugo@esempio.it'))!.prenotazione.stato, 'scaduta');
  // Ha lasciato a metà il pagamento sul sito: lo sa già, nessun avviso
  assert.equal((await tv.chiuseDaAvvisare()).some((v) => v.prenotazione.id === p2), false);

  // Pagamento arrivato poco dopo il termine e tavolo ancora libero: vale lo stesso, senza nessuno che lo segni a mano
  const riattivata = (await tv.confermaPagamentoOnline(p2, 'pi_a2'));
  assert.equal(riattivata.esito, 'confermata');
  const pagataTardi = (await tv.prenotazionePubblica(p2, 'ugo@esempio.it'))!.prenotazione;
  assert.deepEqual([pagataTardi.stato, pagataTardi.metodoPagamento, pagataTardi.chiusaAt], ['confermata', 'online', null]);
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === 'A2')!.stato, 'confermato');

  // Rimborso: solo l'admin e solo su una pagata; il tavolo si libera, la porta la vede rimborsata
  await assert.rejects(tv.annullaPrenotazione(zarro, p2, true), /non_autorizzato/);
  const rimborsata = (await tv.annullaPrenotazione(admin, p2, true))!.prenotazione;
  assert.deepEqual([rimborsata.stato, rimborsata.chiusaDa], ['rimborsata', 'admin@maremmamusica.test']);
  assert.equal((await m.porta.elencoPorta(staff, ev.id)).find((v) => v.id === p2)!.stato, 'rimborsato');
  assert.equal((await tv.chiuseDaAvvisare()).some((v) => v.prenotazione.id === p2), false, 'annullata o rimborsata: l’email parte dall’azione, non dal cron');
  assert.equal(await tv.annullaPrenotazione(admin, p2), null, 'già chiusa: niente da fare');

  // Scaduta ma nel frattempo il tavolo è di un altro: il pagamento va rimborsato. Una in attesa non si rimborsa.
  const r3 = await tv.prenotaTavolo({ ...chi, email: 'tre@esempio.it', telefono: '320 3000003', tavoloId: await id('A2') }, null);
  const p3 = r3.ok ? r3.prenotazione.id : '';
  await m.archivio.modifica((d) => { d.prenotazioni.find((p) => p.id === p3)!.scade = new Date(Date.now() - 1000).toISOString(); });
  const r4 = await tv.prenotaTavolo({ ...chi, email: 'quattro@esempio.it', telefono: '320 4000004', tavoloId: await id('A2') }, null);
  assert.ok(r4.ok);
  assert.equal((await tv.confermaPagamentoOnline(p3, 'pi_a3')).esito, 'da_rimborsare', 'pagata quando il tavolo era già di un altro');
  await assert.rejects(tv.annullaPrenotazione(admin, r4.ok ? r4.prenotazione.id : '', true), /solo una prenotazione pagata/);

  // L'admin annulla anche una pagata: il tavolo si libera
  await tv.annullaPrenotazione(admin, p1.id);
  assert.equal((await tv.tavoliPubblici('halloween-party'))!.tavoli.find((t) => t.nome === 'A1')!.libero, true);
  // Con prenotazioni nello storico il tavolo non si elimina (lo schema le tiene legate): si mette non in vendita
  await assert.rejects(async () => m.admin.eliminaTavolo(admin, await id('A1')), /storico/);

  // Due richieste nello stesso momento per lo stesso tavolo: una sola lo prende
  const insieme = await Promise.all([
    tv.prenotaTavolo({ ...chi, email: 'uno@esempio.it', telefono: '320 1000001', tavoloId: await id('A1') }, null),
    tv.prenotaTavolo({ ...chi, email: 'due@esempio.it', telefono: '320 1000002', tavoloId: await id('A1') }, null),
  ]);
  assert.deepEqual(insieme.map((r) => r.ok).sort(), [false, true]);
  assert.ok(insieme.some((r) => !r.ok && r.campo === 'tavolo'));

  // Serata iniziata: niente più richieste dal sito né dal PR, e la pagina lo dice
  const apertura = ev.data;
  await m.archivio.modifica((d) => { d.eventi.find((e) => e.id === ev.id)!.data = new Date(Date.now() - 3_600_000).toISOString(); });
  assert.equal((await tv.tavoliPubblici('halloween-party'))!.aperte, false);
  const tardi = await tv.prenotaTavolo({ ...chi, email: 'tardi@esempio.it', telefono: '320 1000003', tavoloId: await id('A3') }, null);
  assert.ok(!tardi.ok && tardi.campo === 'tavolo' && /già iniziata/.test(tardi.errore));
  const tardiPr = await tv.prPrenotaTavolo(pr, { ...chi, email: 'tardi2@esempio.it', telefono: '320 1000004', tavoloId: await id('A3') });
  assert.ok(!tardiPr.ok && /già iniziata/.test(tardiPr.errore));
  assert.equal((await tv.tavoliDelPr(pr, ev.id)).aperte, false);
  await m.archivio.modifica((d) => { d.eventi.find((e) => e.id === ev.id)!.data = apertura; });
});

test('porta e tavoli: un QR per il gruppo, una persona a passaggio, non pagato non entra', async () => {
  const tv = await import('./tavoli');
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const ev = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  await m.admin.salvaTavolo(admin, { eventoId: ev.id, nome: 'P1', zona: null, posti: 4, spesaMinima: 150, stato: 'libero', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 9 });
  const tavoloId = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === 'P1')!.id;
  const r = await tv.prenotaTavolo({ tavoloId, nome: 'Gino', cognome: 'Gruppo', email: 'gino@esempio.it', telefono: '333 7654321', persone: 2 }, null);
  const p = r.ok ? r.prenotazione : null!;
  const o = { porta: 'P1', ora: new Date().toISOString() };
  const voce = async () => (await m.porta.elencoPorta(staff, ev.id)).find((v) => v.id === p.id)!;

  // In attesa di pagamento: è in elenco ma il QR non vale
  assert.deepEqual([(await voce()).origine, (await voce()).tavolo], ['tavolo', { nome: 'P1', persone: 2, entrati: 0, pagato: false }]);
  const nonPagato = await m.porta.checkIn(staff, ev.id, p.tokenQr, o, 'm0');
  assert.ok(nonPagato.esito === 'non_valido' && /non ancora pagato/.test(nonPagato.motivo));

  await tv.confermaPagamentoOnline(p.id, 'pi_porta');
  const primo = await m.porta.checkIn(staff, ev.id, p.tokenQr, o, 'm1');
  assert.ok(primo.esito === 'entrato' && primo.voce.tavolo!.entrati === 1 && primo.incassato === 0);
  // La stessa sincronizzazione ripetuta non fa entrare un'altra persona
  await m.porta.checkIn(staff, ev.id, p.tokenQr, o, 'm1');
  assert.equal((await voce()).tavolo!.entrati, 1);
  assert.equal((await voce()).stato, 'pagato');
  // Secondo del gruppo, col codice dettato: tavolo al completo
  const secondo = await m.porta.checkIn(staff, ev.id, p.codice, { ...o, porta: 'P2' }, 'm2');
  assert.ok(secondo.esito === 'entrato' && secondo.voce.stato === 'entrato');
  const terzo = await m.porta.checkIn(staff, ev.id, p.tokenQr, o, 'm3');
  assert.equal(terzo.esito, 'gia_entrato');
  assert.equal((await m.admin.serataLive(admin, ev.id))!.tavoli.entrati, 2);

  // Annullata: il QR non vale più
  await tv.annullaPrenotazione(admin, p.id);
  assert.equal((await m.porta.checkIn(staff, ev.id, p.tokenQr, o, 'm4')).esito, 'annullato');
});

test('tavoli: copia da un’altra serata, recupero per email, promemoria una volta sola, CSV', async () => {
  const tv = await import('./tavoli');
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const ev = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const nuova = d0.eventi.find((e) => e.slug === 'capodanno-in-pineta') ?? d0.eventi.find((e) => e.id !== ev.id && !d0.tavoli.some((t) => t.eventoId === e.id))!;
  const diEv = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli;
  await m.admin.posizionaTavolo(admin, diEv[0].id, 20, 30);
  await m.admin.salvaPiantina(admin, ev.id, '/media/sala.jpg');

  assert.ok((await m.admin.serateConTavoli(admin, nuova.id)).some((x) => x.id === ev.id));
  await assert.rejects(m.admin.copiaTavoli(staff, ev.id, nuova.id), /non_autorizzato/);
  const prima = (await m.admin.eventoAdmin(admin, nuova.id))!.tavoli.length;
  const n = await m.admin.copiaTavoli(admin, ev.id, nuova.id);
  const copiati = (await m.admin.eventoAdmin(admin, nuova.id))!;
  assert.equal(copiati.tavoli.length, prima + n);
  assert.ok(n > 0 && copiati.tavoli.filter((t) => t.stato !== 'non_in_vendita').every((t) => t.stato === 'libero' && t.nota === null), 'arrivano liberi e senza nota');
  const gemello = copiati.tavoli.find((t) => t.nome === diEv[0].nome)!;
  assert.deepEqual([gemello.x, gemello.y, gemello.spesaMinima], [20, 30, diEv[0].spesaMinima]);
  assert.equal(copiati.evento.piantinaUrl, '/media/sala.jpg');
  assert.equal(await m.admin.copiaTavoli(admin, ev.id, nuova.id), 0, 'la seconda copia non duplica');

  // Recupero, e niente promemoria per chi prenota dal sito (paga subito)
  const libero = copiati.tavoli.find((t) => t.stato === 'libero')!;
  const r = await tv.prenotaTavolo({ tavoloId: libero.id, nome: 'Pia', cognome: 'Memo', email: 'pia@esempio.it', telefono: '320 5556667', persone: 2 }, null);
  const p = r.ok ? r.prenotazione : null!;
  assert.deepEqual((await tv.prenotazioniPerEmail('PIA@esempio.it')).map((v) => v.prenotazione.id), [p.id]);
  assert.equal((await tv.promemoriaRichiestePr()).some((x) => x.vista.prenotazione.id === p.id), false);
  assert.ok((await tv.emailAdmin()).includes('admin@maremmamusica.test'));

  const csv = (await m.admin.csvTavoli(admin, nuova.id))!;
  assert.ok(csv.nome.endsWith('-tavoli.csv') && csv.testo.includes('pia@esempio.it') && csv.testo.includes('in attesa di pagamento'));
  await assert.rejects(m.admin.csvTavoli(staff, nuova.id), /non_autorizzato/);
});

test('tavoli: pagamento online, tavolo fermo pochi minuti, conferma automatica, pagamento tardivo da rimborsare', async () => {
  const tv = await import('./tavoli');
  const pag = await import('../pagamenti');
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const ev = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  const base = { eventoId: ev.id, zona: null, posti: 6, spesaMinima: 250, stato: 'libero' as const, nota: null, visibileDaPr: true, prAbilitati: null, ordine: 20 };
  for (const nome of ['O1', 'O2', 'O3', 'O4']) await m.admin.salvaTavolo(admin, { ...base, nome });
  const id = async (nome: string) => (await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === nome)!.id;
  const chi = { nome: 'Lia', cognome: 'Online', email: 'lia@esempio.it', telefono: '331 5550001', persone: 4 };

  // Dal sito: il tavolo resta fermo solo il tempo del pagamento (30 minuti)
  const r1 = await tv.prenotaTavolo({ ...chi, tavoloId: await id('O1') }, null);
  assert.ok(r1.ok);
  const p1 = r1.ok ? r1.prenotazione : null!;
  const minuti = (new Date(p1.scade).getTime() - new Date(p1.createdAt).getTime()) / 60_000;
  assert.ok(p1.pagamentoOnline && Math.round(minuti) === 30, 'fermo 30 minuti');
  // Chiude la pagina di pagamento e riprova con la stessa email: la richiesta vecchia si libera, la nuova parte
  const r2 = await tv.prenotaTavolo({ ...chi, tavoloId: await id('O1') }, null);
  assert.ok(r2.ok, 'stesso tavolo, di nuovo');
  const p2 = r2.ok ? r2.prenotazione : null!;
  assert.equal((await tv.prenotazionePubblica(p1.id, chi.email))!.prenotazione.stato, 'annullata');

  // Pagamento riuscito: confermata da sola, una volta sola anche se l'avviso arriva due volte
  await tv.salvaSessionePagamento(p2.id, 'cs_prova_1');
  assert.equal((await tv.daPagareOnline(p2.id, chi.email))!.prenotazione.pagamentoOnline!.sessione, 'cs_prova_1');
  assert.equal(await tv.daPagareOnline(p2.id, 'altro@esempio.it'), null, 'email sbagliata: niente pagamento');
  assert.equal((await tv.confermaPagamentoOnline(p2.id, 'pi_1')).esito, 'confermata');
  assert.equal((await tv.confermaPagamentoOnline(p2.id, 'pi_1')).esito, 'gia');
  const pagata = (await tv.prenotazionePubblica(p2.id, chi.email))!.prenotazione;
  assert.deepEqual([pagata.stato, pagata.metodoPagamento, pagata.pagamentoOnline!.pagamento], ['confermata', 'online', 'pi_1']);
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === 'O1')!.stato, 'confermato');
  assert.equal(await tv.daPagareOnline(p2.id, chi.email), null, 'già pagata: niente nuova pagina di pagamento');
  // Il controllo giornaliero chiede a Stripe solo delle pagine di pagamento rimaste senza esito
  const r2b = await tv.prenotaTavolo({ ...chi, email: 'sospeso@esempio.it', telefono: '331 5550009', tavoloId: await id('O3') }, null);
  const p2b = r2b.ok ? r2b.prenotazione : null!;
  await tv.salvaSessionePagamento(p2b.id, 'cs_sospeso');
  const daVerificare = (await tv.pagamentiDaVerificare()).map((x) => x.sessione);
  assert.ok(daVerificare.includes('cs_sospeso') && !daVerificare.includes('cs_prova_1'), 'la pagata non si richiede');
  await tv.lasciaTavolo(p2b.id, 'sospeso@esempio.it');
  // Il rimborso online sa quale pagamento restituire; solo l'admin
  assert.equal(await tv.pagamentoOnlineDi(admin, p2.id), 'pi_1');
  await assert.rejects(tv.pagamentoOnlineDi(staff, p2.id), /non_autorizzato/);

  // Il cliente lascia il tavolo prima di pagare: solo con la sua email, e il tavolo si libera subito
  const r3 = await tv.prenotaTavolo({ ...chi, email: 'ivo@esempio.it', telefono: '331 5550002', tavoloId: await id('O2') }, null);
  const p3 = r3.ok ? r3.prenotazione : null!;
  assert.equal(await tv.lasciaTavolo(p3.id, 'lia@esempio.it'), null);
  assert.equal((await tv.lasciaTavolo(p3.id, 'IVO@esempio.it'))!.prenotazione.stato, 'annullata');
  assert.equal((await tv.tavoliPubblici('halloween-party'))!.tavoli.find((t) => t.nome === 'O2')!.libero, true);

  // Pagamento arrivato poco dopo la scadenza, tavolo ancora libero: vale lo stesso
  const r4 = await tv.prenotaTavolo({ ...chi, email: 'eva@esempio.it', telefono: '331 5550003', tavoloId: await id('O2') }, null);
  const p4 = r4.ok ? r4.prenotazione : null!;
  await m.archivio.modifica((d) => { d.prenotazioni.find((p) => p.id === p4.id)!.scade = new Date(Date.now() - 1000).toISOString(); });
  assert.equal((await tv.prenotazionePubblica(p4.id, 'eva@esempio.it'))!.prenotazione.stato, 'scaduta');
  assert.equal((await tv.chiuseDaAvvisare()).some((v) => v.prenotazione.id === p4.id), false, 'pagamento lasciato a metà: nessun avviso');
  assert.equal((await tv.confermaPagamentoOnline(p4.id, 'pi_4')).esito, 'confermata');

  // Pagamento arrivato quando il tavolo è già di un altro: registrato, da rimborsare, lo chiude l'admin
  const r5 = await tv.prenotaTavolo({ ...chi, email: 'ugo2@esempio.it', telefono: '331 5550004', tavoloId: await id('O3') }, null);
  const p5 = r5.ok ? r5.prenotazione : null!;
  await m.archivio.modifica((d) => { d.prenotazioni.find((p) => p.id === p5.id)!.scade = new Date(Date.now() - 1000).toISOString(); });
  const altro = await tv.prenotaTavolo({ ...chi, email: 'zoe@esempio.it', telefono: '331 5550005', tavoloId: await id('O3') }, null);
  assert.ok(altro.ok);
  assert.equal((await tv.confermaPagamentoOnline(p5.id, 'pi_5')).esito, 'da_rimborsare');
  const dopo = (await tv.prenotazionePubblica(p5.id, 'ugo2@esempio.it'))!.prenotazione;
  assert.deepEqual([dopo.stato, dopo.pagamentoOnline!.daRimborsare, dopo.pagamentoOnline!.pagamento], ['scaduta', true, 'pi_5']);
  await assert.rejects(tv.chiudiRimborsoDovuto(staff, p5.id), /non_autorizzato/);
  assert.equal((await tv.chiudiRimborsoDovuto(admin, p5.id))!.prenotazione.stato, 'rimborsata');
  assert.equal(await tv.chiudiRimborsoDovuto(admin, p5.id), null, 'già rimborsata');

  // Inserita dal PR: il cliente riceve il link e ha 24 ore
  const r6 = await tv.prPrenotaTavolo(pr, { ...chi, email: 'cliente.pr@esempio.it', telefono: '331 5550006', tavoloId: await id('O4') });
  assert.ok(r6.ok);
  const p6 = r6.ok ? r6.prenotazione : null!;
  const ore = (new Date(p6.scade).getTime() - new Date(p6.createdAt).getTime()) / 3_600_000;
  assert.ok(p6.pagamentoOnline && Math.round(ore) === 24, 'dal PR: 24 ore');
  // Il controllo del mattino: niente promemoria a chi ha appena ricevuto il link; dopo qualche ora sì, al cliente e al PR, una volta sola
  assert.equal((await tv.promemoriaRichiestePr()).some((x) => x.vista.prenotazione.id === p6.id), false, 'link appena ricevuto');
  const piuTardi = new Date(Date.now() + 4 * 3_600_000);
  const promemoria = (await tv.promemoriaRichiestePr(piuTardi)).filter((x) => x.vista.prenotazione.id === p6.id);
  assert.deepEqual(promemoria.map((x) => x.emailPr), ['test-pr@maremmamusica.test']);
  assert.equal((await tv.promemoriaRichiestePr(piuTardi)).some((x) => x.vista.prenotazione.id === p6.id), false, 'una volta sola');
  // Le richieste fatte dal cliente sul sito (30 minuti) non ricevono questo promemoria
  assert.equal(promemoria.every((x) => x.vista.prenotazione.inseritaDa === 'pr'), true);
  // Scaduta senza pagamento: il cliente che aveva il link dal PR viene avvisato (una volta), e il PR ha un'email a cui scrivere
  await m.archivio.modifica((d) => { d.prenotazioni.find((p) => p.id === p6.id)!.scade = new Date(Date.now() - 1000).toISOString(); });
  assert.equal((await tv.chiuseDaAvvisare()).filter((v) => v.prenotazione.id === p6.id).length, 1);
  assert.equal((await tv.chiuseDaAvvisare()).some((v) => v.prenotazione.id === p6.id), false, 'una volta sola');
  assert.equal(await tv.emailDelPr(p6.prId), 'test-pr@maremmamusica.test');
  assert.equal(await tv.emailDelPr(null), null);

  // Tavolo venduto a voce: l'admin inserisce la richiesta (anche su un tavolo che nessun PR può proporre), il cliente paga
  // dal link entro 24 ore, nessun PR; promemoria al cliente senza PR da avvisare, e avviso se scade
  await m.admin.salvaTavolo(admin, { ...base, nome: 'O5', visibileDaPr: false });
  await assert.rejects(async () => tv.adminPrenotaTavolo(staff, { ...chi, tavoloId: await id('O5') }), /non_autorizzato/);
  await assert.rejects(async () => tv.adminPrenotaTavolo(pr, { ...chi, tavoloId: await id('O5') }), /non_autorizzato/);
  const r7 = await tv.adminPrenotaTavolo(admin, { ...chi, email: 'voce@esempio.it', telefono: '331 5550010', tavoloId: await id('O5') });
  assert.ok(r7.ok);
  const p7 = r7.ok ? r7.prenotazione : null!;
  assert.deepEqual([p7.inseritaDa, p7.prId, Math.round((new Date(p7.scade).getTime() - new Date(p7.createdAt).getTime()) / 3_600_000)], ['crew', null, 24]);
  assert.deepEqual((await tv.promemoriaRichiestePr(new Date(Date.now() + 4 * 3_600_000))).filter((x) => x.vista.prenotazione.id === p7.id).map((x) => x.emailPr), [null]);
  await m.archivio.modifica((d) => { d.prenotazioni.find((p) => p.id === p7.id)!.scade = new Date(Date.now() - 1000).toISOString(); });
  assert.equal((await tv.chiuseDaAvvisare()).filter((v) => v.prenotazione.id === p7.id).length, 1, 'il cliente aveva il link: va avvisato');

  // Firma del webhook di Stripe: valida solo con il segreto giusto, sul corpo esatto e non troppo vecchia
  const { createHmac } = await import('node:crypto');
  const firma = (t: number, corpo: string) => createHmac('sha256', 'whsec_prova').update(`${t}.${corpo}`).digest('hex');
  const corpo = '{"type":"checkout.session.completed"}';
  const t = Math.floor(Date.now() / 1000);
  assert.equal(pag.firmaStripeValida(corpo, `t=${t},v1=${firma(t, corpo)}`, 'whsec_prova'), true);
  assert.equal(pag.firmaStripeValida(corpo, `t=${t},v1=${firma(t, corpo)}`, 'whsec_altro'), false, 'segreto sbagliato');
  assert.equal(pag.firmaStripeValida(`${corpo} `, `t=${t},v1=${firma(t, corpo)}`, 'whsec_prova'), false, 'corpo cambiato');
  assert.equal(pag.firmaStripeValida(corpo, `t=${t - 600},v1=${firma(t - 600, corpo)}`, 'whsec_prova'), false, 'troppo vecchia');
  assert.equal(pag.firmaStripeValida(corpo, null, 'whsec_prova'), false);
});

test('serata senza telefono: il documento si conferma sempre, il telefono non salta il controllo, lista, cambio nome, dati cancellati dopo 30 giorni', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const ev0 = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  const { id: _id, createdAt: _c, updatedAt: _u, piantinaUrl: _p, numero: _n, ...dati } = ev0;
  const ev = await m.admin.salvaEvento(admin, null, { ...dati, slug: 'senza-telefono', nome: 'Senza telefono', senzaTelefono: true, pubblicato: true });
  assert.equal((await m.porta.eventiPorta(staff)).find((e) => e.id === ev.id)!.senzaTelefono, true, 'la porta lo sa');

  const crea = async (cognome: string, dataNascita: string) => {
    const r = await m.pubblico.creaIscrizione({ slug: 'senza-telefono', handlePr: null, nome: 'Anna', cognome, dataNascita, email: `${cognome.toLowerCase()}@esempio.it`, marketing: false });
    assert.ok(r.ok);
    if (r.ok) await m.prevendita.confermaPagamentoIscrizione(r.iscrizione.id, `prova_${cognome}`);
    return (await m.archivio.leggi()).iscrizioni.find((x) => x.cognome === cognome && x.eventoId === ev.id)!;
  };
  const rossi = await crea('Rossi', '1995-03-14');
  const verdi = await crea('Verdi', '1990-07-02');
  const o = { porta: 'P1', ora: new Date().toISOString() };

  // Anche senza categoria: la scansione da sola non basta, serve il "Fai entrare" dopo il controllo del documento.
  assert.equal((await m.porta.checkIn(staff, ev.id, rossi.tokenQr, o)).esito, 'da_confermare');
  assert.equal((await m.archivio.leggi()).iscrizioni.find((x) => x.id === rossi.id)!.stato, 'pagato');
  assert.equal((await m.porta.checkIn(staff, ev.id, rossi.tokenQr, { ...o, confermato: true })).esito, 'entrato');
  assert.equal((await m.porta.checkIn(staff, ev.id, rossi.tokenQr, { ...o, confermato: true })).esito, 'gia_entrato', 'un ingresso solo');
  // "Non corrisponde": nessun ingresso, il rifiuto è salvato e l'iscrizione resta valida.
  assert.equal((await m.porta.rifiutaIngresso(staff, ev.id, verdi.tokenQr, { porta: 'P2', ora: o.ora })).esito, 'rifiutato');
  assert.equal((await m.archivio.leggi()).iscrizioni.find((x) => x.id === verdi.id)!.stato, 'pagato');

  // Lista di riserva: in ordine alfabetico, con data di nascita; solo staff e admin.
  const lista = (await m.porta.listaStampabile(admin, ev.id))!;
  assert.deepEqual(lista.righe.map((r) => r.cognome), ['Rossi', 'Verdi']);
  assert.equal(lista.righe[0].entrato, true);
  await assert.rejects(m.porta.listaStampabile(pr, ev.id), /non_autorizzato/);

  // Cambio di nominativo: solo admin, solo prima dell'ingresso, con età e doppioni controllati.
  const nuovo = { nome: 'Bruno', cognome: 'Bianchi', dataNascita: '1992-01-01' };
  await assert.rejects(m.admin.cambiaNominativo(staff, verdi.id, nuovo), /non_autorizzato/);
  await assert.rejects(m.admin.cambiaNominativo(admin, rossi.id, nuovo), /non è ancora entrato/);
  await assert.rejects(m.admin.cambiaNominativo(admin, verdi.id, { ...nuovo, dataNascita: '2012-01-01' }), /18\+/);
  await assert.rejects(m.admin.cambiaNominativo(admin, verdi.id, { ...nuovo, cognome: 'Rossi', dataNascita: '1995-03-14' }), /già una prevendita/);
  await m.admin.cambiaNominativo(admin, verdi.id, nuovo);
  const cambiata = (await m.archivio.leggi()).iscrizioni.find((x) => x.id === verdi.id)!;
  assert.equal(cambiata.cognome, 'Bianchi');
  assert.equal(cambiata.tokenQr, verdi.tokenQr, 'è lo stesso biglietto');

  // Cambio dell'email del biglietto: facoltativa, controllata, non cambia il resto.
  await assert.rejects(m.admin.cambiaNominativo(admin, verdi.id, { ...nuovo, email: 'non-una-email' }), /email/);
  await m.admin.cambiaNominativo(admin, verdi.id, { ...nuovo, email: ' Nuova@Esempio.it ' });
  assert.equal((await m.archivio.leggi()).iscrizioni.find((x) => x.id === verdi.id)!.email, 'nuova@esempio.it');
  await m.admin.cambiaNominativo(admin, verdi.id, { ...nuovo, email: '' });
  assert.equal((await m.archivio.leggi()).iscrizioni.find((x) => x.id === verdi.id)!.email, 'nuova@esempio.it', 'vuota: resta com’era');
});

test('anonimizzazione: dopo 30 giorni spariscono i dati personali, restano età e conti, righe anonime senza conflitti', async () => {
  const d0 = await m.archivio.leggi();
  const ev = d0.eventi.find((e) => e.slug === 'senza-telefono')!;
  const normale = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const crea = async (cognome: string, dataNascita: string, marketing: boolean) => {
    const r = await m.pubblico.creaIscrizione({ slug: 'senza-telefono', handlePr: null, nome: 'Luca', cognome, dataNascita, email: `${cognome.toLowerCase()}@esempio.it`, marketing });
    assert.ok(r.ok);
    if (r.ok) await m.prevendita.confermaPagamentoIscrizione(r.iscrizione.id, `prova_${cognome}`);
    return (await m.archivio.leggi()).iscrizioni.find((x) => x.cognome === cognome && x.eventoId === ev.id)!;
  };
  // Stessa età, stessa serata: due righe anonime non devono scontrarsi (indice unico solo sulle righe con i dati).
  const a = await crea('Neri', '2000-10-31', true);   // 26 anni il giorno della serata
  const b = await crea('Gialli', '2000-11-01', false); // 25 anni: compie gli anni il giorno dopo
  const fine = new Date(ev.dataFine ?? ev.data).getTime();
  assert.equal(await m.prevendita.anonimizzaIscrizioniVecchie(new Date(fine + 20 * 86_400_000)), 0, 'dopo 20 giorni no');
  assert.ok((await m.archivio.leggi()).iscrizioni.find((x) => x.id === a.id)!.cognome === 'Neri');

  const n = await m.prevendita.anonimizzaIscrizioniVecchie(new Date(fine + 31 * 86_400_000));
  assert.ok(n >= 2);
  const dopo = (await m.archivio.leggi()).iscrizioni;
  for (const id of [a.id, b.id]) {
    const x = dopo.find((r) => r.id === id)!;
    assert.equal(x.anonimizzata, true);
    assert.deepEqual([x.nome, x.cognome, x.email, x.dataNascita], ['', '', '', ''], 'dati personali spariti');
    assert.ok(x.anonimizzataAt);
    assert.equal(x.stato, 'pagato', 'lo stato resta');
    assert.equal(x.importo, a.importo);
    assert.equal(x.lottoId, a.lottoId, 'il tipo di prevendita resta');
    assert.equal(x.createdAt, id === a.id ? a.createdAt : b.createdAt, 'data d’acquisto resta');
  }
  assert.equal(dopo.find((r) => r.id === a.id)!.etaAllaSerata, 26);
  assert.equal(dopo.find((r) => r.id === b.id)!.etaAllaSerata, 25, 'età alla serata, non oggi');
  assert.equal(dopo.find((r) => r.id === a.id)!.consensoMarketing, true, 'il consenso marketing non si tocca');
  // Vale per tutte le serate passate da 30 giorni, anche normali; nessuna riga viva viene toccata.
  assert.ok(dopo.filter((r) => r.eventoId === normale.id).every((r) => r.anonimizzata));
  assert.equal(dopo.filter((r) => !r.anonimizzata && r.nome === '').length, 0);
  // Idempotente, e chi si iscrive di nuovo con gli stessi dati non è bloccato da una riga anonima.
  assert.equal(await m.prevendita.anonimizzaIscrizioniVecchie(new Date(fine + 40 * 86_400_000)), 0);
  const csv = await m.admin.csvEvento(await sessione('admin@maremmamusica.test'), ev.id);
  assert.ok(csv && !csv.testo.includes('neri@esempio.it') && csv.testo.includes('Età alla serata'));
  assert.equal(dopo.filter((r) => r.eventoId === ev.id && r.anonimizzata).length >= 2, true);
  const { giaIscritto } = await import('../regole');
  assert.equal(giaIscritto(dopo, ev.id, '', ''), undefined, 'una riga anonima non conta come doppione');
});

test('cruscotto admin: solo l’admin, con la prossima serata e i rimborsi da fare', async () => {
  await assert.rejects(m.admin.cruscotto(await sessione('porta@maremmamusica.test')), /non_autorizzato/);
  await assert.rejects(m.admin.cruscotto(await sessione('test-pr@maremmamusica.test')), /non_autorizzato/);
  const c = await m.admin.cruscotto(await sessione('admin@maremmamusica.test'));
  const d = await m.archivio.leggi();
  assert.equal(c.daRimborsare, d.iscrizioni.filter((i) => i.pagamentoOnline?.daRimborsare).length);
  const prima = c.tavoliDaRimborsare.reduce((t, x) => t + x.n, 0);
  const pr0 = d.prenotazioni.find((p) => !p.pagamentoOnline?.daRimborsare);
  assert.ok(pr0, 'serve una prenotazione nei dati di prova');
  await m.archivio.modifica((x) => { x.prenotazioni.find((p) => p.id === pr0.id)!.pagamentoOnline = { sessione: null, pagamento: 'pi_cruscotto', daRimborsare: true }; });
  const dopo = await m.admin.cruscotto(await sessione('admin@maremmamusica.test'));
  const tavoli = dopo.tavoliDaRimborsare.find((x) => x.eventoId === pr0.eventoId);
  assert.equal(dopo.tavoliDaRimborsare.reduce((t, x) => t + x.n, 0), prima + 1, 'il tavolo da rimborsare compare nel cruscotto');
  assert.ok(tavoli && tavoli.n >= 1);
});

test('prevendita non completata: alla porta compare una volta, "non pagato", non entra nemmeno dal server', async () => {
  const { decidiIngresso } = await import('../porta-logica');
  const staff = await sessione('porta@maremmamusica.test');
  const ev = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  const o = { porta: 'P1', ora: new Date().toISOString() };
  const dati = { nome: 'Mario', cognome: 'Rossi Attesa', dataNascita: '1991-09-09' };

  const r = await m.pubblico.creaIscrizione({ slug: 'halloween-party', handlePr: null, marketing: false, ...dati, email: 'mario.attesa@esempio.it' });
  assert.ok(r.ok);
  const prima = (await m.porta.elencoPorta(staff, ev.id)).filter((v) => v.cognome === dati.cognome);
  assert.equal(prima.length, 1);
  assert.equal(prima[0].stato, 'in_attesa');
  assert.equal(decidiIngresso(prima[0], { ...o }).esito.esito, 'non_pagato');
  assert.equal((await m.porta.checkIn(staff, ev.id, prima[0].token, o)).esito, 'non_pagato', 'anche dal server: niente ingresso senza pagamento');
});

test('QR di un’altra serata: la porta dice di quale e solo se la firma è vera; le bozze non si aprono alla porta', async () => {
  const staff = await sessione('porta@maremmamusica.test');
  const pr = await sessione('test-pr@maremmamusica.test');
  const d = await m.archivio.leggi();
  const halloween = d.eventi.find((e) => e.slug === 'halloween-party')!;
  const altra = d.eventi.find((e) => e.slug === 'senza-telefono')!;
  const bigliettoAltra = d.iscrizioni.find((i) => i.eventoId === altra.id && i.tokenQr)!;
  const o = { porta: 'P1', ora: new Date().toISOString() };

  // Scansionato sulla serata sbagliata: l'ingresso non passa...
  assert.equal((await m.porta.checkIn(staff, halloween.id, bigliettoAltra.tokenQr, o)).esito, 'non_valido');
  // ...ma la porta riconosce la serata del biglietto.
  assert.deepEqual(await m.porta.serataDelBiglietto(staff, bigliettoAltra.tokenQr), { id: altra.id, nome: altra.nome, data: altra.data });
  // Un biglietto di questa serata dice questa serata (il telefono confronta e non propone niente).
  const bigliettoHalloween = d.iscrizioni.find((i) => i.eventoId === halloween.id && i.tokenQr)!;
  assert.equal((await m.porta.serataDelBiglietto(staff, bigliettoHalloween.tokenQr))?.id, halloween.id);
  // QR modificato, codice a mano, testo qualunque: niente da dire.
  const falso = bigliettoAltra.tokenQr.slice(0, -2) + (bigliettoAltra.tokenQr.endsWith('AA') ? 'BB' : 'AA');
  assert.equal(await m.porta.serataDelBiglietto(staff, falso), null);
  assert.equal(await m.porta.serataDelBiglietto(staff, bigliettoAltra.codice), null);
  assert.equal(await m.porta.serataDelBiglietto(staff, 'MM1.xx.yy.zz'), null);
  await assert.rejects(m.porta.serataDelBiglietto(pr, bigliettoAltra.tokenQr), /non_autorizzato/);

  // Serata in bozza: non è nell'elenco della porta e non la si propone.
  await m.archivio.modifica((x) => { x.eventi.find((e) => e.id === altra.id)!.pubblicato = false; });
  try {
    assert.ok(!(await m.porta.eventiPorta(staff)).some((e) => e.id === altra.id), 'le bozze non si scelgono alla porta');
    assert.equal(await m.porta.serataDelBiglietto(staff, bigliettoAltra.tokenQr), null);
  } finally {
    await m.archivio.modifica((x) => { x.eventi.find((e) => e.id === altra.id)!.pubblicato = true; });
  }
  assert.ok((await m.porta.eventiPorta(staff)).some((e) => e.id === altra.id));
});

test('serata: il prezzo viene dai tipi, il primo salvataggio è una bozza con il suo primo tipo', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const { id: _i, createdAt: _c, updatedAt: _u, piantinaUrl: _p, numero: _n, ...modello } = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const dati = { ...modello, slug: 'prezzo-dai-tipi', nome: 'Prezzo dai tipi', prezzoLista: 9, pubblicato: false };
  const nuova = await m.admin.salvaEvento(admin, null, dati);
  let x = (await m.admin.eventoAdmin(admin, nuova.id))!;
  assert.equal(x.lotti.length, 1, 'nasce con il primo tipo');
  assert.deepEqual([x.lotti[0].prezzo, x.lotti[0].automatico], [9, true]);

  // Il prezzo si cambia nei tipi: l'evento lo segue, il modulo non lo sposta più
  await m.admin.salvaLotto(admin, { ...x.lotti[0], prezzo: 12 });
  x = (await m.admin.eventoAdmin(admin, nuova.id))!;
  assert.equal(x.evento.prezzoLista, 12);
  assert.equal(x.lotti[0].automatico, false, 'ritoccato: non è più "creato in automatico"');
  await m.admin.salvaEvento(admin, nuova.id, { ...dati, prezzoLista: 99 });
  x = (await m.admin.eventoAdmin(admin, nuova.id))!;
  assert.equal(x.evento.prezzoLista, 12, 'il vecchio campo del modulo non conta');
  assert.equal((await m.admin.serataLive(admin, nuova.id))!.prezzoTipi?.primo, 12);

  // Un secondo tipo più economico: l'intestazione dice "da", il primo (per ordine) resta quello del primo tipo
  await m.admin.salvaLotto(admin, { ...x.lotti[0], id: null, nome: 'Early bird', prezzo: 8, ordine: 1 });
  const live = (await m.admin.serataLive(admin, nuova.id))!;
  assert.deepEqual([live.prezzoTipi?.minimo, live.prezzoTipi?.primo], [8, 12]);

  // Il modello rapido riparte dal prezzo pieno e applicato due volte non fa scendere i prezzi
  await m.admin.applicaModelloTipi(admin, nuova.id, 'early-standard');
  const prima = (await m.admin.eventoAdmin(admin, nuova.id))!.lotti.map((l) => l.prezzo);
  await m.admin.applicaModelloTipi(admin, nuova.id, 'early-standard');
  assert.deepEqual((await m.admin.eventoAdmin(admin, nuova.id))!.lotti.map((l) => l.prezzo), prima);
  assert.equal(Math.max(...prima), 12);
  await assert.rejects(m.admin.duplicaSerata(staff, nuova.id, '2027-01-09'), /non_autorizzato/);
});

test('duplica serata: copia dati, tipi con le uscite spostate, tavoli e piantina, in bozza', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const { id: _i, createdAt: _c, updatedAt: _u, piantinaUrl: _p, numero: _n, ...modello } = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const orig = await m.admin.salvaEvento(admin, null, {
    ...modello, slug: 'serata-da-copiare', nome: 'Serata da copiare', data: '2026-11-07T23:00:00+01:00', dataFine: '2026-11-08T04:00:00+01:00',
    prezzoLista: 10, prevenditaFinoAlle: new Date('2026-11-08T02:00:00+01:00').toISOString(), senzaTelefono: true, etaMinima: 21, inCopertina: true, pubblicato: true, prAbilitati: [],
  });
  const tipi = (await m.admin.eventoAdmin(admin, orig.id))!.lotti;
  await m.admin.salvaLotto(admin, { ...tipi[0], nome: 'Early bird', prezzo: 8, dataInizio: '2026-10-20T00:00:00+02:00', dataFine: null, uscitaGiorniPrima: null });
  await m.admin.salvaLotto(admin, { ...tipi[0], id: null, nome: 'Standard', prezzo: 11, ordine: 1, dataInizio: null, dataFine: null, uscitaGiorniPrima: 7 });
  await m.admin.creaTavoliInSerie(admin, { eventoId: orig.id, partenza: 'D1', quanti: 3, zona: 'Pista', posti: 6, spesaMinima: 200 });
  await m.admin.salvaPiantina(admin, orig.id, '/media/sala-d.jpg');

  await assert.rejects(m.admin.duplicaSerata(admin, orig.id, ''), /nuova data/);
  const copia = await m.admin.duplicaSerata(admin, orig.id, '2026-11-14');
  const c = (await m.admin.eventoAdmin(admin, copia.id))!;
  assert.equal(c.evento.pubblicato, false, 'la copia è una bozza');
  assert.equal(c.evento.inCopertina, false);
  assert.ok(c.evento.numero! > orig.numero! && c.evento.slug !== orig.slug && /2026-11-14/.test(c.evento.slug));
  assert.deepEqual([c.evento.data, c.evento.dataFine], ['2026-11-14T23:00:00+01:00', '2026-11-15T04:00:00+01:00'].map((x) => new Date(x).toISOString()), 'stessi orari, nuova data');
  assert.deepEqual([c.evento.senzaTelefono, c.evento.etaMinima, c.evento.prAbilitati], [true, 21, []], 'porta e PR');
  assert.equal(c.evento.prevenditaFinoAlle, new Date('2026-11-15T02:00:00+01:00').toISOString(), 'l’orario limite si sposta con la data, alla stessa ora a Roma');
  assert.deepEqual(c.lotti.map((l) => [l.nome, l.prezzo, l.uscitaGiorniPrima]), [['Early bird', 8, null], ['Standard', 11, 7]]);
  assert.equal(c.lotti[0].dataInizio, new Date('2026-10-27T00:00:00+01:00').toISOString(), 'data fissa spostata di 7 giorni, alla stessa ora anche con il cambio dell’ora legale');
  assert.equal(c.evento.prezzoLista, 8, 'il prezzo dell’evento segue il primo tipo');
  assert.deepEqual(c.tavoli.map((t) => [t.nome, t.posti, t.zona, t.stato]), [['D1', 6, 'Pista', 'libero'], ['D2', 6, 'Pista', 'libero'], ['D3', 6, 'Pista', 'libero']]);
  assert.equal(c.evento.piantinaUrl, '/media/sala-d.jpg');
  const dopo = await m.archivio.leggi();
  assert.equal(dopo.iscrizioni.filter((i) => i.eventoId === copia.id).length, 0, 'niente iscrizioni');
  assert.equal(dopo.eventi.find((e) => e.id === orig.id)!.pubblicato, true, 'l’originale non cambia');
  const seconda = await m.admin.duplicaSerata(admin, orig.id, '2026-11-14');
  assert.notEqual(seconda.slug, copia.slug, 'stesso giorno due volte: indirizzo diverso');
});

test('duplica serata: a cavallo del cambio d’ora le chiusure restano alla stessa ora locale', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const { id: _i, createdAt: _c, updatedAt: _u, piantinaUrl: _p, numero: _n, ...modello } = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const ora = (iso: string) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  const prova = async (slug: string, data: string, dataFine: string, chiusuraTipo: string, nuovoGiorno: string) => {
    const orig = await m.admin.salvaEvento(admin, null, { ...modello, slug, nome: slug, data, dataFine, pubblicato: true, inCopertina: false });
    const tipo = (await m.admin.eventoAdmin(admin, orig.id))!.lotti[0];
    await m.admin.salvaLotto(admin, { ...tipo, dataInizio: null, dataFine: chiusuraTipo, uscitaGiorniPrima: null, fineOrePrima: null });
    const copia = (await m.admin.duplicaSerata(admin, orig.id, nuovoGiorno));
    const c = (await m.admin.eventoAdmin(admin, copia.id))!;
    return { c, ore: [ora(c.evento.data), ora(c.evento.dataFine!), ora(c.lotti[0].dataFine!)] };
  };

  // Ottobre -> novembre: l'ora legale finisce il 25.10.2026 (la serata a cavallo, chiusura alle 04:00 in ora solare)
  const autunno = await prova('serata-ottobre-ora-legale', '2026-10-24T23:00:00+02:00', '2026-10-25T04:00:00+01:00', '2026-10-24T22:00:00+02:00', '2026-11-07');
  assert.deepEqual(autunno.ore, ['23:00', '04:00', '22:00'], 'apertura, chiusura e fine del tipo restano alle stesse ore');
  assert.equal(autunno.c.evento.dataFine, new Date('2026-11-08T04:00:00+01:00').toISOString());
  assert.equal(autunno.c.lotti[0].dataFine, new Date('2026-11-07T22:00:00+01:00').toISOString());

  // Marzo -> aprile: l'ora legale comincia il 28.03.2027
  const primavera = await prova('serata-marzo-ora-solare', '2027-03-27T23:00:00+01:00', '2027-03-28T04:00:00+02:00', '2027-03-27T22:00:00+01:00', '2027-04-10');
  assert.deepEqual(primavera.ore, ['23:00', '04:00', '22:00']);
  assert.equal(primavera.c.evento.dataFine, new Date('2027-04-11T04:00:00+02:00').toISOString());
  assert.equal(primavera.c.lotti[0].dataFine, new Date('2027-04-10T22:00:00+02:00').toISOString());
});

test('tavoli in serie: tutto o niente, posti obbligatori, solo admin', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const d0 = await m.archivio.leggi();
  const { id: _i, createdAt: _c, updatedAt: _u, piantinaUrl: _p, numero: _n, ...modello } = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const ev = await m.admin.salvaEvento(admin, null, { ...modello, slug: 'serie-tavoli', nome: 'Serie tavoli' });
  const base = { eventoId: ev.id, partenza: 'S1', quanti: 4, zona: null, posti: 8, spesaMinima: 250 };
  await assert.rejects(m.admin.creaTavoliInSerie(staff, base), /non_autorizzato/);
  await assert.rejects(m.admin.creaTavoliInSerie(admin, { ...base, posti: 0 }), /Posti/);
  await assert.rejects(m.admin.creaTavoliInSerie(admin, { ...base, quanti: 0 }), /Quanti/);
  await assert.rejects(m.admin.creaTavoliInSerie(admin, { ...base, quanti: 61 }), /Quanti/);
  await assert.rejects(m.admin.creaTavoliInSerie(admin, { ...base, partenza: ' ' }), /nome di partenza/);
  assert.deepEqual(await m.admin.creaTavoliInSerie(admin, base), ['S1', 'S2', 'S3', 'S4']);
  const tavoli = (await m.admin.eventoAdmin(admin, ev.id))!.tavoli;
  assert.deepEqual(tavoli.map((t) => [t.nome, t.posti, t.spesaMinima, t.ordine]), [['S1', 8, 250, 0], ['S2', 8, 250, 1], ['S3', 8, 250, 2], ['S4', 8, 250, 3]]);
  // Nome già presente: non ne aggiunge nessuno
  await assert.rejects(m.admin.creaTavoliInSerie(admin, { ...base, partenza: 'S3', quanti: 3 }), /Ci sono già: S3, S4/);
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.length, 4);
  // Si prosegue da dove si era arrivati
  await m.admin.creaTavoliInSerie(admin, { ...base, partenza: 'S5', quanti: 2 });
  assert.deepEqual((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.map((t) => t.ordine), [0, 1, 2, 3, 4, 5]);
  // Un tavolo singolo senza posti non si salva più
  await assert.rejects(m.admin.salvaTavolo(admin, { eventoId: ev.id, nome: 'X1', zona: null, posti: null, spesaMinima: 0, stato: 'libero', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 9 }), /posti/);
});

test('capienza: facoltativa, arriva alla porta e alla serata live con gli entrati e i posti liberi', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const staff = await sessione('porta@maremmamusica.test');
  const ev = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  assert.equal(ev.capienza, undefined, 'le serate vecchie non hanno la capienza');
  const prima = (await m.admin.serataLive(admin, ev.id))!;
  assert.equal(prima.capienza, null);
  assert.equal(prima.conteggio.liberi, null, 'senza capienza non ci sono posti liberi');
  assert.equal((await m.porta.eventiPorta(staff)).find((e) => e.id === ev.id)!.capienza, null);

  const { id: _id, createdAt: _c, updatedAt: _u, piantinaUrl: _p, ...dati } = ev;
  await m.admin.salvaEvento(admin, ev.id, { ...dati, capienza: 300 });
  const live = (await m.admin.serataLive(admin, ev.id))!;
  assert.equal(live.capienza, 300);
  assert.equal(live.conteggio.liberi, 300 - live.conteggio.entrati);
  const passaggiTavoli = (await m.archivio.leggi()).prenotazioni.filter((p) => p.eventoId === ev.id).reduce((t, p) => t + p.ingressi.length, 0);
  assert.equal(live.conteggio.entrati, live.entrati + passaggiTavoli, 'entrati = scan di prevendite + passaggi dei QR dei tavoli (una persona ciascuno)');
  assert.equal((await m.porta.eventiPorta(staff)).find((e) => e.id === ev.id)!.capienza, 300);
  await m.admin.salvaEvento(admin, ev.id, { ...dati, capienza: null });
});

test('orario limite: dopo il limite non si vende più, nemmeno riprendendo una richiesta aperta; un pagamento in ritardo va tra i rimborsi', async () => {
  const admin = await sessione('admin@maremmamusica.test');
  const ev = (await m.archivio.leggi()).eventi.find((e) => e.slug === 'halloween-party')!;
  const { id: _id, createdAt: _c, updatedAt: _u, piantinaUrl: _p, ...dati } = ev;
  const base = { slug: 'halloween-party', dataNascita: '1995-03-03', marketing: false, handlePr: null };

  // Prima del limite: la richiesta parte e il posto si tiene.
  const r = await m.pubblico.creaIscrizione({ ...base, nome: 'Lia', cognome: 'Limite', email: 'lia@esempio.it' });
  assert.ok(r.ok);
  const id = r.ok ? r.iscrizione.id : '';
  assert.equal((await m.archivio.leggi()).iscrizioni.find((i) => i.id === id)!.stato, 'in_attesa');

  // Il limite passa (la pagina di pagamento era già aperta).
  await m.admin.salvaEvento(admin, ev.id, { ...dati, prevenditaFinoAlle: '2026-10-01T00:00:00.000Z' });
  try {
    const nuova = await m.pubblico.creaIscrizione({ ...base, nome: 'Max', cognome: 'Tardi', email: 'max@esempio.it' });
    assert.ok(!nuova.ok && /chiuse dalle/.test(nuova.errore), 'server: niente nuove prevendite dopo il limite');
    const riprende = await m.pubblico.creaIscrizione({ ...base, nome: 'Lia', cognome: 'Limite', email: 'lia@esempio.it' });
    assert.ok(!riprende.ok && /chiuse dalle/.test(riprende.errore), 'nemmeno riprendendo la richiesta ancora aperta');
    const zarro = await sessione('zarro@maremmamusica.test');
    assert.equal((await m.pubblico.eventoPerSlug('halloween-party'))!.stato.tipo, 'chiusa', 'la pagina della serata mostra la lista chiusa');
    assert.equal((await m.pubblico.eventoPerSlug('halloween-party', true, zarro.pr!.id))!.stato.tipo, 'chiusa', 'e il link del PR pure');

    // Il pagamento arriva dopo il limite: non diventa un QR, va tra i pagamenti da rimborsare.
    const esito = await m.prevendita.confermaPagamentoIscrizione(id, 'pi_dopo_limite');
    assert.equal(esito.esito, 'da_rimborsare');
    const dopo = (await m.archivio.leggi()).iscrizioni.find((i) => i.id === id)!;
    assert.notEqual(dopo.stato, 'pagato', 'non diventa una prevendita valida');
    assert.equal(dopo.pagamentoOnline?.daRimborsare, true);
    assert.ok((await m.admin.iscrizioniAdmin(admin, { eventoId: ev.id, stato: 'da_rimborsare' })).some((x) => x.iscrizione.id === id));
  } finally {
    await m.admin.salvaEvento(admin, ev.id, { ...dati, prevenditaFinoAlle: null });
  }
  await m.prevendita.chiudiRimborsoIscrizione(admin, id);
});
