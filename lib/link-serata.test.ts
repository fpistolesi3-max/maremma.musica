import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilitatoPerSerata, linkSerataPr, linkWhatsAppAmici, motivoNoInvioLink, testoLinkPerPr, testoPerClienti, testoUltimoInvio } from './link-serata';

const evento = { nome: 'Halloween Party', slug: 'halloween-party', data: '2026-11-13T21:00:00Z', dataFine: '2026-11-14T03:00:00Z', pubblicato: true, prAbilitati: null as string[] | null };

test('link serata: link personale di ogni PR e testi pronti', () => {
  assert.equal(linkSerataPr('https://sito.it/', evento, 'zarro'), 'https://sito.it/e/halloween-party/zarro');
  const t = testoLinkPerPr('Zarro Pollicino', evento, 'https://sito.it/e/halloween-party/zarro');
  assert.ok(t.startsWith('Ciao Zarro!') && t.includes('Halloween Party') && t.includes('https://sito.it/e/halloween-party/zarro'));
  assert.ok(!t.includes('clienti') && t.split('https://').length === 2, 'su WhatsApp solo il link, una volta');
  assert.ok(testoPerClienti(evento, 'https://x.it/l').includes('https://x.it/l'));
});

test('link serata: WhatsApp per gli amici porta il link della serata (anche quello del PR) una volta sola', () => {
  const link = 'https://sito.it/e/halloween-party/zarro';
  const url = linkWhatsAppAmici(evento, link);
  assert.ok(url.startsWith('https://wa.me/?text='));
  const testo = decodeURIComponent(url.slice('https://wa.me/?text='.length));
  assert.ok(testo.includes('Halloween Party') && testo.endsWith(link) && testo.split('https://').length === 2);
});

test('link serata: chi è abilitato (solo attivi, e la serata aperta a tutti o proprio a loro)', () => {
  assert.equal(abilitatoPerSerata({ id: 'a', stato: 'attivo' }, evento), true);
  assert.equal(abilitatoPerSerata({ id: 'a', stato: 'sospeso' }, evento), false);
  assert.equal(abilitatoPerSerata({ id: 'a', stato: 'attivo' }, { prAbilitati: ['b'] }), false);
  assert.equal(abilitatoPerSerata({ id: 'a', stato: 'attivo' }, { prAbilitati: ['a', 'b'] }), true);
  assert.equal(abilitatoPerSerata({ id: 'a', stato: 'sospeso' }, { prAbilitati: ['a'] }), false);
});

test('link serata: bozza e serate passate non si inviano', () => {
  const prima = new Date('2026-11-02T10:00:00Z');
  assert.equal(motivoNoInvioLink(evento, prima), null);
  assert.match(motivoNoInvioLink({ ...evento, pubblicato: false }, prima)!, /bozza/);
  assert.match(motivoNoInvioLink(evento, new Date('2026-11-20T10:00:00Z'))!, /passata/);
});

test('link serata: riga dell’ultimo invio', () => {
  const t = testoUltimoInvio({ at: '2026-11-02T17:04:00Z', inviate: 8, nonPartite: 0 });
  assert.match(t, /^Inviato il 2\.11 alle 18:04 a 8 PR$/);
  assert.match(testoUltimoInvio({ at: '2026-11-02T17:04:00Z', inviate: 7, nonPartite: 1 }), /\(1 non partite\)/);
  // Con le email vere spente non si dice "inviato".
  assert.equal(testoUltimoInvio({ at: '2026-11-02T17:04:00Z', inviate: 0, nonPartite: 0, inArchivio: 8 }), 'Provato il 2.11 alle 18:04: 8 email sono rimaste nell’archivio di prova, non inviate');
  assert.ok(!/Inviato/.test(testoUltimoInvio({ at: '2026-11-02T17:04:00Z', inviate: 0, nonPartite: 0, inArchivio: 1 })));
});
