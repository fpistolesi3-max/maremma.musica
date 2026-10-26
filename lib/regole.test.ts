import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { componiData, etaSufficiente, giaIscritto, statoLista, chiaveCognome, richiesteTavoliAperte, scadenzaPagamento, GIORNI_PAGAMENTO_TAVOLO } from './regole';
import { creaCodice, creaTokenQr, leggiTokenQr, verificaTokenQr } from './qr-token';
import { cercaPerNome, decidiIngresso, trovaVoce, type VocePorta } from './porta-logica';
import { dataPunti, orari, euro } from './formato';
import type { Evento, Iscrizione, Lotto } from './dati/tipi';
import { canaleDaReferer, canaleDaUserAgent, normalizzaCanale } from './canali';

const evento = (p: Partial<Evento> = {}): Evento => ({
  id: 'e1', numero: 25, slug: 'halloween-party', nome: 'Halloween Party', data: '2026-10-31T22:00:00+01:00', dataFine: '2026-11-01T04:00:00+01:00',
  location: null, comune: null, lat: null, lng: null, locationSegreta: false, tipoIngresso: 'lista', descrizione: null, highlight: null, prezzoCassa: null,
  dressCode: null, lineup: [], infoArrivo: null, locandinaUrl: null, piantinaUrl: null, prezzoLista: 10, etaMinima: 18, pubblicato: true, prAbilitati: null,
  createdAt: '', updatedAt: '', ...p,
});
const lotto = (p: Partial<Lotto> = {}): Lotto => ({ id: 'l1', eventoId: 'e1', nome: 'Lista', prezzo: 10, quantita: null, dataInizio: null, dataFine: null, visibileDaPr: true, ordine: 0, ...p });
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

test('porta: incassa, entra, secondo passaggio già entrato, annullato non valido', () => {
  const v: VocePorta = { id: 'x', token: 'MM1.a.b.c', codice: 'ABCD1234', nome: 'Giulia', cognome: 'Bianchi', dataNascita: '2001-05-14', stato: 'in_lista', importo: 10, oraCheckIn: null, porta: null, lista: 'Zarro Pollicino', canale: 'instagram', origine: 'lista' };
  const o = { incassa: false, metodo: 'porta_contanti' as const, porta: 'P1', ora: '2026-10-31T23:41:00Z' };
  assert.equal(decidiIngresso(v, o).esito.esito, 'da_incassare');
  const { esito, aggiornata } = decidiIngresso(v, { ...o, incassa: true });
  assert.equal(esito.esito, 'entrato');
  assert.equal(esito.esito === 'entrato' && esito.incassato, 10);
  assert.equal(decidiIngresso(aggiornata!, o).esito.esito, 'gia_entrato');
  assert.equal(decidiIngresso({ ...v, stato: 'pagato' }, o).esito.esito, 'entrato', 'pagato al PR: entra senza incassare');
  assert.equal(decidiIngresso({ ...v, importo: 0 }, o).esito.esito, 'entrato', 'ingresso libero');
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
  // Lontano dalla serata: il termine è a qualche giorno dalla richiesta
  const presto = new Date('2026-10-20T12:00:00+02:00');
  assert.equal(new Date(scadenzaPagamento(presto, e)).getTime(), presto.getTime() + GIORNI_PAGAMENTO_TAVOLO * 86_400_000);
  // Il giorno prima: il termine si ferma all'apertura
  const vicino = new Date('2026-10-30T18:00:00+01:00');
  assert.equal(new Date(scadenzaPagamento(vicino, e)).getTime(), apertura);
  assert.equal(richiesteTavoliAperte(e, vicino), true);
  // Dall'apertura in poi non si chiede più: il termine sarebbe già passato
  assert.equal(richiesteTavoliAperte(e, new Date(apertura)), false);
  assert.equal(richiesteTavoliAperte(e, new Date(apertura + 3_600_000)), false);
});
