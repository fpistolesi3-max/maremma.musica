// Le funzioni delle vendite (iscrizione, pagamento, rimborsi, scadenze, anonimizzazione, annulla / ripristina, cambio di nominativo) fatte
// girare due volte sulla STESSA storia: una con la riga unica (come oggi) e una sulle tabelle del nuovo schema (PGlite, MM_ARCHIVIO=tabelle).
// Le due storie devono dare gli stessi esiti, gli stessi messaggi di errore e gli stessi dati alla fine. È la prova che passare alle tabelle
// non cambia quello che il cliente e l'admin vedono.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ADESSO_TEST, fissaOrologio } from './orologio-test';

fissaOrologio();
const cartella = mkdtempSync(path.join(tmpdir(), 'mm-test-'));
process.env.MM_CARTELLA_DATI = cartella;

type Mod = {
  archivio: typeof import('./archivio');
  pubblico: typeof import('./pubblico');
  prevendita: typeof import('./prevendita');
  rimborsi: typeof import('./rimborsi');
  admin: typeof import('./admin');
  tavoli: typeof import('./tavoli');
  porta: typeof import('./porta');
  posta: typeof import('../posta');
  prove: typeof import('./prova-db');
  store: typeof import('./prova-store');
  tabelle: typeof import('./tabelle');
};
let m: Mod;
/** I dati di partenza (quelli del seed), per far ripartire da capo la riga unica fra una storia e l'altra. */
let inizio0: import('./tipi').Archivio;

before(async () => {
  m = {
    archivio: await import('./archivio'),
    pubblico: await import('./pubblico'),
    prevendita: await import('./prevendita'),
    rimborsi: await import('./rimborsi'),
    admin: await import('./admin'),
    tavoli: await import('./tavoli'),
    porta: await import('./porta'),
    posta: await import('../posta'),
    prove: await import('./prova-db'),
    store: await import('./prova-store'),
    tabelle: await import('./tabelle'),
  };
  inizio0 = structuredClone(await m.archivio.leggi()) as import('./tipi').Archivio;
});
after(() => { m.archivio.usaTabelleDiProva(null); rmSync(cartella, { recursive: true, force: true }); });

type Esito = Record<string, unknown>;
/** Il risultato di una chiamata, o il messaggio dell'errore: così anche gli errori si confrontano. */
async function prova<T>(f: () => Promise<T>): Promise<{ errore: string } | { v: T }> {
  try { return { v: await f() }; } catch (e) { return { errore: (e as Error).message }; }
}
const ore = (n: number) => new Date(ADESSO_TEST.getTime() + n * 3_600_000);

/** La storia. Restituisce solo cose stabili (esiti, stati, messaggi), mai id o orari che cambiano da una corsa all'altra. */
async function storia(): Promise<Esito> {
  const { pubblico: pub, prevendita: pre, rimborsi: rim, admin, archivio } = m;
  const out: Esito = {};
  const lettura = () => archivio.leggi();
  const admin1 = async () => { const d = await lettura(); const utente = d.utenti.find((u) => u.ruolo === 'admin')!; return { utente, pr: null }; };
  const s = await admin1();
  const iscr = async (id: string) => (await lettura()).iscrizioni.find((i) => i.id === id)!;
  const forma = (i: Awaited<ReturnType<typeof iscr>>) => ({
    stato: i.stato, metodo: i.metodoPagamento, scade: i.scade !== null, pagatoAt: i.pagatoAt !== null, annullatoAt: i.annullatoAt !== null,
    online: i.pagamentoOnline && { sessione: i.pagamentoOnline.sessione, pagamento: i.pagamentoOnline.pagamento, daRimborsare: i.pagamentoOnline.daRimborsare, motivo: i.pagamentoOnline.motivo ?? null,
      rimborso: i.pagamentoOnline.rimborso ? { stato: i.pagamentoOnline.rimborso.stato, da: i.pagamentoOnline.rimborso.da } : null,
      inPiu: (i.pagamentoOnline.inPiu ?? []).map((x) => ({ pagamento: x.pagamento, centesimi: x.centesimi, motivo: x.motivo, rimborso: x.rimborso?.stato ?? null })) },
    nome: i.nome, cognome: i.cognome, dataNascita: i.dataNascita, email: i.email, anon: Boolean(i.anonimizzata), eta: i.etaAllaSerata ?? null, canale: i.canale, prId: i.prId !== null, importo: i.importo,
  });
  const esito = (r: Awaited<ReturnType<typeof prova<Awaited<ReturnType<typeof pub.creaIscrizione>>>>>): Esito =>
    'errore' in r ? { errore: r.errore } : r.v.ok ? { ok: true, stato: r.v.iscrizione.stato, importo: r.v.iscrizione.importo, canale: r.v.iscrizione.canale } : { ok: false, campo: r.v.campo ?? null, errore: r.v.errore, esistente: r.v.esistente ?? null };

  const base = { slug: 'halloween-party', nome: 'Parita', cognome: 'Prova', dataNascita: '1999-01-01', email: 'parita@esempio.it', marketing: false, handlePr: 'test-pr' as string | null, canale: 'instagram' };
  // ---- iscrizione
  const ra = await prova(() => pub.creaIscrizione(base));
  out.crea = esito(ra);
  const idA = ('v' in ra && ra.v.ok ? ra.v.iscrizione.id : '');
  out.riprende = esito(await prova(() => pub.creaIscrizione({ ...base, handlePr: null, cognome: ' prova ' })));
  out.riprendeLoStessoId = 'v' in ra && idA !== '' && ((await prova(() => pub.creaIscrizione(base))) as { v: { ok: boolean; iscrizione: { id: string } } }).v.iscrizione.id === idA;
  out.altraEmail = esito(await prova(() => pub.creaIscrizione({ ...base, email: 'altra@esempio.it' })));
  out.minorenne = esito(await prova(() => pub.creaIscrizione({ ...base, cognome: 'Giovane', dataNascita: '2015-03-03', email: 'g@esempio.it' })));
  out.serataSconosciuta = esito(await prova(() => pub.creaIscrizione({ ...base, slug: 'non-esiste' })));
  out.dopoLaDataLimite = esito(await prova(() => pub.creaIscrizione({ ...base, slug: 'ricky-le-roy-monteverdi', cognome: 'Passata' })));
  out.daA = forma(await iscr(idA));

  // ---- pagamento
  const c1 = await prova(() => pre.confermaPagamentoIscrizione(idA, 'pi_a1', ore(1)));
  out.paga = 'errore' in c1 ? c1 : { esito: c1.v.esito, stato: 'biglietto' in c1.v ? c1.v.biglietto.iscrizione.stato : null };
  out.pagaDiNuovo = await prova(() => pre.confermaPagamentoIscrizione(idA, 'pi_a1', ore(1)));
  const c2 = await prova(() => pre.confermaPagamentoIscrizione(idA, 'pi_a2', ore(1)));
  out.pagaUnAltroPagamento = 'errore' in c2 ? c2 : { esito: c2.v.esito, motivo: 'motivo' in c2.v ? c2.v.motivo : null, importo: 'importo' in c2.v ? c2.v.importo : null };
  out.pagaIdSconosciuto = await prova(() => pre.confermaPagamentoIscrizione('00000000-0000-4000-8000-000000000000', 'pi_x', ore(1)));
  out.dopoIlPagamento = forma(await iscr(idA));
  out.doppioneDopoIlPagamento = esito(await prova(() => pub.creaIscrizione(base)));

  // importo sbagliato, poi quello giusto
  const rb = await prova(() => pub.creaIscrizione({ ...base, nome: 'Bruno', cognome: 'Bianchi', dataNascita: '1998-02-02', email: 'b@esempio.it', handlePr: null }));
  const idB = 'v' in rb && rb.v.ok ? rb.v.iscrizione.id : '';
  const cb1 = await prova(() => pre.confermaPagamentoIscrizione(idB, 'pi_b1', ore(1), { centesimi: 900, valuta: 'eur' }));
  out.importoSbagliato = 'errore' in cb1 ? cb1 : { esito: cb1.v.esito, motivo: 'motivo' in cb1.v ? cb1.v.motivo : null, importo: 'importo' in cb1.v ? cb1.v.importo : null };
  const cb2 = await prova(() => pre.confermaPagamentoIscrizione(idB, 'pi_b2', ore(1), { centesimi: 1000, valuta: 'EUR' }));
  out.importoGiusto = 'errore' in cb2 ? cb2 : { esito: cb2.v.esito };
  out.daB = forma(await iscr(idB));

  // pagamento dopo l'orario limite (serata iniziata da un pezzo)
  const rc = await prova(() => pub.creaIscrizione({ ...base, nome: 'Carlo', cognome: 'Tardi', dataNascita: '1997-07-07', email: 'c@esempio.it', handlePr: null }));
  const idC = 'v' in rc && rc.v.ok ? rc.v.iscrizione.id : '';
  const cc = await prova(() => pre.confermaPagamentoIscrizione(idC, 'pi_c1', new Date('2026-11-02T12:00:00Z')));
  out.pagamentoTardivo = 'errore' in cc ? cc : { esito: cc.v.esito, motivo: 'motivo' in cc.v ? cc.v.motivo : null, importo: 'importo' in cc.v ? cc.v.importo : null };
  out.daC = forma(await iscr(idC));

  // ---- rimborsi
  const bers = (id: string, pagamento?: string) => ({ tipo: 'prevendita' as const, id, pagamento: pagamento ?? null });
  const av = await prova(() => rim.avviaRimborso(s, bers(idB)));
  out.avvia = 'errore' in av ? av : { esito: av.v.esito, importo: 'importo' in av.v ? av.v.importo : null, primario: 'primario' in av.v ? av.v.primario : null, pagamento: 'pagamento' in av.v ? av.v.pagamento : null };
  out.avviaDiNuovoSubito = await prova(() => rim.avviaRimborso(s, bers(idB)));
  const sa = await prova(() => rim.avviaRimborso(s, bers(idA, 'pi_a2')));
  out.avviaSuOrdineNonPagato = 'errore' in sa ? sa : { esito: sa.v.esito, importo: 'importo' in sa.v ? sa.v.importo : null, primario: 'primario' in sa.v ? sa.v.primario : null };
  out.respinto = await prova(() => rim.rimborsoRespinto(s, bers(idB)));
  const av2 = await prova(() => rim.avviaRimborso(s, bers(idB)));
  out.avviaDopoIlRespinto = 'errore' in av2 ? av2 : { esito: av2.v.esito };
  const co = await prova(() => rim.concludiRimborso(s, bers(idB)));
  out.concludi = 'errore' in co ? co : co.v === null ? null : { tipo: co.v.tipo, stato: co.v.tipo === 'prevendita' ? co.v.biglietto.iscrizione.stato : null };
  out.concludiDiNuovo = await prova(() => rim.concludiRimborso(s, bers(idB)));
  out.avviaDopoIlRimborso = await prova(() => rim.avviaRimborso(s, bers(idB)));
  out.rimborsoSuPagamentoInPiu = await (async () => {
    const r1 = await prova(() => rim.avviaRimborso(s, bers(idA, 'pi_a2')));
    const r2 = await prova(() => rim.concludiRimborso(s, bers(idA, 'pi_a2')));
    return { avvia: 'errore' in r1 ? r1 : { esito: r1.v.esito, importo: 'importo' in r1.v ? r1.v.importo : null, primario: 'primario' in r1.v ? r1.v.primario : null }, concludi: 'errore' in r2 ? r2 : r2.v };
  })();
  const ex = await prova(() => rim.registraRimborsoEsterno('pi_c1'));
  out.rimborsoEsterno = 'errore' in ex ? ex : { esito: ex.v.esito, chiusura: 'chiusura' in ex.v && ex.v.chiusura ? ex.v.chiusura.tipo : null };
  out.rimborsoEsternoDiNuovo = await prova(() => rim.registraRimborsoEsterno('pi_c1'));
  out.rimborsoEsternoSconosciuto = await prova(() => rim.registraRimborsoEsterno('pi_non_esiste'));
  out.daB2 = forma(await iscr(idB));
  out.daC2 = forma(await iscr(idC));
  const el = await prova(() => rim.rimborsiAdmin(s));
  out.elencoRimborsi = 'errore' in el ? el : {
    daFare: el.v.daFare.map((v) => `${v.persona}|${v.motivo}|${v.stato}|${v.importo}`).sort(),
    fatti: el.v.fatti.map((v) => `${v.persona}|${v.motivo}|${v.stato}|${v.importo}`).sort(),
  };
  const dopoRimborsi = await lettura();
  out.soldi = rim.soldiSerata(dopoRimborsi, dopoRimborsi.eventi.find((e) => e.slug === 'halloween-party')!.id);

  // ---- lascia il posto, sessione, scadenze
  const rd = await prova(() => pub.creaIscrizione({ ...base, nome: 'Dina', cognome: 'Lascia', dataNascita: '1996-06-06', email: 'd@esempio.it', handlePr: null }));
  const idD = 'v' in rd && rd.v.ok ? rd.v.iscrizione.id : '';
  out.lasciaEmailSbagliata = await prova(() => pre.lasciaPosto(idD, 'altra@esempio.it'));
  out.salvaSessione = await prova(async () => { await pre.salvaSessioneIscrizione(idD, 'cs_test_d'); return (await iscr(idD)).pagamentoOnline?.sessione; });
  out.lascia = await prova(() => pre.lasciaPosto(idD, ' D@esempio.it '));
  out.lasciaDiNuovo = await prova(() => pre.lasciaPosto(idD, 'd@esempio.it'));
  out.sessioneSuAnnullata = await prova(async () => { await pre.salvaSessioneIscrizione(idD, 'cs_nuova'); return (await iscr(idD)).pagamentoOnline?.sessione; });
  out.daD = forma(await iscr(idD));
  const re = await prova(() => pub.creaIscrizione({ ...base, nome: 'Elena', cognome: 'Scade', dataNascita: '1995-05-05', email: 'e@esempio.it', handlePr: null }));
  const idE = 'v' in re && re.v.ok ? re.v.iscrizione.id : '';
  out.scadenzaPrima = await prova(async () => { await pre.applicaScadenzeIscrizioni(); return (await iscr(idE)).stato; });
  mock.timers.setTime(ore(3).getTime());           // passano tre ore: il termine per pagare (30 minuti) è scaduto
  out.scadenzaDopo = await prova(async () => { await pre.applicaScadenzeIscrizioni(); return (await iscr(idE)).stato; });
  out.pagaDopoLaScadenza = await (async () => {
    const r = await prova(() => pre.confermaPagamentoIscrizione(idE, 'pi_e1', ore(3)));
    return 'errore' in r ? r : { esito: r.v.esito, stato: 'biglietto' in r.v ? r.v.biglietto.iscrizione.stato : null };
  })();
  mock.timers.setTime(ADESSO_TEST.getTime());

  // ---- anagrafiche che servono alle vendite: un tipo gratuito per la serata "solchi"
  const solchi = (await lettura()).eventi.find((e) => e.slug === 'solchi')!;
  const lottoSolchi = (await lettura()).lotti.find((l) => l.eventoId === solchi.id)!;
  const { id: _id, ...senzaId } = lottoSolchi;
  out.tipoGratuito = await prova(async () => { await admin.salvaLotto(s, { ...senzaId, id: lottoSolchi.id, prezzo: 0, quantita: 2 }); return (await lettura()).lotti.find((l) => l.id === lottoSolchi.id)!.prezzo; });
  const gratis = { ...base, slug: 'solchi', nome: 'Gino', cognome: 'Gratis', dataNascita: '1994-04-04', email: 'g@gratis.it', handlePr: null as string | null };
  const rg = await prova(() => pub.creaIscrizione(gratis));
  const idG = 'v' in rg && rg.v.ok ? rg.v.iscrizione.id : '';
  out.gratis = esito(rg);
  out.gratisPosti = await (async () => {
    const r2 = await prova(() => pub.creaIscrizione({ ...gratis, cognome: 'Secondo', dataNascita: '1993-03-03', email: 'g2@gratis.it' }));
    const r3 = await prova(() => pub.creaIscrizione({ ...gratis, cognome: 'Terzo', dataNascita: '1992-02-02', email: 'g3@gratis.it' }));
    return { secondo: esito(r2), terzo: esito(r3) };
  })();
  out.annullaGratis = await prova(async () => { await admin.cambiaStatoIscrizione(s, idG, 'annulla'); return (await iscr(idG)).stato; });
  out.annullaDiNuovo = await prova(async () => { await admin.cambiaStatoIscrizione(s, idG, 'annulla'); return (await iscr(idG)).stato; });
  out.ripristinaGratis = await prova(async () => { await admin.cambiaStatoIscrizione(s, idG, 'ripristina'); return (await iscr(idG)).stato; });
  out.ripristinaDiNuovo = await prova(async () => { await admin.cambiaStatoIscrizione(s, idG, 'ripristina'); return (await iscr(idG)).stato; });
  out.annullaUnaPagata = await prova(() => admin.cambiaStatoIscrizione(s, idA, 'annulla'));
  out.ripristinaUnaMaiPagata = await prova(() => admin.cambiaStatoIscrizione(s, idD, 'ripristina'));
  out.ripristinaUnaRimborsata = await prova(async () => { await admin.cambiaStatoIscrizione(s, idB, 'ripristina'); return (await iscr(idB)).stato; });
  out.statoIdSconosciuto = await prova(() => admin.cambiaStatoIscrizione(s, '00000000-0000-4000-8000-000000000000', 'annulla'));

  // ---- cambio di nominativo
  const nom = (id: string, dati: { nome: string; cognome: string; dataNascita: string; email?: string | null }) => prova(async () => { await admin.cambiaNominativo(s, id, dati); const i = await iscr(id); return { nome: i.nome, cognome: i.cognome, dataNascita: i.dataNascita, email: i.email }; });
  out.nominativo = await nom(idA, { nome: 'Nuovo', cognome: 'Amico', dataNascita: '2000-02-02', email: 'Nuovo@Esempio.it' });
  out.nominativoSenzaEmail = await nom(idA, { nome: 'Ancora', cognome: 'Amico', dataNascita: '2000-02-02' });
  out.nominativoMinorenne = await nom(idA, { nome: 'Piccolo', cognome: 'Amico', dataNascita: '2015-02-02' });
  out.nominativoVuoto = await nom(idA, { nome: '  ', cognome: 'Amico', dataNascita: '2000-02-02' });
  out.nominativoEmailBrutta = await nom(idA, { nome: 'Ancora', cognome: 'Amico', dataNascita: '2000-02-02', email: 'brutta' });
  out.nominativoDoppione = await nom(idA, { nome: 'Bruno', cognome: 'bianchi', dataNascita: '1998-02-02' }); // Bruno è rimborsato: non conta
  out.nominativoDoppioneVero = await nom(idG, { nome: 'Ancora', cognome: ' AMICO ', dataNascita: '2000-02-02' }); // idG è di un'altra serata
  out.nominativoSuRimborsata = await nom(idB, { nome: 'X', cognome: 'Y', dataNascita: '1990-01-01' });
  out.nominativoSconosciuto = await nom('00000000-0000-4000-8000-000000000000', { nome: 'X', cognome: 'Y', dataNascita: '1990-01-01' });

  // ---- anonimizzazione: 30 giorni dopo la serata
  out.anonimizzaPresto = await prova(() => pre.anonimizzaIscrizioniVecchie(ore(24)));
  out.anonimizza = await prova(() => pre.anonimizzaIscrizioniVecchie(new Date('2026-12-15T12:00:00Z')));
  out.anonimizzaDiNuovo = await prova(() => pre.anonimizzaIscrizioniVecchie(new Date('2026-12-15T12:00:00Z')));
  const fine = await lettura();
  out.dopoAnonimizzazione = fine.iscrizioni.filter((i) => i.eventoId !== solchi.id).map((i) => ({ anon: Boolean(i.anonimizzata), nome: i.nome, email: i.email, nascita: i.dataNascita, eta: i.etaAllaSerata ?? null, stato: i.stato, importo: i.importo, canale: i.canale })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  out.conteggioFinale = { iscrizioni: fine.iscrizioni.length, perStato: Object.fromEntries(['in_attesa', 'scaduta', 'in_lista', 'pagato', 'entrato', 'annullato', 'rimborsato'].map((st) => [st, fine.iscrizioni.filter((i) => i.stato === st).length])) };
  return out;
}

test('le vendite sulle tabelle fanno quello che fanno sulla riga unica: stessi esiti, stessi errori, stessi dati', async () => {
  // Stessi dati di partenza per tutte e due: quelli che il file ha creato.
  const inizio = structuredClone(inizio0);
  const sulla = await storia();

  const db = await m.prove.creaDb();
  try {
    await m.prove.scriviRiga(db, inizio, 1);
    const { importa } = await import('./prova-vendite');
    await importa(db);
    mock.timers.setTime(ADESSO_TEST.getTime());
    m.archivio.usaTabelleDiProva({ store: m.store.storeDaDb(db), rpc: m.store.rpcDaDb(db) });
    assert.equal(m.archivio.modalitaCorrente(), 'tabelle');
    const sulleTabelle = await storia();

    // Prima il confronto chiave per chiave (così l'errore dice dove), poi tutto insieme.
    for (const k of Object.keys(sulla)) assert.deepEqual(sulleTabelle[k], sulla[k], `differenza in "${k}"`);
    assert.deepEqual(Object.keys(sulleTabelle), Object.keys(sulla));

    // E la storia vuol dire qualcosa (le due strade non sono uguali perché falliscono nello stesso modo).
    const c = sulleTabelle as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.deepEqual(c.crea, { ok: true, stato: 'in_attesa', importo: 10, canale: 'instagram' });
    assert.equal(c.riprendeLoStessoId, true);
    assert.deepEqual([c.altraEmail.campo, c.minorenne.campo, c.doppioneDopoIlPagamento.campo], ['email', 'nascita', 'cognome']);
    assert.deepEqual(c.paga, { esito: 'confermata', stato: 'pagato' });
    assert.equal(c.pagaDiNuovo.v.esito, 'gia');
    assert.deepEqual(c.pagaUnAltroPagamento, { esito: 'da_rimborsare', motivo: 'secondo_pagamento', importo: 10 });
    assert.deepEqual(c.importoSbagliato, { esito: 'da_rimborsare', motivo: 'importo', importo: 9 });
    assert.equal(c.importoGiusto.esito, 'confermata');
    assert.deepEqual(c.pagamentoTardivo, { esito: 'da_rimborsare', motivo: 'serata_iniziata', importo: 10 });
    assert.deepEqual([c.avvia.esito, /^Il rimborso .* in corso/.test(c.avviaDiNuovoSubito.errore), c.avviaDopoIlRespinto.esito], ['avviato', true, 'avviato']);
    assert.deepEqual(c.concludi, { tipo: 'prevendita', stato: 'rimborsato' });
    assert.deepEqual([c.concludiDiNuovo.v, c.avviaDopoIlRimborso.v.esito], [null, 'gia']);
    assert.deepEqual(c.rimborsoEsterno, { esito: 'registrato', chiusura: 'prevendita' });
    assert.deepEqual([c.rimborsoEsternoDiNuovo.v.esito, c.rimborsoEsternoSconosciuto.v.esito], ['gia', 'sconosciuto']);
    assert.deepEqual([c.lasciaEmailSbagliata.v, c.lascia.v, c.lasciaDiNuovo.v], [false, true, false]);
    assert.deepEqual([c.scadenzaPrima.v, c.scadenzaDopo.v], ['in_attesa', 'scaduta']);
    assert.deepEqual(c.pagaDopoLaScadenza, { esito: 'confermata', stato: 'pagato' });
    assert.deepEqual([c.annullaGratis.v, c.ripristinaGratis.v], ['annullato', 'in_lista']);
    assert.match(c.annullaUnaPagata.errore, /usa Annulla e rimborsa/);
    assert.match(c.ripristinaUnaMaiPagata.errore, /mai stata pagata/);
    assert.equal(c.nominativo.v.email, 'nuovo@esempio.it');
    assert.ok(c.anonimizza.v >= 3);
    assert.ok((c.dopoAnonimizzazione as { anon: boolean }[]).every((i) => i.anon));

    // Le tabelle sono coerenti dopo tutta la storia: nessun posto occupato in più, un pagamento principale per ordine al massimo.
    const r = await db.query<{ n: string }>("select count(*)::text as n from (select iscrizione_id from public.pagamenti where ruolo = 'principale' and iscrizione_id is not null group by 1 having count(*) > 1) x");
    assert.equal(r.rows[0].n, '0');
  } finally {
    m.archivio.usaTabelleDiProva(null);
    await db.close();
  }
});

// ------------------------------------------------------------------ tavoli, porta, accessi, email

async function storiaTavoliPorta(): Promise<Esito> {
  const { tavoli: tav, porta, admin, archivio, posta, prevendita: pre, rimborsi: rim } = m;
  const out: Esito = {};
  const lettura = () => archivio.leggi();
  const d0 = await lettura();
  const sess = (email: string) => { const utente = d0.utenti.find((u) => u.email === email)!; return { utente, pr: utente.prId ? d0.pr.find((p) => p.id === utente.prId)! : null }; };
  const sAdmin = sess('admin@maremmamusica.test'); const sStaff = sess('porta@maremmamusica.test'); const sPr = sess('test-pr@maremmamusica.test'); const sPr2 = sess('zarro@maremmamusica.test');
  const ev = d0.eventi.find((e) => e.slug === 'halloween-party')!;
  const pren = async (id: string) => (await lettura()).prenotazioni.find((p) => p.id === id)!;
  const vistaDi = (v: Awaited<ReturnType<typeof tav.annullaPrenotazione>>) => v && ({ stato: v.prenotazione.stato, tavolo: v.tavolo.nome, persone: v.prenotazione.persone, chiusaDa: v.prenotazione.chiusaDa, avviso: v.prenotazione.avvisoChiusuraAt !== null });
  const esitoPren = (r: Awaited<ReturnType<typeof tav.prenotaTavolo>>) => ('ok' in r && r.ok ? { ok: true, stato: r.prenotazione.stato, persone: r.prenotazione.persone, spesa: r.prenotazione.spesaMinima, inseritaDa: r.prenotazione.inseritaDa, pr: r.prenotazione.prId !== null } : { ok: false, campo: (r as { campo?: string }).campo ?? null, errore: (r as { errore: string }).errore });
  const idDi = (r: Awaited<ReturnType<typeof tav.prenotaTavolo>>) => ('ok' in r && r.ok ? r.prenotazione.id : '');

  // ---- le anagrafiche che servono (tavoli) salvate dall'admin
  const base = { eventoId: ev.id, zona: 'Pista', posti: 4 as number | null, spesaMinima: 150, stato: 'libero' as const, nota: null, visibileDaPr: true, prAbilitati: null, ordine: 0 };
  for (const [nome, extra] of [['T1', {}], ['T2', { posti: 6, spesaMinima: 200, ordine: 1 }], ['T3', { posti: 2, spesaMinima: 90, visibileDaPr: false, ordine: 2 }], ['T4', { posti: 8, spesaMinima: 400, ordine: 3 }], ['T5', { stato: 'non_in_vendita' as never, ordine: 4 }],
    ['T6', { posti: 2, spesaMinima: 90, visibileDaPr: false, ordine: 5 }], ['T7', { posti: 4, ordine: 6 }], ['T8', { posti: 8, spesaMinima: 300, ordine: 7 }], ['T9', { posti: 4, ordine: 8 }]] as const) {
    out[`salva${nome}`] = await prova(() => admin.salvaTavolo(sAdmin, { ...base, nome, ...extra }));
  }
  const tavoli = (await lettura()).tavoli.filter((t) => t.eventoId === ev.id);
  const T = (nome: string) => tavoli.find((t) => t.nome === nome)!.id;
  out.elencoPubblico = await prova(async () => (await tav.tavoliPubblici('halloween-party'))!.tavoli.map((t) => `${t.nome}:${t.libero}`).sort());

  // ---- richieste
  const cl = (n: number, o: Record<string, unknown> = {}) => ({ tavoloId: T('T1'), nome: `Cli${n}`, cognome: `Tavolo${n}`, email: `cli${n}@esempio.it`, telefono: `+39 333 10000${n}0`, persone: 4, ...o });
  const r1 = await prova(() => tav.prenotaTavolo(cl(1), null));
  out.richiesta1 = 'errore' in r1 ? r1 : esitoPren(r1.v);
  const id1 = 'v' in r1 ? idDi(r1.v) : '';
  // Il primo cliente paga subito: da qui in poi la sua email e il suo telefono tengono un tavolo vero.
  const ok = async (id: string, pagamento: string, ricevuto?: { centesimi: number; valuta: string }) => {
    const r = await prova(() => tav.confermaPagamentoOnline(id, pagamento, new Date(), ricevuto));
    return 'errore' in r ? r : { esito: r.v.esito, stato: 'vista' in r.v ? r.v.vista.prenotazione.stato : null, motivo: 'motivo' in r.v ? r.v.motivo : null, importo: 'importo' in r.v ? r.v.importo : null };
  };
  out.paga1 = await ok(id1, 'pi_t1');
  out.paga1Ripetuto = await ok(id1, 'pi_t1');
  out.paga1Secondo = await ok(id1, 'pi_t1b');
  const errori = async (nome: string, dati: ReturnType<typeof cl>, handle: string | null = null) => { const r = await prova(() => tav.prenotaTavolo(dati, handle)); out[nome] = 'errore' in r ? r : esitoPren(r.v); };
  await errori('stessoTavolo', cl(2));
  await errori('troppiPerIlTavolo', cl(3, { tavoloId: T('T2'), persone: 9 }));
  await errori('stessaEmail', cl(1, { tavoloId: T('T2'), telefono: '+39 340 5550000', nome: 'Altro' }));
  await errori('stessoTelefono', cl(4, { tavoloId: T('T2'), telefono: '333-10000 10' }));
  await errori('nonInVendita', cl(5, { tavoloId: T('T5') }));
  await errori('tavoloSconosciuto', cl(6, { tavoloId: '00000000-0000-4000-8000-000000000000' }));
  await errori('personeNonValide', cl(7, { tavoloId: T('T2'), persone: 0 }));
  await errori('emailBrutta', cl(8, { tavoloId: T('T2'), email: 'brutta' }));
  await errori('conLinkDelPr', cl(9, { tavoloId: T('T4') }), 'test-pr');
  const prDi4 = await prova(async () => (await pren(idDi((await tav.prenotaTavolo(cl(10, { tavoloId: T('T4') }), null)) as never))).prId);
  // un cliente che cambia idea: la richiesta lasciata a metà si chiude e si riparte (stessa email, altro tavolo)
  const rr = await prova(() => tav.prenotaTavolo(cl(11, { tavoloId: T('T2') }), null));
  const idR = 'v' in rr ? idDi(rr.v) : '';
  const rr2 = await prova(() => tav.prenotaTavolo(cl(11, { tavoloId: T('T3'), persone: 2 }), null));
  out.cambiaIdea = { seconda: 'errore' in rr2 ? rr2 : esitoPren(rr2.v), vecchia: (await pren(idR)).stato, avviso: (await pren(idR)).avvisoChiusuraAt !== null };
  out.richiestaDelPr = await prova(async () => esitoPren(await tav.prPrenotaTavolo(sPr, cl(12, { tavoloId: T('T2') }))));
  out.prSuTavoloNonSuo = await prova(async () => esitoPren(await tav.prPrenotaTavolo(sPr, cl(13, { tavoloId: T('T3') }))));
  out.prDiUnAltro = await prova(() => tav.prPrenotaTavolo(sPr2, { ...cl(14, { tavoloId: T('T2') }) }).then(esitoPren));
  out.richiestaDellaCrew = await prova(async () => esitoPren(await tav.adminPrenotaTavolo(sAdmin, cl(15, { tavoloId: T('T6'), persone: 2 }))));
  out.prenotaDaStaff = await prova(() => tav.adminPrenotaTavolo(sStaff, cl(16)));
  const idPr = (await lettura()).prenotazioni.find((p) => p.email === 'cli12@esempio.it')?.id ?? '';
  const idCrew = (await lettura()).prenotazioni.find((p) => p.email === 'cli15@esempio.it')?.id ?? '';
  out.stati1 = (await lettura()).prenotazioni.map((p) => `${p.cognome}:${p.stato}:${p.inseritaDa}`).sort();

  // ---- pagamenti
  out.pagaImportoSbagliato = await ok(idPr, 'pi_pr1', { centesimi: 100, valuta: 'eur' });
  out.pagaImportoGiusto = await ok(idPr, 'pi_pr2', { centesimi: 20000, valuta: 'EUR' });
  out.pagaSconosciuta = await ok('00000000-0000-4000-8000-000000000000', 'pi_x');
  out.dopoIPagamenti = (await lettura()).tavoli.filter((t) => t.eventoId === ev.id).map((t) => `${t.nome}:${t.stato}`).sort();

  // ---- annullare e lasciare
  out.annullaDellaCrew = await prova(async () => vistaDi(await tav.annullaPrenotazione(sAdmin, idCrew)));
  out.annullaDiNuovo = await prova(async () => vistaDi(await tav.annullaPrenotazione(sAdmin, idCrew)));
  out.annullaUnaPagata = await prova(() => tav.annullaPrenotazione(sAdmin, id1));
  out.annullaSconosciuta = await prova(() => tav.annullaPrenotazione(sAdmin, '00000000-0000-4000-8000-000000000000'));
  out.annullaDaStaff = await prova(() => tav.annullaPrenotazione(sStaff, id1));
  const rl = await prova(() => tav.prenotaTavolo(cl(17, { tavoloId: T('T7'), persone: 2 }), null));
  const idL = 'v' in rl ? idDi(rl.v) : '';
  out.lasciaEmailSbagliata = await prova(async () => vistaDi(await tav.lasciaTavolo(idL, 'sbagliata@esempio.it')));
  out.lascia = await prova(async () => vistaDi(await tav.lasciaTavolo(idL, ' CLI17@esempio.it ')));
  out.lasciaDiNuovo = await prova(async () => vistaDi(await tav.lasciaTavolo(idL, 'cli17@esempio.it')));
  out.annullaDelPrSuQuellaDiUnAltro = await prova(() => tav.annullaPrenotazione(sPr2, idPr));
  const sessioneT = await prova(async () => { await tav.salvaSessionePagamento(idR, 'cs_nuova'); return (await pren(idR)).pagamentoOnline?.sessione; });
  out.sessioneSuChiusa = sessioneT;

  // ---- rimborso di un tavolo
  const bers = (id: string, pagamento?: string) => ({ tipo: 'tavolo' as const, id, pagamento: pagamento ?? null });
  const av = await prova(() => rim.avviaRimborso(sAdmin, bers(id1)));
  out.rimborsoAvvia = 'errore' in av ? av : { esito: av.v.esito, importo: 'importo' in av.v ? av.v.importo : null };
  const co = await prova(() => rim.concludiRimborso(sAdmin, bers(id1)));
  out.rimborsoConcludi = 'errore' in co ? co : co.v === null ? null : { tipo: co.v.tipo, stato: co.v.tipo === 'tavolo' ? co.v.vista.prenotazione.stato : null };
  out.rimborsoConcludiDiNuovo = await prova(() => rim.concludiRimborso(sAdmin, bers(id1)));
  out.tavoloLiberoDopoIlRimborso = await prova(async () => (await lettura()).tavoli.find((t) => t.id === T('T1'))!.stato);

  // ---- scadenze, avvisi, promemoria (il tempo passa)
  const rp = await prova(() => tav.prPrenotaTavolo(sPr, cl(18, { tavoloId: T('T8'), persone: 8 })));
  out.richiestaDelPr2 = 'errore' in rp ? rp : esitoPren(rp.v);
  const rc = await prova(() => tav.prenotaTavolo(cl(19, { tavoloId: T('T9') }), null));
  mock.timers.setTime(new Date(ADESSO_TEST.getTime() + 4 * 3_600_000).getTime()); // quattro ore dopo: il cliente è scaduto, la richiesta del PR (24 ore) no
  out.scadenze = await prova(async () => { await tav.applicaScadenze(); return (await lettura()).prenotazioni.filter((p) => p.stato === 'scaduta').map((p) => p.cognome).sort(); });
  const avv = await prova(() => tav.chiuseDaAvvisare());
  out.avvisiDiChiusura = 'errore' in avv ? avv : avv.v.map((v) => v.prenotazione.cognome).sort();
  out.avvisiDiChiusuraDiNuovo = await prova(async () => (await tav.chiuseDaAvvisare()).length);
  const pm = await prova(() => tav.promemoriaRichiestePr());
  out.promemoria = 'errore' in pm ? pm : pm.v.map((x) => `${x.vista.prenotazione.cognome}|${x.emailPr}`).sort();
  out.promemoriaDiNuovo = await prova(async () => (await tav.promemoriaRichiestePr()).length);
  out.richiestaDopoLaScadenza = 'v' in rc ? true : false;
  mock.timers.setTime(ADESSO_TEST.getTime());

  // ---- porta
  // (La prevendita in attesa si crea prima di spostare la serata: dopo l'inizio non si può più iscriversi.)
  const inAttesa = await prova(() => m.pubblico.creaIscrizione({ slug: 'halloween-party', nome: 'Porta', cognome: 'Attesa', dataNascita: '1999-09-09', email: 'pa@esempio.it', marketing: false, handlePr: null }));
  const idAttesa = 'v' in inAttesa && inAttesa.v.ok ? inAttesa.v.iscrizione.id : '';
  // La porta si apre 12 ore prima dell'inizio e si chiude a fine serata: per queste prove la serata comincia la sera del 19.10, come gli ingressi qui sotto.
  const { id: _idEv, createdAt: _cEv, updatedAt: _uEv, piantinaUrl: _pEv, ...datiEv } = ev;
  out.serataDellaPorta = await prova(async () => { await admin.salvaEvento(sAdmin, ev.id, { ...datiEv, data: '2026-10-19T21:00:00.000Z', dataFine: '2026-10-20T03:00:00.000Z' }); return true; });
  const o = (rif?: string) => ({ porta: 'P1', ora: '2026-10-19T20:00:00.000Z', rif });
  const tokenT = (await pren(id1)).tokenQr; // rimborsata: non entra
  out.portaTavoloRimborsato = await prova(async () => (await porta.checkIn(sStaff, ev.id, tokenT, o(), 'r0')).esito);
  const idPag = idPr; const tokenPag = (await pren(idPag)).tokenQr;       // pagata, 6 persone
  const passaggi: string[] = [];
  for (let k = 1; k <= 7; k++) passaggi.push((await prova(async () => (await porta.checkIn(sStaff, ev.id, tokenPag, { porta: k % 2 ? 'P1' : 'P2', ora: `2026-10-19T20:0${k}:00.000Z` }, `rif-${k}`)).esito)) as never as string);
  out.portaTavolo = passaggi.map((x) => JSON.stringify(x));
  out.portaTavoloRifRipetuto = await prova(async () => { const r = await porta.checkIn(sStaff, ev.id, tokenPag, o(), 'rif-2'); return r.esito === 'entrato' ? r.ora : r.esito; });
  out.portaTavoloIngressi = (await pren(idPag)).ingressi.map((i) => `${i.rif}|${i.porta}`).sort();
  const dtutte = await lettura();
  const pagata = dtutte.iscrizioni.find((i) => i.stato === 'pagato' && i.eventoId === ev.id)!;
  out.portaIscrizione = await prova(async () => [(await porta.checkIn(sStaff, ev.id, pagata.tokenQr, o())).esito, (await porta.checkIn(sStaff, ev.id, pagata.tokenQr, o())).esito, (await porta.checkIn(sStaff, ev.id, (await pren(idPag)).codice, o())).esito]);
  out.portaNonPagata = await prova(async () => (await porta.checkIn(sStaff, ev.id, (await lettura()).iscrizioni.find((i) => i.id === idAttesa)!.tokenQr, o())).esito);
  out.portaQrFalso = await prova(async () => (await porta.checkIn(sStaff, ev.id, 'MM1.falso.1.firma', o())).esito);
  out.portaDaUnPr = await prova(() => porta.checkIn(sPr, ev.id, pagata.tokenQr, o()));
  const altra = dtutte.iscrizioni.find((i) => i.stato === 'pagato' && i.eventoId === ev.id && i.id !== pagata.id)!;
  out.portaRifiuto = await prova(async () => { const r = await porta.rifiutaIngresso(sStaff, ev.id, altra.tokenQr, { porta: 'P2', ora: '2026-10-19T20:30:00.000Z' }); return [r.esito, (await lettura()).iscrizioni.find((i) => i.id === altra.id)!.rifiutoIngresso]; });
  out.portaRifiutoDiNuovo = await prova(async () => (await porta.rifiutaIngresso(sStaff, ev.id, altra.tokenQr, { porta: 'P2', ora: '2026-10-19T20:30:00.000Z' })).esito);
  out.portaRifiutoSuEntrato = await prova(async () => (await porta.rifiutaIngresso(sStaff, ev.id, pagata.tokenQr, { porta: 'P2', ora: '2026-10-19T20:30:00.000Z' })).esito);
  out.portaRifiutoSuTavolo = await prova(async () => (await porta.rifiutaIngresso(sStaff, ev.id, tokenPag, { porta: 'P2', ora: '2026-10-19T20:30:00.000Z' })).esito);
  await porta.segnaPorta('P1', ev.id);
  await porta.segnaPorta('P2', ev.id);
  out.porte = (await lettura()).porte.map((p) => `${p.nome}:${p.ingressi}`).sort();

  // ---- email (il registro delle email di prova è una anagrafica: serate e PR si scrivono come prima)
  out.invio = await prova(async () => {
    // (Un secondo fra una e l'altra: nelle tabelle l'ordine del registro lo dà l'orario d'invio.)
    mock.timers.setTime(ADESSO_TEST.getTime() + 1000);
    const v1 = await posta.inviaEmail({ a: 'uno@esempio.it', oggetto: 'Primo', html: '<p>uno</p>' });
    mock.timers.setTime(ADESSO_TEST.getTime() + 2000);
    const v2 = await posta.inviaEmail({ a: 'due@esempio.it', oggetto: 'Secondo', html: '<p>due</p>' });
    mock.timers.setTime(ADESSO_TEST.getTime() + 3000);
    const v3 = await posta.inviaEmail({ a: 'tre@esempio.it', oggetto: 'Terzo', html: '<p>tre</p>' });
    mock.timers.setTime(ADESSO_TEST.getTime());
    return [v1, v2, v3];
  });
  out.posta = (await lettura()).posta.map((e) => `${e.a}|${e.oggetto}|${e.via}`);
  void pre;
  return out;
}

test('tavoli, porta ed email sulle tabelle fanno quello che fanno sulla riga unica: stessi esiti, stessi errori, stessi dati', async () => {
  // La riga unica riparte dai dati di partenza.
  mock.timers.setTime(ADESSO_TEST.getTime());
  await m.archivio.modifica((d) => { Object.assign(d, structuredClone(inizio0)); });
  const sulla = await storiaTavoliPorta();

  const db = await m.prove.creaDb();
  try {
    await m.prove.scriviRiga(db, structuredClone(inizio0), 1);
    const { importa } = await import('./prova-vendite');
    await importa(db);
    mock.timers.setTime(ADESSO_TEST.getTime());
    m.archivio.usaTabelleDiProva({ store: m.store.storeDaDb(db), rpc: m.store.rpcDaDb(db) });
    const sulleTabelle = await storiaTavoliPorta();
    for (const k of Object.keys(sulla)) assert.deepEqual(sulleTabelle[k], sulla[k], `differenza in "${k}"`);
    assert.deepEqual(Object.keys(sulleTabelle), Object.keys(sulla));

    // La storia vuol dire qualcosa.
    const c = sulleTabelle as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(c.richiesta1.ok, true);
    assert.match(c.stessoTavolo.errore, /Qualcuno ha appena preso/);
    assert.match(c.troppiPerIlTavolo.errore, /6 persone al massimo/);
    assert.deepEqual([c.stessaEmail.campo, c.stessoTelefono.campo, c.nonInVendita.campo, c.personeNonValide.campo, c.emailBrutta.campo], ['email', 'telefono', 'tavolo', 'persone', 'email']);
    assert.deepEqual([c.cambiaIdea.vecchia, c.cambiaIdea.avviso, c.cambiaIdea.seconda.ok], ['annullata', true, true]);
    assert.equal(c.richiestaDelPr.v.pr, true);
    assert.match(c.prSuTavoloNonSuo.v.errore, /affidati a te/);
    assert.deepEqual([c.paga1.esito, c.paga1Ripetuto.esito, c.paga1Secondo.motivo, c.pagaImportoSbagliato.motivo, c.pagaImportoGiusto.esito], ['confermata', 'gia', 'secondo_pagamento', 'importo', 'confermata']);
    assert.deepEqual([c.annullaDellaCrew.v.stato, c.annullaDiNuovo.v, c.lascia.v.stato, c.lasciaDiNuovo.v, c.lasciaEmailSbagliata.v], ['annullata', null, 'annullata', null, null]);
    assert.match(c.annullaUnaPagata.errore, /usa Annulla e rimborsa/);
    assert.match(c.annullaDaStaff.errore, /non_autorizzato/);
    assert.deepEqual([c.rimborsoAvvia.esito, c.rimborsoConcludi.stato, c.rimborsoConcludiDiNuovo.v, c.tavoloLiberoDopoIlRimborso.v], ['avviato', 'rimborsata', null, 'libero']);
    assert.ok(c.scadenze.v.length >= 1 && c.avvisiDiChiusura.length >= 0 && c.avvisiDiChiusuraDiNuovo.v === 0 && c.promemoriaDiNuovo.v === 0);
    assert.ok(c.promemoria.length >= 1, 'il PR riceve un promemoria');
    assert.equal(c.portaTavoloRimborsato.v, 'annullato');
    assert.ok(c.portaIscrizione.v[0] === 'entrato' && c.portaIscrizione.v[1] === 'gia_entrato');
    assert.equal(c.portaNonPagata.v, 'non_pagato');
    assert.equal(c.portaQrFalso.v, 'non_valido');
    assert.match(c.portaDaUnPr.errore, /non_autorizzato/);
    assert.equal(c.portaRifiuto.v[0], 'rifiutato');
    assert.deepEqual(c.invio.v, ['archivio', 'archivio', 'archivio']);
    assert.equal(c.posta.length, 3);
    assert.match(c.posta[0], /tre@esempio.it\|Terzo/, 'le più recenti per prime');
  } finally {
    m.archivio.usaTabelleDiProva(null);
    await db.close();
  }
});
