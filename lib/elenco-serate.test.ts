import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividiSerate, entratiDaMostrare, quantoManca, serataIniziale, statoSerata } from './elenco-serate';

const SERATA = '2026-11-16T21:00:00.000Z'; // lunedì 16.11 alle 22:00 a Roma

test('quanto manca: oggi, domani, tra N giorni, in corso dopo la mezzanotte', () => {
  assert.equal(quantoManca('2026-11-16T08:00:00.000Z', SERATA), 'oggi');
  assert.equal(quantoManca('2026-11-15T20:00:00.000Z', SERATA), 'domani');
  assert.equal(quantoManca('2026-11-05T10:00:00.000Z', SERATA), 'tra 11 giorni');
  assert.equal(quantoManca('2026-11-16T23:30:00.000Z', SERATA), 'in corso', 'a mezzanotte e mezza di Roma la serata dura ancora');
});

test('entrati: "la sera" solo prima del giorno della serata', () => {
  assert.equal(entratiDaMostrare('2026-11-15T20:00:00.000Z', SERATA), false);
  assert.equal(entratiDaMostrare('2026-11-16T08:00:00.000Z', SERATA), true);
  assert.equal(entratiDaMostrare('2026-11-17T00:30:00.000Z', SERATA), true, 'la notte della serata il numero è quello vero');
});

test('stato: uno solo per riga, passata vince su bozza e in vendita', () => {
  assert.equal(statoSerata({ pubblicata: true, passata: false }).testo, 'In vendita');
  assert.equal(statoSerata({ pubblicata: false, passata: false }).testo, 'Bozza');
  assert.equal(statoSerata({ pubblicata: false, passata: true }).testo, 'Passata');
  assert.equal(statoSerata({ pubblicata: true, passata: true }).testo, 'Passata');
});

test('elenco: in arrivo dalla più vicina, passate dalla più recente', () => {
  const s = (id: string, data: string, passata: boolean) => ({ id, passata, evento: { data } });
  const { inArrivo, passate } = dividiSerate([
    s('a', '2027-01-16T21:00:00.000Z', false), s('b', '2026-11-23T22:00:00.000Z', false), s('c', '2026-11-16T21:00:00.000Z', false),
    s('d', '2026-10-05T20:00:00.000Z', true), s('e', '2026-09-12T20:00:00.000Z', true),
  ]);
  assert.deepEqual(inArrivo.map((x) => x.id), ['c', 'b', 'a']);
  assert.deepEqual(passate.map((x) => x.id), ['d', 'e']);
  assert.deepEqual(dividiSerate([s('x', '2026-09-12T20:00:00.000Z', true)]).inArrivo, []);
});

test('apertura: la prossima serata (a parità vince la pubblicata), altrimenti l’ultima passata', () => {
  const s = (id: string, data: string, passata: boolean, pubblicato = true) => ({ id, passata, evento: { data, pubblicato } });
  assert.equal(serataIniziale([s('a', '2027-01-16T21:00:00.000Z', false), s('b', '2026-11-23T22:00:00.000Z', false), s('p', '2026-10-05T20:00:00.000Z', true)])?.id, 'b');
  assert.equal(serataIniziale([s('bozza', '2026-11-23T22:00:00.000Z', false, false), s('pub', '2027-01-16T21:00:00.000Z', false)])?.id, 'pub', 'come "Prossima serata" della home: la pubblicata batte la bozza più vicina');
  assert.equal(serataIniziale([s('d', '2026-10-05T20:00:00.000Z', true), s('e', '2026-09-12T20:00:00.000Z', true)])?.id, 'd');
  assert.equal(serataIniziale([]), null);
});
