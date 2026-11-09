import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quandoParteLaVendita, riassuntoTipo, type DatiTipo } from './riassunto-tipo';

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
  assert.match(con({ uscitaModo: 'giorni', uscitaGiorniPrima: '0' }), /^In vendita dal giorno della serata fino/);
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

test('PR "alcuni" senza nessuno spuntato: non si salva, e il riepilogo lo dice', () => {
  assert.match(con({ prModo: 'alcuni', prScelti: [] }), /nessun PR scelto: spunta almeno un PR per salvare$/);
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

// La serata del test: lunedì 7 dicembre 2026, apertura alle 22:00 a Roma (21:00 UTC).
const SERATA = '2026-12-07T21:00:00.000Z';

test('con la data della serata: «14 giorni prima» diventa anche il giorno', () => {
  assert.match(con({ dataSerata: SERATA, uscitaModo: 'giorni', uscitaGiorniPrima: '14' }), /^In vendita dal 23\/11 alle 22:00 \(14 giorni prima\) fino alla serata/);
  assert.match(con({ dataSerata: SERATA, uscitaModo: 'giorni', uscitaGiorniPrima: '1' }), /^In vendita dal 06\/12 alle 22:00 \(1 giorno prima\)/);
  assert.match(con({ dataSerata: SERATA, uscitaModo: 'giorni', uscitaGiorniPrima: '0' }), /^In vendita dal 07\/12 alle 22:00 \(il giorno della serata\)/);
});

test('con la data della serata: «N ore prima» diventa anche il giorno e l’ora', () => {
  assert.match(con({ dataSerata: SERATA, fineModo: 'ore', fineOrePrima: '3' }), /fino al 07\/12 alle 19:00 \(3 ore prima\)/);
  assert.match(con({ dataSerata: SERATA, fineModo: 'ore', fineOrePrima: '168' }), /fino al 30\/11 alle 22:00 \(7 giorni prima\)/);
  assert.match(con({ dataSerata: SERATA, fineModo: 'ore', fineOrePrima: '1' }), /fino al 07\/12 alle 21:00 \(1 ora prima\)/);
  assert.match(con({ dataSerata: SERATA, fineModo: 'ore', fineOrePrima: '0' }), /fino all’inizio della serata \(07\/12 alle 22:00\)/);
});

test('l’ora è quella di Roma anche a cavallo del cambio d’ora (serata dopo il 28 marzo 2027)', () => {
  // 3 aprile 2027, apertura 22:00 ora legale (20:00 UTC): 14 giorni prima, in ore, cade il 20 marzo alle 21:00 (ora solare) .
  assert.match(con({ dataSerata: '2027-04-03T20:00:00.000Z', uscitaModo: 'giorni', uscitaGiorniPrima: '14' }), /^In vendita dal 20\/03 alle 21:00 \(14 giorni prima\)/);
});

test('con la data della serata ma con una data fissa o niente: non cambia nulla', () => {
  assert.equal(con({ dataSerata: SERATA, uscitaModo: 'data', dataInizio: '2026-11-28T00:00', quantita: '100' }),
    'In vendita dal 28/11 alle 00:00 fino alla serata · 100 posti · anche dai link di tutti i PR');
  assert.equal(con({ dataSerata: SERATA }), con({}));
});

test('data della serata non valida: il riepilogo torna alle parole senza giorno', () => {
  assert.match(con({ dataSerata: 'boh', uscitaModo: 'giorni', uscitaGiorniPrima: '14', fineModo: 'ore', fineOrePrima: '3' }),
    /^In vendita da 14 giorni prima della serata fino a 3 ore prima della serata/);
});

test('testata della sezione: quando parte la vendita del primo tipo', () => {
  const tipo = { dataInizio: null, dataFine: null, uscitaGiorniPrima: null, fineOrePrima: null };
  assert.equal(quandoParteLaVendita(tipo, SERATA), 'da subito');
  assert.equal(quandoParteLaVendita({ ...tipo, dataInizio: '2026-11-27T23:00:00.000Z' }, SERATA), 'dal 28/11', 'mezzanotte di Roma');
  assert.equal(quandoParteLaVendita({ ...tipo, uscitaGiorniPrima: 14 }, SERATA), 'dal 23/11');
  assert.equal(quandoParteLaVendita({ ...tipo, uscitaGiorniPrima: 14, dataInizio: '2026-11-27T23:00:00.000Z' }, SERATA), 'dal 23/11', 'i giorni prima battono la data fissa, come nelle regole di vendita');
});
