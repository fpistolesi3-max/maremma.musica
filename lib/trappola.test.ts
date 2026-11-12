// Campo trappola dei moduli pubblici. Si lancia con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPO_TRAPPOLA, daProgramma } from './trappola';

const modulo = (campi: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campi)) f.set(k, v); return f; };

test('campo trappola: vuoto o assente è una persona, compilato è un programma', () => {
  assert.equal(daProgramma(modulo({ nome: 'Anna', email: 'anna@esempio.it' })), false, 'senza il campo (pagina vecchia in cache)');
  assert.equal(daProgramma(modulo({ nome: 'Anna', [CAMPO_TRAPPOLA]: '' })), false);
  assert.equal(daProgramma(modulo({ nome: 'Anna', [CAMPO_TRAPPOLA]: '   ' })), false, 'solo spazi: come vuoto');
  assert.equal(daProgramma(modulo({ nome: 'Bot', [CAMPO_TRAPPOLA]: 'https://spam.example' })), true);
});

test('campo trappola: stesso nome in tutti i moduli, quello già usato dai tavoli', () => {
  assert.equal(CAMPO_TRAPPOLA, 'sito');
});
