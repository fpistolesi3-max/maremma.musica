// Il telefono della porta tiene l'elenco (nomi, date di nascita) in localStorage: `svuota` lo cancella, ma mai con ingressi ancora da inviare.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const memoria = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => { memoria.set(k, v); }, removeItem: (k: string) => { memoria.delete(k); },
  clear: () => memoria.clear(), key: () => null, length: 0,
} as Storage;

const voce = { id: 'v1', nome: 'Giulia', cognome: 'Rossi', dataNascita: '2000-01-02' } as never;
const movimento = { idLocale: 'm1', voceId: 'v1', chiave: 'k', ora: '2026-11-08T23:00:00.000Z' };

test('svuota: cancella elenco e serata dal telefono, anche da localStorage', async () => {
  const { usePorta } = await import('./store');
  usePorta.setState({ eventoId: 'e1', elenco: [voce], salvatoAlle: '2026-11-08T20:00:00.000Z', limite: '2026-11-09T01:00:00.000Z', coda: [], conflitti: 2 });
  assert.match(memoria.get('mm-porta') ?? '', /Giulia/, 'prima è salvato');
  assert.equal(usePorta.getState().svuota(), true);
  const s = usePorta.getState();
  assert.deepEqual([s.eventoId, s.elenco, s.salvatoAlle, s.limite, s.conflitti], [null, [], null, null, 0]);
  assert.doesNotMatch(memoria.get('mm-porta') ?? '', /Giulia|2000-01-02/, 'dopo non resta nessun dato personale');
});

test('svuota: con ingressi ancora da inviare non tocca niente', async () => {
  const { usePorta } = await import('./store');
  usePorta.setState({ eventoId: 'e1', elenco: [voce], coda: [movimento] });
  assert.equal(usePorta.getState().svuota(), false);
  const s = usePorta.getState();
  assert.deepEqual([s.eventoId, s.elenco.length, s.coda.length], ['e1', 1, 1]);
  assert.match(memoria.get('mm-porta') ?? '', /Giulia/);
});
