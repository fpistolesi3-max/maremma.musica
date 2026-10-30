// Regole pure delle foto delle serate (nessun accesso a dati o file). Si lancia con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditoPulito, fotoInEvidenza, fotoPerHome, fotoVisibili, MAX_CREDITO, spostaFoto, testoAltFoto, type Foto } from './foto';

const foto = (id: string, ordine: number, extra: Partial<Foto> = {}): Foto => ({
  id, eventoId: 'e1', ordine, inEvidenza: false, nascosta: false, larghezza: 2000, altezza: 1500, byte: 1, pronta: true, creataAt: `2026-09-20T00:00:0${ordine % 10}Z`, ...extra,
});

test('foto visibili: niente nascoste né in caricamento, nell’ordine scelto', () => {
  const v = fotoVisibili([foto('c', 2), foto('a', 0), foto('n', 1, { nascosta: true }), foto('x', 3, { pronta: false }), foto('b', 1)]);
  assert.deepEqual(v.map((f) => f.id), ['a', 'b', 'c']);
});

test('in evidenza: quelle scelte (max 4); se non ce ne sono, le prime 4 visibili', () => {
  const tutte = [0, 1, 2, 3, 4, 5].map((i) => foto(`f${i}`, i));
  assert.deepEqual(fotoInEvidenza(tutte).map((f) => f.id), ['f0', 'f1', 'f2', 'f3'], 'nessuna scelta: le prime 4');
  const scelte = tutte.map((f, i) => (i === 5 || i === 2 ? { ...f, inEvidenza: true } : f));
  assert.deepEqual(fotoInEvidenza(scelte).map((f) => f.id), ['f2', 'f5'], 'scelte: solo quelle, nell’ordine della serata');
  const nascosta = scelte.map((f) => (f.id === 'f2' ? { ...f, nascosta: true } : f));
  assert.deepEqual(fotoInEvidenza(nascosta).map((f) => f.id), ['f5'], 'una nascosta non esce neanche in evidenza');
  assert.deepEqual(fotoInEvidenza(tutte, 9).length, 4, 'mai più di 4');
});

test('sposta: scambia con la vicina; ai bordi non fa niente; con numeri uguali rinumera', () => {
  const t = [foto('a', 0), foto('b', 1), foto('c', 5)];
  assert.deepEqual(spostaFoto(t, 'b', 'dopo'), [{ id: 'b', ordine: 5 }, { id: 'c', ordine: 1 }]);
  assert.equal(spostaFoto(t, 'a', 'prima'), null);
  assert.equal(spostaFoto(t, 'c', 'dopo'), null);
  const uguali = [foto('a', 0), foto('b', 0), foto('c', 0)];
  const ris = spostaFoto(uguali, 'c', 'prima')!;
  const nuovo = new Map(uguali.map((f) => [f.id, f.ordine]));
  for (const u of ris) nuovo.set(u.id, u.ordine);
  const ordine = [...nuovo.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
  assert.deepEqual(ordine, ['a', 'c', 'b']);
});

test('home: una foto per serata a turno, poi si riempie; senza foto niente', () => {
  const s = (nome: string, n: number) => ({ evento: nome, evidenza: Array.from({ length: n }, (_, i) => `${nome}${i}`) });
  assert.deepEqual(fotoPerHome([s('A', 4), s('B', 2), s('C', 1)]).map((x) => x.foto), ['A0', 'B0', 'C0', 'A1']);
  assert.deepEqual(fotoPerHome([s('A', 4)]).map((x) => x.foto), ['A0', 'A1', 'A2', 'A3']);
  assert.deepEqual(fotoPerHome([]), []);
});

test('testo alternativo e credito', () => {
  assert.equal(testoAltFoto('Solchi', '07.11'), 'Foto della serata Solchi del 07.11');
  assert.equal(creditoPulito('  Mario   Rossi  '), 'Mario Rossi');
  assert.equal(creditoPulito('x'.repeat(200)).length, MAX_CREDITO);
});
