import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percorsoIscrizioni, vistaIscrizioni } from './iscrizioni-vista';

const s = (id: string, data: string, passata: boolean) => ({ id, passata, evento: { id, data, pubblicato: true } });
const SERATE = [s('solchi', '2026-11-07T21:00:00.000Z', false), s('capodanno', '2026-12-31T21:00:00.000Z', false), s('vecchia', '2026-09-12T20:00:00.000Z', true)];

test('iscrizioni: senza scelta si apre sulla prossima serata, con scelta su quella', () => {
  assert.deepEqual([vistaIscrizioni({}, SERATE).scelta?.evento.id, vistaIscrizioni({}, SERATE).tutte], ['solchi', false]);
  assert.equal(vistaIscrizioni({ evento: 'capodanno' }, SERATE).scelta?.evento.id, 'capodanno');
  assert.equal(vistaIscrizioni({ evento: 'sbagliata' }, SERATE).scelta?.evento.id, 'solchi', 'una serata che non esiste riporta alla prossima');
  assert.equal(vistaIscrizioni({}, [SERATE[2]]).scelta?.evento.id, 'vecchia', 'senza serate in arrivo, l’ultima passata');
  assert.equal(vistaIscrizioni({}, []).scelta, null);
});

test('iscrizioni: con un testo di ricerca si guarda in tutte le serate e la scelta resta per tornarci', () => {
  const v = vistaIscrizioni({ evento: 'capodanno', q: 'rossi' }, SERATE);
  assert.deepEqual([v.tutte, v.scelta?.evento.id], [true, 'capodanno']);
  assert.equal(vistaIscrizioni({ evento: 'capodanno', q: '   ' }, SERATE).tutte, false, 'solo spazi non è una ricerca');
});

test('iscrizioni: il filtro PR o canale tiene la serata se c’è, altrimenti guarda in tutte', () => {
  assert.equal(vistaIscrizioni({ evento: 'solchi', pr: 'zarro-pollicino' }, SERATE).tutte, false);
  assert.equal(vistaIscrizioni({ pr: 'zarro-pollicino' }, SERATE).tutte, true);
  assert.equal(vistaIscrizioni({ canale: 'instagram' }, SERATE).tutte, true);
});

test('iscrizioni: indirizzo con i soli filtri presenti', () => {
  assert.equal(percorsoIscrizioni({}), '/admin/iscrizioni');
  assert.equal(percorsoIscrizioni({ evento: 'solchi', pr: 'zarro-pollicino' }), '/admin/iscrizioni?evento=solchi&pr=zarro-pollicino');
  assert.equal(percorsoIscrizioni({ evento: undefined, q: 'a b@c', stato: '' }), '/admin/iscrizioni?q=a+b%40c');
});
