import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indirizzoAccesso, linkWhatsApp, testoInvitoPr } from './inviti';

test('invito PR: testo con l’indirizzo completo di /accedi e l’email con cui entrare', () => {
  const t = testoInvitoPr('Bomber Tirreno', 'bomber@esempio.it', 'https://maremma.musica/');
  assert.ok(t.includes('https://maremma.musica/accedi'), 'indirizzo completo, senza doppia barra');
  assert.ok(t.includes('bomber@esempio.it'));
  assert.ok(t.startsWith('Ciao Bomber!'));
  assert.equal(indirizzoAccesso('http://192.168.1.5:3070'), 'http://192.168.1.5:3070/accedi');
});

test('invito PR: link WhatsApp col testo già scritto', () => {
  const testo = testoInvitoPr('Zarro', 'z@esempio.it', 'https://sito.it');
  const link = linkWhatsApp(testo);
  assert.ok(link.startsWith('https://wa.me/?text='));
  assert.equal(new URL(link).searchParams.get('text'), testo, 'si legge uguale una volta aperto');
});
