// La finestra della porta: un biglietto di un'altra sera non si consuma. Si lancia con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiaSerataPossibile, decidiIngresso, finestraPorta, motivoPortaChiusa, type VocePorta } from './porta-logica';

const SERATA = { data: '2026-10-31T21:00:00.000Z', dataFine: '2026-11-01T03:00:00.000Z' }; // 22:00 – 04:00 a Roma
const ore = (da: string, h: number) => new Date(Date.parse(da) + h * 3_600_000).toISOString();

const voce = (extra: Partial<VocePorta> = {}): VocePorta => ({
  id: 'i1', token: 'MM1.x', codice: 'ABCD1234', nome: 'Anna', cognome: 'Rossi', dataNascita: '2000-01-01', stato: 'pagato', importo: 10,
  oraCheckIn: null, porta: null, lista: 'Maremma Musica', canale: 'diretto', origine: 'lista', ...extra,
});

test('finestra della porta: dalle 12 ore prima dell\'inizio fino alla fine della serata', () => {
  assert.equal(finestraPorta(SERATA, ore(SERATA.data, -12.01)), 'prima');
  assert.equal(finestraPorta(SERATA, ore(SERATA.data, -12)), 'aperta', 'si apre alle 12 ore prima');
  assert.equal(finestraPorta(SERATA, ore(SERATA.data, 0)), 'aperta');
  assert.equal(finestraPorta(SERATA, SERATA.dataFine), 'aperta', 'alla fine esatta è ancora aperta');
  assert.equal(finestraPorta(SERATA, ore(SERATA.dataFine, 0.01)), 'dopo');
  // Senza orario di chiusura la serata dura 8 ore (come eventoPassato).
  const senzaFine = { data: SERATA.data, dataFine: null };
  assert.equal(finestraPorta(senzaFine, ore(SERATA.data, 8)), 'aperta');
  assert.equal(finestraPorta(senzaFine, ore(SERATA.data, 8.01)), 'dopo');
  // Una serata tra 18 giorni è chiusa adesso.
  assert.equal(finestraPorta({ data: ore(SERATA.data, 18 * 24), dataFine: null }, SERATA.data), 'prima');
  assert.equal(motivoPortaChiusa('prima'), 'Porta non ancora aperta per questa serata');
  assert.equal(motivoPortaChiusa('dopo'), 'Serata finita');
});

test('porta chiusa: nessun ingresso, il biglietto non si consuma (prevendita, categoria e tavolo)', () => {
  for (const finestra of ['prima', 'dopo'] as const) {
    for (const v of [voce(), voce({ categoria: 'Donne' }), voce({ tavolo: { nome: 'T1', persone: 4, entrati: 0, pagato: true } })]) {
      const r = decidiIngresso(v, { porta: 'P1', ora: SERATA.data, finestra, confermato: true });
      assert.equal(r.aggiornata, null, 'niente da scrivere');
      assert.deepEqual(r.esito, { esito: 'non_valido', motivo: motivoPortaChiusa(finestra) });
    }
  }
  // Con la porta aperta (o senza finestra) entra come sempre.
  assert.equal(decidiIngresso(voce(), { porta: 'P1', ora: SERATA.data, finestra: 'aperta' }).esito.esito, 'entrato');
  assert.equal(decidiIngresso(voce(), { porta: 'P1', ora: SERATA.data }).esito.esito, 'entrato');
});

test('"Cambia serata" si offre solo per la serata di stanotte, non per una futura', () => {
  assert.equal(cambiaSerataPossibile({ finestra: 'aperta' }), true);
  assert.equal(cambiaSerataPossibile({ finestra: 'prima' }), false);
  assert.equal(cambiaSerataPossibile({ finestra: 'dopo' }), false);
});
