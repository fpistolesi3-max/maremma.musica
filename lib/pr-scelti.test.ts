import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erroreScelta } from './pr-scelti';

test('«alcuni» senza nessun PR spuntato è un errore, con parole diverse per tipi e tavoli', () => {
  assert.match(erroreScelta('alcuni', [], 'tipo')!, /nessun PR.*Venduto anche dai link di tutti i PR/);
  assert.match(erroreScelta('alcuni', [], 'tavolo')!, /nessun PR.*«Tutti i PR»/);
});

test('«alcuni» con almeno un PR va bene', () => {
  assert.equal(erroreScelta('alcuni', ['pr-1'], 'tipo'), null);
  assert.equal(erroreScelta('alcuni', ['pr-1', 'pr-2'], 'tavolo'), null);
});

test('«tutti» e «nessuno» non chiedono PR spuntati', () => {
  assert.equal(erroreScelta('tutti', [], 'tipo'), null);
  assert.equal(erroreScelta('nessuno', [], 'tavolo'), null);
  assert.equal(erroreScelta('', [], 'tipo'), null);
});
