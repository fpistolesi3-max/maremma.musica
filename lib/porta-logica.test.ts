// La finestra della porta: un biglietto di un'altra sera non si consuma. Si lancia con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiaSerataPossibile, decidiIngresso, elencoDaTenereAllUscita, elencoScaduto, finestraPorta, motivoPortaChiusa, scadenzaElencoPorta, serataFuoriPorta, type VocePorta } from './porta-logica';

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

test('scansione = solo guardare: l\'ingresso si registra solo con "Fai entrare"', () => {
  const o = { porta: 'P1', ora: SERATA.data, finestra: 'aperta' as const };
  // Prevendita pagata e ingresso libero: "valido", niente da scrivere.
  for (const v of [voce(), voce({ stato: 'in_lista', importo: 0 })]) {
    const guarda = decidiIngresso(v, { ...o, anteprima: true });
    assert.equal(guarda.esito.esito, 'valido');
    assert.equal(guarda.aggiornata, null, 'nessun ingresso registrato dalla sola scansione');
    // Poi "Fai entrare": stessa decisione di sempre, adesso registra.
    const entra = decidiIngresso(v, o);
    assert.equal(entra.esito.esito, 'entrato');
    assert.equal(entra.aggiornata?.stato, 'entrato');
  }
  // Tavolo: l'anteprima mostra la persona che entrerebbe ("2 di 6") ma non scrive; ogni conferma ne fa entrare una sola.
  const tavolo = voce({ tavolo: { nome: 'T1', persone: 6, entrati: 1, pagato: true } });
  const g = decidiIngresso(tavolo, { ...o, anteprima: true });
  assert.ok(g.esito.esito === 'valido' && g.esito.voce.tavolo!.entrati === 2);
  assert.equal(g.aggiornata, null);
  assert.equal(decidiIngresso(tavolo, o).aggiornata?.tavolo?.entrati, 2);
});

test('l\'anteprima non salta nessun controllo: già entrato, annullato, porta chiusa, categoria, documento', () => {
  const o = { porta: 'P1', ora: SERATA.data, finestra: 'aperta' as const, anteprima: true };
  assert.equal(decidiIngresso(voce({ stato: 'entrato', oraCheckIn: SERATA.data, porta: 'P2' }), o).esito.esito, 'gia_entrato', 'entrato da un\'altra porta: non si registra due volte');
  assert.equal(decidiIngresso(voce({ stato: 'annullato' }), o).esito.esito, 'annullato');
  assert.equal(decidiIngresso(voce({ stato: 'in_attesa' }), o).esito.esito, 'non_pagato');
  assert.equal(decidiIngresso(voce(), { ...o, finestra: 'prima' }).esito.esito, 'non_valido');
  assert.equal(decidiIngresso(voce({ categoria: 'Donne' }), o).esito.esito, 'da_confermare', 'la categoria resta il flusso giallo');
  assert.equal(decidiIngresso(voce(), { ...o, documento: true }).esito.esito, 'da_confermare', 'serata senza telefono: resta il flusso giallo');
  assert.equal(decidiIngresso(voce({ tavolo: { nome: 'T1', persone: 4, entrati: 4, pagato: true } }), o).esito.esito, 'gia_entrato', 'tavolo pieno');
});

test('elenco della porta: la serata esce dalla porta 12 ore dopo la fine, poi il telefono cancella nomi e date di nascita', () => {
  assert.equal(serataFuoriPorta(SERATA, ore(SERATA.data, -48)), false, 'una serata futura resta (lo staff scarica l’elenco prima)');
  assert.equal(serataFuoriPorta(SERATA, SERATA.dataFine), false);
  assert.equal(serataFuoriPorta(SERATA, ore(SERATA.dataFine, 12)), false, 'alle 12 ore esatte dopo la fine c’è ancora');
  assert.equal(serataFuoriPorta(SERATA, ore(SERATA.dataFine, 12.01)), true);
  // Senza orario di chiusura la serata dura 8 ore: fuori 20 ore dopo l'inizio.
  const senzaFine = { data: SERATA.data, dataFine: null };
  assert.equal(serataFuoriPorta(senzaFine, ore(SERATA.data, 19.99)), false);
  assert.equal(serataFuoriPorta(senzaFine, ore(SERATA.data, 20.01)), true);
});

test('"Esci" durante la serata lascia l’elenco (chi esce per sbaglio senza campo lo ritrova); fuori dalla serata lo cancella', () => {
  assert.equal(elencoDaTenereAllUscita(SERATA, ore(SERATA.data, -12.01)), false, 'telefono usato per una serata futura: si cancella');
  assert.equal(elencoDaTenereAllUscita(SERATA, ore(SERATA.data, -12)), true, 'da quando si apre la porta');
  assert.equal(elencoDaTenereAllUscita(SERATA, ore(SERATA.data, 2)), true);
  assert.equal(elencoDaTenereAllUscita(SERATA, ore(SERATA.dataFine, 1)), true, 'chiusura e sincronizzazioni dopo la fine');
  assert.equal(elencoDaTenereAllUscita(SERATA, ore(SERATA.dataFine, 12.01)), false, 'serata uscita dalla porta');
  // La scadenza salvata con l'elenco: 12 ore dopo la fine (senza orario di chiusura, inizio + 8 ore).
  assert.equal(scadenzaElencoPorta(SERATA), ore(SERATA.dataFine, 12));
  assert.equal(scadenzaElencoPorta({ data: SERATA.data, dataFine: null }), ore(SERATA.data, 20));
  assert.equal(elencoScaduto(scadenzaElencoPorta(SERATA), ore(SERATA.dataFine, 12)), false);
  assert.equal(elencoScaduto(scadenzaElencoPorta(SERATA), ore(SERATA.dataFine, 12.01)), true);
  assert.equal(elencoScaduto(null, ore(SERATA.dataFine, 100)), false, 'senza scadenza decide la porta');
});
