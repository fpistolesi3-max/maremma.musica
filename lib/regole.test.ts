import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { finestraLotto, tipiVista, componiData, etaSufficiente, giaIscritto, statoLista, chiaveCognome, richiesteTavoliAperte, scadenzaPagamentoOnline, MINUTI_PAGAMENTO_ONLINE, ORE_PAGAMENTO_ONLINE_PR, iscrizioneScaduta, tienePosto, pagamentoIscrizioneValido, sceltaCopertina, percorsoInterno, prezzoDaTipi, prezzoVendibile, testoPrezzoTipi, pubblicatoDopoSalvataggio, cosaManca, nomiInSerie, coordinateDaLinkMaps, chipLista, prevenditeChiuseDa, scadenzaPrevendita, limitePrevendita, limiteIngresso, testoLimite, istanteDopoApertura } from './regole';
import { creaCodice, creaTokenQr, leggiTokenQr, verificaTokenQr } from './qr-token';
import { categoriaDaControllare, cercaPerNome, conteggioPorta, decidiIngresso, oltreLimite, trovaVoce, type VocePorta } from './porta-logica';
import { dataPunti, orari, euro, isoRoma, spostaGiorni, giorniTra } from './formato';
import type { Evento, Iscrizione, Lotto } from './dati/tipi';
import { canaleDaReferer, canaleDaUserAgent, normalizzaCanale } from './canali';

const evento = (p: Partial<Evento> = {}): Evento => ({
  id: 'e1', numero: 25, slug: 'halloween-party', nome: 'Halloween Party', data: '2026-10-31T22:00:00+01:00', dataFine: '2026-11-01T04:00:00+01:00',
  location: null, comune: null, lat: null, lng: null, locationSegreta: false, tipoIngresso: 'lista', descrizione: null, highlight: null, senzaTelefono: false,
  dressCode: null, lineup: [], infoArrivo: null, locandinaUrl: null, piantinaUrl: null, prezzoLista: 10, etaMinima: 18, pubblicato: true, prAbilitati: null,
  createdAt: '', updatedAt: '', ...p,
});
const lotto = (p: Partial<Lotto> = {}): Lotto => ({ id: 'l1', eventoId: 'e1', nome: 'Lista', prezzo: 10, quantita: null, dataInizio: null, dataFine: null, visibileDaPr: true, ordine: 0, categoria: null, confermaCategoria: false, uscitaGiorniPrima: null, fineOrePrima: null, dopoPrecedente: false, prAbilitati: null, ...p });
const PRIMA = new Date('2026-10-01T12:00:00Z');

test('token QR: firmato, non falsificabile, legato alla serata', () => {
  const id = randomUUID();
  const t = creaTokenQr('segreto', id, 'e1');
  assert.equal(leggiTokenQr(t)?.id, id);
  assert.ok(verificaTokenQr('segreto', t, 'e1'));
  assert.ok(!verificaTokenQr('segreto', t, 'e2'), 'altra serata');
  assert.ok(!verificaTokenQr('altro-segreto', t, 'e1'), 'segreto diverso');
  const manomesso = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
  assert.ok(!verificaTokenQr('segreto', manomesso, 'e1'), 'firma modificata');
  assert.notEqual(creaTokenQr('segreto', randomUUID(), 'e1').split('.')[1], t.split('.')[1], 'id casuali, mai progressivi');
  assert.match(creaCodice('segreto', id), /^[0-9A-HJKMNP-TV-Z]{8}$/);
});

test('età minima calcolata alla data della serata', () => {
  assert.ok(etaSufficiente('2008-10-31', evento()), 'compie 18 anni il giorno della serata');
  assert.ok(!etaSufficiente('2008-11-01', evento()), 'li compie il giorno dopo');
  assert.ok(etaSufficiente('2012-01-01', evento({ etaMinima: 0 })));
});

test('data di nascita: tre campi, date impossibili rifiutate', () => {
  assert.equal(componiData('14', '5', '2001'), '2001-05-14');
  assert.equal(componiData('31', '02', '2001'), null);
  assert.equal(componiData('1', '1', '01'), null);
  assert.equal(componiData('aa', '1', '2001'), null);
});

test('un solo QR per cognome + nascita + serata (accenti e maiuscole non contano)', () => {
  const i = { eventoId: 'e1', cognome: "D'Àngelo", dataNascita: '2000-01-01', stato: 'in_lista' } as Iscrizione;
  assert.equal(chiaveCognome("D'Àngelo "), chiaveCognome('dangelo'));
  assert.ok(giaIscritto([i], 'e1', 'dangelo', '2000-01-01'));
  assert.ok(!giaIscritto([i], 'e2', 'dangelo', '2000-01-01'), 'altra serata');
  assert.ok(!giaIscritto([{ ...i, stato: 'annullato' }], 'e1', 'dangelo', '2000-01-01'), 'annullato non conta');
});

test('lotti: primo aperto con posti, lotti futuri, lista piena, link PR', () => {
  const e = evento();
  assert.equal(statoLista(e, [], {}, { adesso: PRIMA }).tipo, 'aperta');
  assert.equal(statoLista(evento({ tipoIngresso: 'libero' }), [], {}, { adesso: PRIMA }).tipo, 'libero');
  const l1 = lotto({ id: 'a', quantita: 2, prezzo: 8 });
  const l2 = lotto({ id: 'b', ordine: 1, prezzo: 12 });
  const s = statoLista(e, [l1, l2], { a: 2 }, { adesso: PRIMA });
  assert.equal(s.tipo === 'aperta' && s.lotto?.id, 'b', 'primo lotto esaurito → secondo');
  assert.equal(statoLista(e, [l1], { a: 2 }, { adesso: PRIMA }).tipo, 'piena');
  assert.equal(statoLista(e, [lotto({ dataInizio: '2026-12-01T00:00:00+01:00' })], {}, { adesso: PRIMA }).tipo, 'dal');
  assert.equal(statoLista(e, [lotto({ visibileDaPr: false })], {}, { adesso: PRIMA, daPr: true }).tipo, 'chiusa');
  assert.equal(statoLista(e, [], {}, { adesso: new Date('2026-11-02T00:00:00Z') }).tipo, 'passata');
});

test('tipi di prevendita: uscita relativa alla serata, fine, esaurimento e successivo', () => {
  const e = evento(); // apertura 31.10 alle 22:00 (+01:00)
  const early = lotto({ id: 'early', nome: 'Early bird', categoria: 'Early bird', prezzo: 8, quantita: 2, uscitaGiorniPrima: 14, fineOrePrima: 24 * 7 });
  const donne = lotto({ id: 'donne', ordine: 1, nome: 'Donne', categoria: 'Donne', prezzo: 5, uscitaGiorniPrima: 7 });
  const std = lotto({ id: 'std', ordine: 2, nome: 'Standard', prezzo: 12, dopoPrecedente: true });
  const f = finestraLotto(early, e);
  assert.equal(f.inizio?.toISOString(), '2026-10-17T21:00:00.000Z', '14 giorni prima dell’apertura');
  assert.equal(f.fine?.toISOString(), '2026-10-24T21:00:00.000Z', 'chiude 7 giorni prima');
  const tipi = [early, donne, std];
  const a = (iso: string, usati: Record<string, number> = {}) => new Date(iso) && statoLista(e, tipi, usati, { adesso: new Date(iso) });
  const prima = a('2026-10-10T12:00:00Z');
  assert.equal(prima.tipo === 'dal' && prima.lotto?.id, 'early', 'prima di tutto: esce l’Early bird');
  const s1 = a('2026-10-20T12:00:00Z');
  assert.equal(s1.tipo === 'aperta' && s1.lotto?.id, 'early', '16 giorni prima: Early bird');
  assert.equal(s1.tipo === 'aperta' && s1.lotto?.id === 'early' ? s1.prezzo : 0, 8);
  const esaurito = a('2026-10-20T12:00:00Z', { early: 2 });
  assert.equal(esaurito.tipo, 'dal', 'Early finito, Donne non è ancora uscito');
  assert.equal(esaurito.tipo === 'dal' && esaurito.lotto?.id, 'donne');
  const s2 = a('2026-10-26T12:00:00Z');
  assert.equal(s2.tipo === 'aperta' && s2.lotto?.id, 'donne', 'Early chiuso (7 giorni prima), si apre Donne');
  const v = tipiVista(e, tipi, {}, { adesso: new Date('2026-10-26T12:00:00Z') });
  assert.deepEqual(v.map((t) => t.stato), ['chiuso', 'in_vendita', 'dopo_precedente']);
  const dopo = tipiVista(e, tipi, { donne: 0 }, { adesso: new Date('2026-10-26T12:00:00Z') });
  assert.equal(dopo[2].stato, 'dopo_precedente', 'Standard attende che Donne (senza limite) sia esaurito: non lo è mai');
  const soloDonne = [donne, lotto({ ...std, id: 'std2', quantita: null, ordine: 2 })];
  const limitato = [lotto({ ...donne, quantita: 3 }), soloDonne[1]];
  const s3 = statoLista(e, limitato, { donne: 3 }, { adesso: new Date('2026-10-26T12:00:00Z') });
  assert.equal(s3.tipo === 'aperta' && s3.lotto?.id, 'std2', 'finiti i posti di Donne esce Standard');
});

test('tipi di prevendita: categoria venduta dai PR scelti', () => {
  const e = evento();
  const donne = lotto({ id: 'donne', categoria: 'Donne', prAbilitati: ['pr1'] });
  assert.equal(statoLista(e, [donne], {}, { adesso: PRIMA, daPr: true, prId: 'pr1' }).tipo, 'aperta');
  assert.equal(statoLista(e, [donne], {}, { adesso: PRIMA, daPr: true, prId: 'pr2' }).tipo, 'chiusa', 'altro PR: non si vende');
  assert.equal(statoLista(e, [donne], {}, { adesso: PRIMA }).tipo, 'aperta', 'dal sito vale per tutti');
});

test('porta: con categoria l’ingresso si registra solo dopo "Fai entrare"; senza categoria (o Standard) subito', () => {
  const v: VocePorta = { id: 'x', token: 'MM1.a.b.c', codice: 'ABCD1234', nome: 'Giulia', cognome: 'Bianchi', dataNascita: '2001-05-14', stato: 'pagato', importo: 7, oraCheckIn: null, porta: null, lista: 'Maremma Musica', canale: 'diretto', origine: 'lista', categoria: 'Donne' };
  const o = { porta: 'P1', ora: '2026-10-31T23:41:00Z' };
  const r = decidiIngresso(v, o);
  assert.equal(r.esito.esito, 'da_confermare', 'categoria: prima la scelta dello staff');
  assert.equal(r.aggiornata, null, 'niente ingresso registrato');
  const ok = decidiIngresso({ ...v, rifiuto: { ora: '2026-10-31T23:40:00Z', porta: 'P2', da: 'porta@x.it' } }, { ...o, confermato: true });
  assert.equal(ok.esito.esito, 'entrato', 'dopo un "Non rientra" si può comunque far entrare');
  assert.equal(ok.aggiornata?.stato, 'entrato');
  assert.equal(decidiIngresso({ ...v, categoria: 'Standard' }, o).esito.esito, 'entrato', 'Standard: come oggi');
  assert.equal(decidiIngresso({ ...v, categoria: null }, o).esito.esito, 'entrato');
  assert.equal(decidiIngresso({ ...v, stato: 'in_attesa' }, o).esito.esito, 'non_pagato', 'non pagata: prima di tutto non entra');
  assert.equal(decidiIngresso({ ...v, categoria: null }, { ...o, documento: true }).esito.esito, 'da_confermare', 'serata senza telefono: documento anche senza categoria');
  assert.equal(decidiIngresso({ ...v, categoria: null }, { ...o, documento: true, confermato: true }).esito.esito, 'entrato');
  assert.equal(categoriaDaControllare({ categoria: ' standard ' }), false);
  assert.equal(categoriaDaControllare({ categoria: 'Donne' }), true);
});

test('porta: chi è in lista ha già pagato online, non si incassa; non pagato non entra', () => {
  const v: VocePorta = { id: 'x', token: 'MM1.a.b.c', codice: 'ABCD1234', nome: 'Giulia', cognome: 'Bianchi', dataNascita: '2001-05-14', stato: 'pagato', importo: 10, oraCheckIn: null, porta: null, lista: 'Zarro Pollicino', canale: 'instagram', origine: 'lista' };
  const o = { porta: 'P1', ora: '2026-10-31T23:41:00Z' };
  const { esito, aggiornata } = decidiIngresso(v, o);
  assert.equal(esito.esito, 'entrato', 'pagato online: entra');
  assert.equal(esito.esito === 'entrato' && esito.incassato, 0, 'alla porta non si incassa niente');
  assert.equal(decidiIngresso(aggiornata!, o).esito.esito, 'gia_entrato');
  assert.equal(decidiIngresso({ ...v, stato: 'in_lista', importo: 0 }, o).esito.esito, 'entrato', 'serata gratis');
  assert.equal(decidiIngresso({ ...v, stato: 'in_attesa' }, o).esito.esito, 'non_pagato', 'prevendita chiesta e non pagata');
  assert.equal(decidiIngresso({ ...v, stato: 'scaduta' }, o).esito.esito, 'non_valido');
  assert.equal(decidiIngresso({ ...v, stato: 'annullato' }, o).esito.esito, 'annullato');
  assert.equal(trovaVoce([v], 'abcd-1234')?.id, 'x', 'codice dettato a voce, con trattino e minuscole');
  assert.equal(trovaVoce([v], 'MM1.a.b.c')?.id, 'x');
  assert.equal(cercaPerNome([v], 'bian 2001').length, 1, 'ricerca per cognome e anno di nascita');
});

test('formato italiano', () => {
  assert.equal(dataPunti('2026-10-31T22:00:00+01:00'), '31.10');
  assert.equal(orari('2026-10-31T22:00:00+01:00', '2026-11-01T04:00:00+01:00'), '22:00 → 04:00');
  assert.equal(euro(10), '10 €');
  assert.equal(euro(2130), '2.130 €');
});

test('canale di arrivo: link etichettato, pagina di provenienza, browser dei social', () => {
  assert.equal(normalizzaCanale('IG'), 'instagram');
  assert.equal(normalizzaCanale('fb'), 'facebook');
  assert.equal(normalizzaCanale('QR'), 'locandina');
  assert.equal(normalizzaCanale('Radio Maremma!'), 'radiomaremma', 'valori nuovi ripuliti ma tenuti');
  assert.equal(normalizzaCanale(''), null);
  assert.equal(canaleDaReferer('https://l.instagram.com/?u=https%3A%2F%2Fmaremmamusica.it', 'maremmamusica.it'), 'instagram');
  assert.equal(canaleDaReferer('https://m.facebook.com/', 'maremmamusica.it'), 'facebook');
  assert.equal(canaleDaReferer('https://www.google.it/', 'maremmamusica.it'), 'google');
  assert.equal(canaleDaReferer('http://localhost:3000/eventi', 'localhost:3000'), null, 'navigazione interna non conta');
  assert.equal(canaleDaUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 339.0.0.13.107'), 'instagram');
  assert.equal(canaleDaUserAgent('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/470.0]'), 'facebook');
  assert.equal(canaleDaUserAgent('Mozilla/5.0 (iPhone) Safari/604.1'), null);
});

test('tavoli: termine per pagare entro l’apertura, richieste chiuse a serata iniziata', () => {
  const e = evento();                                   // apre il 31.10 alle 22:00 (Roma)
  const apertura = new Date(e.data).getTime();
  // Lontano dalla serata: dal sito il tempo di pagare (30 minuti), con il link del PR o della crew 24 ore
  const presto = new Date('2026-10-20T12:00:00+02:00');
  assert.equal(new Date(scadenzaPagamentoOnline(presto, e)).getTime(), presto.getTime() + MINUTI_PAGAMENTO_ONLINE * 60_000);
  assert.equal(new Date(scadenzaPagamentoOnline(presto, e, true)).getTime(), presto.getTime() + ORE_PAGAMENTO_ONLINE_PR * 3_600_000);
  // La sera prima: il link del PR scadrebbe dopo l'apertura, quindi si ferma all'apertura
  const vicino = new Date('2026-10-30T23:00:00+01:00');
  assert.equal(new Date(scadenzaPagamentoOnline(vicino, e, true)).getTime(), apertura);
  assert.equal(richiesteTavoliAperte(e, vicino), true);
  // Dall'apertura in poi non si chiede più: il termine sarebbe già passato
  assert.equal(richiesteTavoliAperte(e, new Date(apertura)), false);
  assert.equal(richiesteTavoliAperte(e, new Date(apertura + 3_600_000)), false);
});

test('prevendita: il posto resta fermo solo nel termine per pagare', () => {
  const adesso = new Date('2026-10-20T12:00:00+02:00');
  const scade = scadenzaPagamentoOnline(adesso, evento());
  assert.equal(new Date(scade).getTime(), adesso.getTime() + MINUTI_PAGAMENTO_ONLINE * 60_000);
  const attesa = { stato: 'in_attesa' as const, scade };
  assert.equal(tienePosto(attesa, adesso), true, 'in attesa nel termine: tiene il posto del lotto');
  assert.equal(iscrizioneScaduta(attesa, adesso), false);
  const dopo = new Date(new Date(scade).getTime() + 1);
  assert.equal(tienePosto(attesa, dopo), false, 'termine passato: il posto torna libero');
  assert.equal(iscrizioneScaduta(attesa, dopo), true);
  assert.equal(tienePosto({ stato: 'pagato', scade: null }, dopo), true);
  assert.equal(tienePosto({ stato: 'scaduta', scade }, adesso), false);
  // Il controllo doppioni guarda solo i QR validi: chi ha chiesto senza pagare non blocca la cassa né un nuovo tentativo.
  const i = { id: 'a', eventoId: 'e1', cognome: 'Bianchi', dataNascita: '2001-05-14', stato: 'in_attesa' } as Iscrizione;
  assert.equal(giaIscritto([i], 'e1', 'Bianchi', '2001-05-14'), undefined);
});

test('prevendita: pagamento in ritardo vale solo se c’è ancora posto, altrimenti si rimborsa', () => {
  const e = evento();
  const prima = new Date('2026-10-20T12:00:00+02:00');
  const base = { iscrizione: { stato: 'in_attesa' as const }, evento: e, lotto: lotto({ quantita: 100 }), altriNelLotto: 10, doppione: false, adesso: prima };
  assert.equal(pagamentoIscrizioneValido(base), true);
  assert.equal(pagamentoIscrizioneValido({ ...base, iscrizione: { stato: 'scaduta' } }), true, 'scaduta da poco ma con posto: vale');
  assert.equal(pagamentoIscrizioneValido({ ...base, iscrizione: { stato: 'scaduta' }, altriNelLotto: 100 }), false, 'posti finiti nel frattempo');
  assert.equal(pagamentoIscrizioneValido({ ...base, lotto: lotto({ quantita: null }), altriNelLotto: 9999 }), true, 'lotto senza limite');
  assert.equal(pagamentoIscrizioneValido({ ...base, adesso: new Date(e.data) }), true, 'serata iniziata ma prima dell’orario limite: vale');
  assert.equal(pagamentoIscrizioneValido({ ...base, adesso: new Date('2026-11-01T00:00:00Z') }), false, 'dopo l’orario limite');
  assert.equal(pagamentoIscrizioneValido({ ...base, evento: evento({ tipoIngresso: 'libero' }), adesso: new Date(e.data) }), false, 'senza limite vale fino all’apertura');
  assert.equal(pagamentoIscrizioneValido({ ...base, doppione: true }), false, 'ha già un altro QR valido');
  assert.equal(pagamentoIscrizioneValido({ ...base, iscrizione: { stato: 'annullato' } }), false, 'ha lasciato il posto');
  assert.equal(pagamentoIscrizioneValido({ ...base, iscrizione: { stato: 'pagato' } }), false, 'pagata due volte');
});

test('copertina: la scelta dell’admin vale se pubblicata e non passata, altrimenti la prossima data', () => {
  const adesso = new Date('2026-10-20T12:00:00+02:00');
  const ev = (id: string, data: string, p: Partial<Evento> = {}) => evento({ id, data, dataFine: null, pubblicato: true, ...p });
  const a = ev('a', '2026-10-24T22:00:00+02:00');
  const b = ev('b', '2026-10-31T22:00:00+01:00');
  const c = ev('c', '2026-11-07T22:00:00+01:00');
  assert.equal(sceltaCopertina([c, b, a], adesso)?.id, 'a', 'nessuna scelta: la prossima');
  assert.equal(sceltaCopertina([], adesso), null, 'niente in calendario');
  assert.equal(sceltaCopertina([a, b, { ...c, inCopertina: true }], adesso)?.id, 'c', 'scelta valida');
  assert.equal(sceltaCopertina([ev('p', '2026-10-10T22:00:00+02:00', { inCopertina: true }), a, b], adesso)?.id, 'a', 'scelta passata: si torna alla prossima');
  assert.equal(sceltaCopertina([{ ...b, inCopertina: true, pubblicato: false }, a], adesso)?.id, 'a', 'scelta in bozza: si torna alla prossima');
  assert.equal(sceltaCopertina([{ ...c, inCopertina: true }, { ...b, inCopertina: true }, a], adesso)?.id, 'b', 'due scelte per errore: vince la più vicina');
});

test('accesso: "dopo" accetta solo percorsi interni (niente reindirizzamenti verso altri siti)', () => {
  for (const ok of ['/', '/admin', '/door', '/gestione/pr?serata=1', '/e/halloween-party/prevendita']) assert.equal(percorsoInterno(ok), true, ok);
  for (const no of ['//evil.com', '/\\evil.com', '/\\\\evil.com', 'https://evil.com', 'evil.com', '/\t/evil.com', '/\n/evil.com', '/ /evil.com', '', null, undefined]) assert.equal(percorsoInterno(no as string), false, String(no));
});

test('prezzo dai tipi: "da 8 €" per le intestazioni', () => {
  assert.equal(prezzoDaTipi([]), null);
  const tipi = [lotto({ id: 'b', ordine: 1, prezzo: 11 }), lotto({ id: 'a', ordine: 0, prezzo: 8 }), lotto({ id: 'c', ordine: 2, prezzo: 11 })];
  assert.deepEqual(prezzoDaTipi(tipi), { primo: 8, minimo: 8, massimo: 11 });
  assert.equal(testoPrezzoTipi(prezzoDaTipi(tipi)), 'da 8 €');
  assert.equal(prezzoDaTipi([lotto({ ordine: 1, prezzo: 12 }), lotto({ ordine: 0, prezzo: 15 })])!.primo, 15, 'il primo è per ordine, non il più basso');
  assert.equal(testoPrezzoTipi(prezzoDaTipi([lotto({ prezzo: 10 })])), '10 €', 'un solo prezzo: niente "da"');
  assert.equal(testoPrezzoTipi(null, 12), '12 €', 'serata vecchia senza tipi: vale il prezzo salvato');
});

test('prezzo "da X €": contano solo i tipi ancora vendibili', () => {
  const e = evento({ data: '2026-10-31T22:00:00+01:00' });
  const adesso = new Date('2026-10-20T12:00:00Z');
  const tipi = [
    lotto({ id: 'a', ordine: 0, prezzo: 8, quantita: 50, dataFine: '2026-10-15T00:00:00Z' }),   // chiuso
    lotto({ id: 'b', ordine: 1, prezzo: 10, quantita: 20 }),                                    // aperto, ma esaurito
    lotto({ id: 'c', ordine: 2, prezzo: 12 }),                                                  // aperto
    lotto({ id: 'd', ordine: 3, prezzo: 15, dataInizio: '2026-10-25T00:00:00Z' }),             // in arrivo
  ];
  const t = (usati: Record<string, number> = { b: 20 }, quando = adesso) => prezzoVendibile(e, tipi, usati, quando);
  assert.deepEqual(t(), { primo: 8, minimo: 12, massimo: 15 }, 'chiuso ed esaurito non contano; il primo resta quello per ordine');
  assert.equal(testoPrezzoTipi(t()), 'da 12 €');
  assert.equal(testoPrezzoTipi(prezzoDaTipi(tipi)), 'da 8 €', 'senza il filtro avremmo promesso 8 €');
  assert.equal(testoPrezzoTipi(prezzoVendibile(e, tipi.slice(2, 3), {}, adesso)), '12 €', 'un solo tipo vendibile: niente "da"');
  assert.equal(testoPrezzoTipi(t({ b: 20, c: 10 }, new Date('2026-10-26T12:00:00Z'))), 'da 12 €', 'il tipo in arrivo ora è aperto');
  assert.equal(prezzoVendibile(e, [lotto({ id: 'x', ordine: 0, prezzo: 9, quantita: 5 }), lotto({ id: 'y', ordine: 1, prezzo: 13, quantita: 5 })], { x: 5, y: 5 }, adesso)?.minimo, 13,
    'tutto esaurito: vale l’ultimo prezzo, non il primo');
  assert.equal(testoPrezzoTipi(prezzoVendibile(e, tipi, {}, new Date('2026-11-02T12:00:00Z'))), '15 €', 'serata passata: vale l’ultimo prezzo');
  assert.equal(prezzoVendibile(e, [], {}, adesso), null);
  assert.equal(prezzoVendibile(e, [lotto({ eventoId: 'altra' })], {}, adesso), null, 'i tipi di un’altra serata non contano');
});

test('date a Roma: stessa ora locale anche a cavallo del cambio d’ora', () => {
  assert.equal(isoRoma('2026-10-24', '22:00'), '2026-10-24T20:00:00.000Z');
  assert.equal(isoRoma('2026-11-07', '22:00'), '2026-11-07T21:00:00.000Z', 'ora solare');
  assert.equal(isoRoma('2026-10-25', '01:30'), '2026-10-24T23:30:00.000Z', 'la notte del cambio, prima delle 03:00, è ancora ora legale');
  assert.equal(isoRoma('2026-10-25', '04:00'), '2026-10-25T03:00:00.000Z');
  assert.equal(isoRoma('2027-03-28', '00:30'), '2027-03-27T23:30:00.000Z');
  assert.equal(isoRoma('2027-03-28', '04:00'), '2027-03-28T02:00:00.000Z');
  assert.equal(spostaGiorni('2026-10-24T20:00:00Z', 14), '2026-11-07T21:00:00.000Z', '22:00 resta 22:00');
  assert.equal(spostaGiorni('2027-03-27T21:00:00Z', 14), '2027-04-10T20:00:00.000Z', '22:00 resta 22:00 anche in primavera');
  assert.equal(giorniTra('2026-10-24T20:00:00Z', '2026-11-07T21:00:00Z'), 14);
});

test('bozza: il primo salvataggio di una serata nuova non pubblica mai', () => {
  assert.equal(pubblicatoDopoSalvataggio({ nuova: true, azione: 'pubblica', eraPubblicata: false }), false);
  assert.equal(pubblicatoDopoSalvataggio({ nuova: true, azione: '', eraPubblicata: true }), false);
  assert.equal(pubblicatoDopoSalvataggio({ nuova: false, azione: 'pubblica', eraPubblicata: false }), true);
  assert.equal(pubblicatoDopoSalvataggio({ nuova: false, azione: 'bozza', eraPubblicata: true }), false);
  assert.equal(pubblicatoDopoSalvataggio({ nuova: false, azione: '', eraPubblicata: true }), true, 'Salva su una serata online la lascia online');
  assert.equal(pubblicatoDopoSalvataggio({ nuova: false, azione: '', eraPubblicata: false }), false);
});

test('cosa manca prima di pubblicare: tipi propri, locandina, tavoli', () => {
  const base = { tipoIngresso: 'lista' as const, locandinaUrl: null };
  const ids = (m: ReturnType<typeof cosaManca>) => m.map((x) => x.id);
  assert.deepEqual(ids(cosaManca(base, [], 0)), ['tipi', 'locandina', 'tavoli']);
  const auto = [{ nome: 'Lista', prezzo: 10, automatico: true }];
  assert.deepEqual(ids(cosaManca(base, auto, 0)), ['tipi', 'locandina', 'tavoli'], 'solo il tipo creato in automatico non basta');
  const propri = [{ nome: 'Early bird', prezzo: 8 }, { nome: 'Standard', prezzo: 10 }];
  assert.deepEqual(ids(cosaManca({ ...base, locandinaUrl: '/media/a.jpg' }, propri, 4)), [], 'tutto a posto: niente da dire');
  assert.deepEqual(ids(cosaManca({ ...base, tipoIngresso: 'libero', locandinaUrl: '/media/a.jpg' }, [], 1)), [], 'ingresso libero: nessun tipo da chiedere');
});

test('tavoli in serie: T1…T10, zeri conservati, senza numero parte da 1', () => {
  assert.deepEqual(nomiInSerie('T1', 3), ['T1', 'T2', 'T3']);
  assert.deepEqual(nomiInSerie('T8', 4), ['T8', 'T9', 'T10', 'T11']);
  assert.deepEqual(nomiInSerie('T08', 3), ['T08', 'T09', 'T10']);
  assert.deepEqual(nomiInSerie('Privé', 2), ['Privé 1', 'Privé 2']);
  assert.deepEqual(nomiInSerie('Pista 5', 2), ['Pista 5', 'Pista 6']);
  assert.deepEqual(nomiInSerie('T1', 0), []);
});

test('coordinate da un link di Google Maps', () => {
  assert.deepEqual(coordinateDaLinkMaps('https://www.google.com/maps/place/Pineta/@42.9371,10.8922,17z/data=!3m1'), { lat: 42.9371, lng: 10.8922 });
  assert.deepEqual(coordinateDaLinkMaps('https://www.google.com/maps/place/X/data=!4m6!3d42.9012!4d11.1034'), { lat: 42.9012, lng: 11.1034 });
  assert.deepEqual(coordinateDaLinkMaps('https://www.google.com/maps?q=42.5,11.25'), { lat: 42.5, lng: 11.25 });
  assert.deepEqual(coordinateDaLinkMaps('https://maps.google.com/?ll=-33.86,151.21&z=10'), { lat: -33.86, lng: 151.21 });
  assert.equal(coordinateDaLinkMaps('https://maps.app.goo.gl/AbCdEf'), null, 'link corto: non si può leggere');
  assert.equal(coordinateDaLinkMaps('https://www.google.com/maps/@142.9,10.9,17z'), null, 'latitudine impossibile');
  assert.equal(coordinateDaLinkMaps(''), null);
});

test('orario limite della prevendita: di default la prima 01:00 dopo l’apertura, a ora di Roma', () => {
  const sera = evento({ data: isoRoma('2026-10-31', '22:00') });
  assert.equal(limitePrevendita(sera), isoRoma('2026-11-01', '01:00'), 'apre la sera: l’1 della notte dopo');
  assert.equal(limitePrevendita(evento({ data: isoRoma('2026-11-01', '00:30') })), isoRoma('2026-11-01', '01:00'), 'apre dopo mezzanotte: l’1 dello stesso giorno');
  assert.equal(limitePrevendita(evento({ data: isoRoma('2026-11-01', '01:00') })), isoRoma('2026-11-02', '01:00'), 'a mezz’ora esatta si passa alla successiva');
  assert.equal(limitePrevendita(evento({ data: isoRoma('2026-10-24', '22:00') })), '2026-10-24T23:00:00.000Z', 'l’1 resta l’1 anche nella notte del cambio d’ora');
  assert.equal(limitePrevendita({ ...sera, prevenditaFinoAlle: '2026-11-01T01:30:00.000Z' }), '2026-11-01T01:30:00.000Z', 'quello scelto per la serata vale più del default');
  assert.equal(istanteDopoApertura(isoRoma('2026-10-31', '22:00'), '23:30'), isoRoma('2026-10-31', '23:30'), 'prima di mezzanotte resta la stessa sera');
  assert.equal(limiteIngresso(evento({ tipoIngresso: 'libero' })), null, 'ingresso libero: nessun limite');
  assert.equal(limiteIngresso(sera), limitePrevendita(sera));
  assert.equal(testoLimite(sera), 'Valida per entrare entro le 01:00.');
  assert.equal(testoLimite(evento({ tipoIngresso: 'libero' })), null);
});

test('porta: dopo l’orario limite la prevendita non entra (pagata, gratis o no), il tavolo sì', () => {
  const v: VocePorta = { id: 'x', token: 'MM1.a.b.c', codice: 'ABCD1234', nome: 'Giulia', cognome: 'Bianchi', dataNascita: '2001-05-14', stato: 'pagato', importo: 10, oraCheckIn: null, porta: null, lista: 'Maremma Musica', canale: 'diretto', origine: 'lista' };
  const limite = '2026-11-01T00:00:00.000Z'; // l’1 a Roma
  const prima = { porta: 'P1', ora: '2026-10-31T23:59:59Z', limite };
  const dopo = { porta: 'P1', ora: '2026-11-01T00:00:00Z', limite };
  assert.equal(decidiIngresso(v, prima).esito.esito, 'entrato', 'un secondo prima del limite entra');
  const tardi = decidiIngresso(v, dopo);
  assert.equal(tardi.esito.esito, 'oltre_orario', 'al limite non entra più');
  assert.equal(tardi.esito.esito === 'oltre_orario' && tardi.esito.limite, limite);
  assert.equal(tardi.aggiornata, null, 'nessun ingresso registrato');
  assert.equal(decidiIngresso({ ...v, stato: 'in_lista', importo: 0 }, dopo).esito.esito, 'oltre_orario', 'anche la prevendita gratis');
  assert.equal(decidiIngresso({ ...v, stato: 'in_attesa' }, dopo).esito.esito, 'oltre_orario', 'e quella mai pagata');
  assert.equal(decidiIngresso({ ...v, categoria: 'Donne' }, { ...dopo, confermato: true }).esito.esito, 'oltre_orario', 'nemmeno dopo "Fai entrare"');
  assert.equal(decidiIngresso({ ...v, stato: 'entrato', oraCheckIn: '2026-10-31T23:00:00Z' }, dopo).esito.esito, 'gia_entrato', 'chi è già dentro resta "già entrato"');
  assert.equal(decidiIngresso({ ...v, stato: 'annullato' }, dopo).esito.esito, 'annullato');
  const tavolo: VocePorta = { ...v, origine: 'tavolo', tavolo: { nome: 'T1', persone: 4, entrati: 1, pagato: true } };
  assert.equal(decidiIngresso(tavolo, dopo).esito.esito, 'entrato', 'i tavoli non hanno limite');
  assert.equal(decidiIngresso(v, { ...dopo, limite: null }).esito.esito, 'entrato', 'senza limite (ingresso libero) entra sempre');
  assert.equal(oltreLimite(undefined, dopo.ora), false);
  assert.equal(oltreLimite(limite, '2026-11-01T01:00:00+01:00'), true, 'si confrontano gli istanti, non le ore scritte');
  assert.equal(oltreLimite(limite, '2026-11-01T00:59:00+01:00'), false);
});

test('conteggio della porta: entrati con scan di prevendite e tavoli, attesi, posti liberi dopo il limite', () => {
  const v = (o: Partial<VocePorta>): VocePorta => ({ id: 'x', token: '', codice: '', nome: 'A', cognome: 'B', dataNascita: '2000-01-01', stato: 'pagato', importo: 10, oraCheckIn: null, porta: null, lista: 'L', canale: 'diretto', origine: 'lista', ...o });
  const tavolo = (entrati: number, persone: number, pagato = true) => v({ origine: 'tavolo', stato: pagato ? 'pagato' : 'in_lista', tavolo: { nome: 'T', persone, entrati, pagato } });
  const elenco = [
    v({ id: '1', stato: 'entrato' }), v({ id: '2', stato: 'entrato' }),   // 2 entrati con prevendita
    v({ id: '3' }), v({ id: '4', stato: 'in_lista', importo: 0 }),         // 2 attesi
    v({ id: '5', stato: 'in_attesa' }), v({ id: '6', stato: 'annullato' }), // non contano
    tavolo(3, 6), tavolo(0, 4), tavolo(0, 8, false),                       // 3 entrati, 3 + 4 attesi; il tavolo non pagato non conta
    v({ id: 'c', origine: 'cassa', stato: 'entrato' }),                    // storico: è dentro
  ];
  const limite = '2026-11-01T00:00:00.000Z';
  const prima = conteggioPorta(elenco, { capienza: 300, limite, ora: '2026-10-31T23:00:00Z' });
  assert.deepEqual(prima, { entrati: 6, attesi: 2 + 3 + 4, liberi: 294, dopoLimite: false });
  const dopo = conteggioPorta(elenco, { capienza: 300, limite, ora: '2026-11-01T00:30:00Z' });
  assert.deepEqual(dopo, { entrati: 6, attesi: 3 + 4, liberi: 294, dopoLimite: true }, 'dopo il limite le prevendite non contano più come attese, i tavoli sì');
  assert.equal(conteggioPorta(elenco, { limite, ora: '2026-11-01T00:30:00Z' }).liberi, null, 'senza capienza non ci sono posti liberi');
  assert.equal(conteggioPorta(elenco, { capienza: null, ora: '2026-11-01T00:30:00Z' }).liberi, null);
  assert.equal(conteggioPorta(elenco, { capienza: 4, limite, ora: '2026-11-01T00:30:00Z' }).liberi, 0, 'mai sotto zero');
  assert.deepEqual(conteggioPorta([], { capienza: 100, ora: '2026-10-31T23:00:00Z' }), { entrati: 0, attesi: 0, liberi: 100, dopoLimite: false });
});

test('orario limite: dall’01:00 la vendita online è chiusa, il posto si tiene al massimo fino al limite, un pagamento in ritardo non vale', () => {
  const lotti = [lotto()];
  const limite = '2026-11-01T00:00:00.000Z'; // l'1 a Roma
  const prima = new Date('2026-10-31T23:59:00Z');
  const dopo = new Date('2026-11-01T00:00:00Z');
  assert.equal(statoLista(evento(), lotti, {}, { adesso: prima }).tipo, 'aperta', 'prima del limite si vende');
  assert.deepEqual(statoLista(evento(), lotti, {}, { adesso: dopo }), { tipo: 'chiusa', alle: limite }, 'dal limite è chiusa');
  assert.equal(chipLista(statoLista(evento(), lotti, {}, { adesso: dopo })).testo, 'Prevendite chiuse alle 01:00');
  assert.equal(statoLista(evento({ tipoIngresso: 'libero' }), lotti, {}, { adesso: dopo }).tipo, 'libero', 'ingresso libero: nessun limite');
  assert.equal(statoLista(evento(), [], {}, { adesso: dopo }).tipo, 'chiusa', 'anche senza tipi');
  assert.equal(prevenditeChiuseDa(evento(), prima), null);
  assert.equal(prevenditeChiuseDa(evento({ prevenditaFinoAlle: '2026-11-01T01:30:00.000Z' }), dopo), null, 'vale il limite scelto per la serata');

  // Il posto si tiene 30 minuti, ma mai oltre il limite.
  assert.equal(scadenzaPrevendita(new Date('2026-10-31T22:00:00Z'), evento()), '2026-10-31T22:30:00.000Z', 'a serata iniziata (apre alle 21:00Z) il posto si tiene ancora 30 minuti');
  assert.equal(scadenzaPrevendita(new Date('2026-10-31T23:50:00Z'), evento()), limite, 'a ridosso del limite scade al limite');
  assert.equal(scadenzaPrevendita(new Date('2026-10-31T19:00:00Z'), evento({ tipoIngresso: 'libero' })), '2026-10-31T19:30:00.000Z', 'senza limite resta il termine di sempre');
  assert.equal(scadenzaPagamentoOnline(new Date('2026-10-31T22:00:00Z'), evento()), '2026-10-31T21:00:00.000Z', 'i tavoli non cambiano: mai oltre l’apertura');

  // Pagamento arrivato dopo il limite (pagina di pagamento aperta prima): non vale, si restituisce.
  const ok = { iscrizione: { stato: 'in_attesa' as const }, evento: evento(), lotto: null, altriNelLotto: 0, doppione: false };
  assert.equal(pagamentoIscrizioneValido({ ...ok, adesso: prima }), true);
  assert.equal(pagamentoIscrizioneValido({ ...ok, adesso: dopo }), false);
  assert.equal(pagamentoIscrizioneValido({ ...ok, iscrizione: { stato: 'scaduta' as const }, adesso: dopo }), false, 'anche se era già scaduta');
});
