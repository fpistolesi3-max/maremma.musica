import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riassuntoTipo, type DatiTipo } from './riassunto-tipo';

const BASE: DatiTipo = {
  uscitaModo: 'subito', uscitaGiorniPrima: '', dataInizio: '', dopoPrecedente: false, primo: true,
  fineModo: 'mai', fineOrePrima: '', dataFine: '', quantita: '', categoria: '', confermaCategoria: false,
  prModo: 'tutti', prScelti: [],
};
const con = (x: Partial<DatiTipo>) => riassuntoTipo({ ...BASE, ...x });

test('il caso più semplice: da subito, alla serata, posti illimitati, tutti i PR', () => {
  assert.equal(con({}), 'In vendita da subito fino alla serata · posti illimitati · anche dai link di tutti i PR');
});

test('esempio del modulo: data fissa 28/11, 100 posti', () => {
  assert.equal(con({ uscitaModo: 'data', dataInizio: '2026-11-28T00:00', quantita: '100' }),
    'In vendita dal 28/11 alle 00:00 fino alla serata · 100 posti · anche dai link di tutti i PR');
});

test('inizio: N giorni prima (0, 1, molti)', () => {
  assert.match(con({ uscitaModo: 'giorni', uscitaGiorniPrima: '14' }), /^In vendita da 14 giorni prima della serata fino/);
  assert.match(con({ uscitaModo: 'giorni', uscitaGiorniPrima: '1' }), /^In vendita da 1 giorno prima della serata fino/);
  assert.match(con({ uscitaModo: 'giorni', uscitaGiorniPrima: '0' }), /^In vendita dall’apertura della serata fino/);
});

test('inizio: quando finisce il tipo prima, da solo o con una data', () => {
  assert.match(con({ dopoPrecedente: true, primo: false }), /^In vendita quando finiscono i posti del tipo prima fino alla serata · posti/);
  assert.equal(con({ dopoPrecedente: true, primo: false, uscitaModo: 'data', dataInizio: '2026-12-01T18:30' }),
    'In vendita dal 01/12 alle 18:30 fino alla serata · solo quando finiscono i posti del tipo prima · posti illimitati · anche dai link di tutti i PR');
  assert.match(con({ dopoPrecedente: true, primo: false, uscitaModo: 'giorni', uscitaGiorniPrima: '7' }), /da 7 giorni prima della serata fino alla serata · solo quando finiscono/);
});

test('il primo tipo non ha un tipo prima: la casella non conta', () => {
  assert.match(con({ dopoPrecedente: true, primo: true }), /^In vendita da subito fino alla serata · posti/);
});

test('fine: alla serata, N ore prima (168 = 7 giorni), data fissa', () => {
  assert.match(con({ fineModo: 'ore', fineOrePrima: '3' }), /fino a 3 ore prima della serata/);
  assert.match(con({ fineModo: 'ore', fineOrePrima: '1' }), /fino a 1 ora prima della serata/);
  assert.match(con({ fineModo: 'ore', fineOrePrima: '168' }), /fino a 7 giorni prima della serata/);
  assert.match(con({ fineModo: 'ore', fineOrePrima: '24' }), /fino a 1 giorno prima della serata/);
  assert.match(con({ fineModo: 'ore', fineOrePrima: '0' }), /fino all’inizio della serata/);
  assert.match(con({ fineModo: 'data', dataFine: '2026-12-05T23:59' }), /fino al 05\/12 alle 23:59/);
  assert.match(con({ fineModo: 'mai' }), /fino alla serata/);
});

test('posti: illimitati, 1, N', () => {
  assert.match(con({ quantita: '' }), /· posti illimitati ·/);
  assert.match(con({ quantita: '1' }), /· 1 posto ·/);
  assert.match(con({ quantita: '250' }), /· 250 posti ·/);
});

test('categoria: nessuna (non compare), con nome, con dichiarazione del cliente', () => {
  assert.doesNotMatch(con({}), /categoria/);
  assert.match(con({ categoria: 'Donne' }), /· categoria Donne ·/);
  assert.match(con({ categoria: 'Studenti', confermaCategoria: true }), /· categoria Studenti \(il cliente dichiara di rientrarci\) ·/);
  assert.doesNotMatch(con({ categoria: '  ', confermaCategoria: true }), /categoria/);
});

test('PR: tutti, alcuni, nessuno', () => {
  assert.match(con({ prModo: 'tutti' }), /anche dai link di tutti i PR$/);
  assert.match(con({ prModo: 'alcuni', prScelti: ['Marco', 'Giulia'] }), /solo dai link di Marco, Giulia$/);
  assert.match(con({ prModo: 'nessuno' }), /solo dal sito, non dai link dei PR$/);
});

test('PR "alcuni" senza nessuno spuntato: il salvataggio lo tratta come "tutti", e il riepilogo lo dice', () => {
  assert.match(con({ prModo: 'alcuni', prScelti: [] }), /nessun PR scelto: vale per i link di tutti i PR$/);
});

test('campi mancanti: il riepilogo dice che vale "da subito" invece di inventare una data', () => {
  assert.match(con({ uscitaModo: 'data', dataInizio: '' }), /^In vendita da subito \(manca la data di inizio\) fino alla serata/);
  assert.match(con({ uscitaModo: 'giorni', uscitaGiorniPrima: '' }), /^In vendita da subito \(manca il numero di giorni\)/);
  assert.match(con({ fineModo: 'ore', fineOrePrima: '' }), /fino alla serata \(manca il numero di ore\)/);
  assert.match(con({ fineModo: 'data', dataFine: '' }), /fino alla serata \(manca la data di fine\)/);
});

test('con i giorni scritti, la data fissa nascosta non conta (come nel salvataggio)', () => {
  assert.match(con({ uscitaModo: 'giorni', uscitaGiorniPrima: '3', dataInizio: '2026-11-28T00:00' }), /^In vendita da 3 giorni prima della serata/);
});

test('data senza orario: usa 00:00 per l’inizio e 23:59 per la fine', () => {
  assert.match(con({ uscitaModo: 'data', dataInizio: '2026-11-28' }), /dal 28\/11 alle 00:00/);
  assert.match(con({ fineModo: 'data', dataFine: '2026-12-05' }), /fino al 05\/12 alle 23:59/);
});

test('tutto insieme', () => {
  assert.equal(
    con({ primo: false, dopoPrecedente: true, uscitaModo: 'giorni', uscitaGiorniPrima: '7', fineModo: 'ore', fineOrePrima: '3', quantita: '50', categoria: 'Donne', confermaCategoria: true, prModo: 'alcuni', prScelti: ['Marco'] }),
    'In vendita da 7 giorni prima della serata fino a 3 ore prima della serata · solo quando finiscono i posti del tipo prima · 50 posti · categoria Donne (il cliente dichiara di rientrarci) · solo dai link di Marco');
});
