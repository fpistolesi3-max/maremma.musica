// L'elenco della porta lasciato sul telefono durante la serata si cancella da qualsiasi pagina dopo la scadenza. Si lancia con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIAVE_PORTA, pulisciElencoPorta } from './porta-pulizia';

const memoria = (stato: Record<string, unknown> | null) => {
  const m = new Map<string, string>();
  if (stato) m.set(CHIAVE_PORTA, JSON.stringify({ state: stato, version: 0 }));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};
const salvato = { eventoId: 'e1', porta: 'P2', elenco: [{ id: 'v1', nome: 'Giulia', dataNascita: '2000-01-02' }], salvatoAlle: '2026-11-08T22:00:00.000Z', scadeAlle: '2026-11-09T15:00:00.000Z', limite: null, coda: [], conflitti: 1 };

test('pulizia: prima della scadenza l’elenco resta', () => {
  const x = memoria(salvato);
  assert.equal(pulisciElencoPorta(x, new Date('2026-11-09T14:59:00.000Z')), false);
  assert.match(x.m.get(CHIAVE_PORTA)!, /Giulia/);
});

test('pulizia: dopo la scadenza nomi e date di nascita spariscono, la porta scelta resta', () => {
  const x = memoria(salvato);
  assert.equal(pulisciElencoPorta(x, new Date('2026-11-09T15:01:00.000Z')), true);
  const dopo = x.m.get(CHIAVE_PORTA)!;
  assert.doesNotMatch(dopo, /Giulia|2000-01-02/);
  const s = JSON.parse(dopo).state;
  assert.deepEqual([s.eventoId, s.elenco, s.scadeAlle, s.porta, JSON.parse(dopo).version], [null, [], null, 'P2', 0]);
});

test('pulizia: mai con ingressi ancora da inviare; niente da fare senza scadenza o senza dati', () => {
  const conCoda = memoria({ ...salvato, coda: [{ idLocale: 'm1' }] });
  assert.equal(pulisciElencoPorta(conCoda, new Date('2026-11-10T00:00:00.000Z')), false);
  assert.match(conCoda.m.get(CHIAVE_PORTA)!, /Giulia/);
  assert.equal(pulisciElencoPorta(memoria({ ...salvato, scadeAlle: null }), new Date('2027-01-01T00:00:00.000Z')), false);
  assert.equal(pulisciElencoPorta(memoria(null)), false);
  const rotto = { getItem: () => '{non json', setItem: () => { throw new Error('no'); } };
  assert.equal(pulisciElencoPorta(rotto), false);
});
