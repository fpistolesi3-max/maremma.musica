import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginaAccessoNegato } from './accesso-negato';

test('file riservato senza permesso: pagina leggibile con un link, testi protetti', () => {
  const html = paginaAccessoNegato('Solo per l’admin', 'Torna alla tua area.', { href: '/pr/x"onmouseover="alert(1)', testo: 'Vai <b>ora</b>' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('Solo per l’admin') && html.includes('Torna alla tua area.'));
  assert.ok(!html.includes('<b>ora</b>'), 'testo del link senza HTML');
  assert.ok(!html.includes('"onmouseover='), 'indirizzo del link senza virgolette libere');
  assert.ok(html.includes('noindex'));
});
