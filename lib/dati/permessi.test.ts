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
  const base = { eventoId: ev.id, nome: 'T1', zona: 'Privé', posti: 8, spesaMinima: 300, stato: 'libero' as const, nota: null, visibileDaPr: true, prAbilitati: null, ordine: 0 };

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

  // Richiesta dal link del PR: sua se il tavolo gli è affidato, altrimenti Maremma Musica
  const r1 = await tv.prenotaTavolo({ ...chi, tavoloId: await id('A1') }, 'test-pr');
  assert.ok(r1.ok);
  const p1 = r1.ok ? r1.prenotazione : null!;
  assert.deepEqual([p1.prId, p1.stato, p1.spesaMinima], [pr.pr!.id, 'in_attesa', 200]);
  assert.ok(new Date(p1.scade).getTime() <= new Date(ev.data).getTime(), 'il termine non supera l’apertura');
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === 'A1')!.stato, 'riservato');
  const r2 = await tv.prenotaTavolo({ ...chi, email: 'ugo@esempio.it', tavoloId: await id('A2') }, 'test-pr');
  assert.equal(r2.ok && r2.prenotazione.prId, null, 'A2 è solo di Zarro: dal link di un altro PR resta a Maremma Musica');

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
  assert.deepEqual((await tv.tavoliDelPr(pr, ev.id)).mie.map((v) => v.prenotazione.id), [p1.id]);
  assert.equal((await tv.tavoliDelPr(zarro, ev.id)).mie.length, 0);
  await assert.rejects(tv.tavoliDelPr(staff, ev.id), /non_autorizzato/);

  // La prenotazione si legge solo con l'email giusta
  assert.equal(await tv.prenotazionePubblica(p1.id, 'sbagliata@esempio.it'), null);
  assert.equal((await tv.prenotazionePubblica(p1.id, 'RITA@esempio.it'))!.tavolo.nome, 'A1');

  // Solo l'admin segna il pagamento; con la prenotazione attiva lo stato del tavolo non si cambia a mano né si elimina
  await assert.rejects(tv.confermaPrenotazione(pr, p1.id), /non_autorizzato/);
  await assert.rejects(tv.prenotazioniAdmin(staff, ev.id), /non_autorizzato/);
  await tv.confermaPrenotazione(admin, p1.id);
  await m.admin.salvaTavolo(admin, { ...base, id: await id('A1'), nome: 'A1', stato: 'libero' });
  assert.equal((await m.admin.eventoAdmin(admin, ev.id))!.tavoli.find((t) => t.nome === 'A1')!.stato, 'confermato');
  await assert.rejects(async () => m.admin.eliminaTavolo(admin, await id('A1')), /prenotazione/);
  await assert.rejects(tv.annullaPrenotazione(pr, p1.id), /non_autorizzato/, 'pagata: il PR non la annulla più');
  await assert.rejects(tv.annullaPrenotazione(zarro, r2.ok ? r2.prenotazione.id : ''), /non_autorizzato/);

  const live = (await m.admin.serataLive(admin, ev.id))!.tavoli;
  assert.deepEqual([live.totale, live.pagati, live.incassato, live.persone, live.inAttesa, live.atteso, live.liberi], [3, 1, 200, 4, 1, 200, 1]);
  assert.deepEqual(live.perLista.map((r) => [r.nome, r.pagati, r.inAttesa]), [['Test PR', 1, 0], ['Maremma Musica', 0, 1]]);

  // Termine passato senza pagamento: la prenotazione decade da sola e il tavolo torna libero
  const p2 = r2.ok ? r2.prenotazione.id : '';
  await m.archivio.modifica((d) => { d.prenotazioni.find((p) => p.id === p2)!.scade = new Date(Date.now() - 1000).toISOString(); });
  assert.equal((await tv.tavoliPubblici('halloween-party'))!.tavoli.find((t) => t.nome === 'A2')!.libero, true);
  assert.equal((await tv.prenotazionePubblica(p2, 'ugo@esempio.it'))!.prenotazione.stato, 'scaduta');
  await assert.rejects(tv.confermaPrenotazione(admin, p2), /termine è passato/);

  // L'admin annulla anche una pagata: il tavolo si libera
  await tv.annullaPrenotazione(admin, p1.id);
  assert.equal((await tv.tavoliPubblici('halloween-party'))!.tavoli.find((t) => t.nome === 'A1')!.libero, true);
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
  const o = { incassa: false, metodo: 'porta_contanti' as const, porta: 'P1', ora: new Date().toISOString() };
  const voce = async () => (await m.porta.elencoPorta(staff, ev.id)).find((v) => v.id === p.id)!;

  // In attesa di pagamento: è in elenco ma il QR non vale
  assert.deepEqual([(await voce()).origine, (await voce()).tavolo], ['tavolo', { nome: 'P1', persone: 2, entrati: 0, pagato: false }]);
  const nonPagato = await m.porta.checkIn(staff, ev.id, p.tokenQr, o, 'm0');
  assert.ok(nonPagato.esito === 'non_valido' && /non ancora pagato/.test(nonPagato.motivo));

  await tv.confermaPrenotazione(admin, p.id);
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
