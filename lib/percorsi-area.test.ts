import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinazionePer, puoAprire } from './percorsi-area';
import type { Pr, Utente } from './dati/tipi';

const utente = (ruolo: Utente['ruolo']): Utente => ({ id: 'u', email: 'a@esempio.it', ruolo, prId: ruolo === 'pr' ? 'p' : null, createdAt: '2026-01-01T00:00:00Z' });
const pr: Pr = { id: 'p', handle: 'bomber', nomeDisplay: 'Bomber', stato: 'attivo', createdAt: '2026-01-01T00:00:00Z' };

test('dopo l’accesso: l’admin torna alla pagina interna che aveva aperto', () => {
  assert.equal(destinazionePer(utente('admin'), null, '/admin/iscrizioni'), '/admin/iscrizioni');
  assert.equal(destinazionePer(utente('admin'), null, '/admin/pr?serata=abc'), '/admin/pr?serata=abc');
  assert.equal(destinazionePer(utente('admin'), null, null), '/admin');
});

test('dopo l’accesso: "dopo" fuori dal sito o di un’altra area non porta da nessuna parte', () => {
  for (const no of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/\t/evil.com', '/accedi']) {
    assert.equal(destinazionePer(utente('admin'), null, no), '/admin', no);
    assert.equal(destinazionePer(utente('staff'), null, no), '/door', no);
    assert.equal(destinazionePer(utente('pr'), pr, no), '/pr/bomber', no);
  }
  assert.equal(destinazionePer(utente('staff'), null, '/admin/pr'), '/door', 'lo staff non entra nell’area admin');
  assert.equal(destinazionePer(utente('pr'), pr, '/admin/iscrizioni'), '/pr/bomber');
  assert.equal(destinazionePer(utente('pr'), pr, '/gestione/pr'), '/pr/bomber', 'il vecchio indirizzo non è del PR');
});

test('aree: chi può aprire cosa', () => {
  assert.equal(puoAprire('admin', '/admin/pr'), true);
  assert.equal(puoAprire('staff', '/door'), true);
  assert.equal(puoAprire('staff', '/admin/pr'), false);
  assert.equal(puoAprire('staff', '/gestione/pr'), false);
  assert.equal(puoAprire('pr', '/pr/bomber'), true);
  assert.equal(puoAprire('pr', '/door'), false);
});
