import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTEZZA, LARGHEZZA, LAT_N, LAT_S, LON_E, LON_O, PAESI, distanzeStimate, inMaremma, minutiStimati, proietta, rigaDistanze } from './cartina';
import { stileLocandina, zoomLocandina } from './mappa';
import { DISTANZA, misuraEtichetta, rettNome, rettPulsanti, scegliLato, sovrapposizione } from './etichetta';

test('proiezione: gli angoli del riquadro cadono negli angoli del disegno', () => {
  assert.deepEqual(proietta(LAT_N, LON_O), { x: 0, y: 0 });
  const g = proietta(42.7604, 11.1137); // Grosseto sta al centro-destra, a metà altezza
  assert.ok(g.x > LARGHEZZA * 0.55 && g.x < LARGHEZZA * 0.65);
  assert.ok(g.y > ALTEZZA * 0.5 && g.y < ALTEZZA * 0.65);
});

test('la cartina vale solo in Maremma, con margine dal bordo', () => {
  assert.equal(inMaremma(43.1512, 10.7713), true, 'Campo Scirea, Monteverdi');
  assert.equal(inMaremma(43.0179, 10.6278), true, 'Tenuta Eleonora di Toledo, Campiglia');
  assert.equal(inMaremma(43.7696, 11.2558), false, 'Firenze');
  assert.equal(inMaremma(43.42, 10.8), false, 'troppo vicino al bordo nord');
  assert.equal(inMaremma(43.2, 10.55), true, 'Castagneto, Val di Cornia');
  assert.equal(inMaremma(null, 10.8), false);
  assert.equal(inMaremma(Number.NaN, 10.8), false);
});

test('tempi stimati: dalla linea d’aria, a multipli di 5, mai sotto 5', () => {
  assert.equal(minutiStimati(0.2), 5);
  assert.equal(minutiStimati(10), 15); // 10 km × 1,35 / 55 km/h ≈ 15 min
  assert.equal(minutiStimati(30), 45);
  assert.ok([5, 10, 15, 20, 25, 30].includes(minutiStimati(14)));
});

test('riga delle distanze: tre paesi dal più vicino, il primo con "min"', () => {
  const riga = rigaDistanze(42.76, 11.0); // fra Grosseto e Marina
  assert.match(riga, /^\d+ min da .+ · \d+ da .+ · \d+ da .+$/);
  const d = distanzeStimate(43.0179, 10.6278);
  assert.equal(d.length, 3);
  assert.equal(d[0].nome, 'Campiglia');
  assert.ok(d[0].min <= d[1].min && d[1].min <= d[2].min);
});

test('stile locandina: niente edifici né scritte della mappa, strade e mare ricolorati', () => {
  const stile: { layers: { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }[] } = {
    layers: [
      { id: 'background', type: 'background' },
      { id: 'water', type: 'fill' },
      { id: 'building', type: 'fill' },
      { id: 'place_town', type: 'symbol' },
      { id: 'highway_name_other', type: 'symbol' },
      { id: 'highway_motorway_inner', type: 'line' },
    ],
  };
  const per = Object.fromEntries(stileLocandina(stile).layers.map((l) => [l.id, l]));
  assert.equal(per.building.layout?.visibility, 'none');
  assert.equal(per.place_town.layout?.visibility, 'none');
  assert.equal(per.highway_name_other.layout?.visibility, 'none');
  assert.equal(per.water.paint?.['fill-color'], '#0e2b46');
  assert.ok(per.highway_motorway_inner.paint?.['line-width']);
  assert.equal(per.highway_motorway_inner.layout?.visibility, undefined, 'le strade restano');
});

test('zoom: più campo su telefono, meno su schermo largo', () => {
  assert.ok(zoomLocandina(343) < zoomLocandina(600));
  assert.ok(zoomLocandina(600) < zoomLocandina(900));
});

test('riquadro: la Val di Cornia sta nel mezzo, con Campiglia lontana dal bordo alto', () => {
  const campiglia = proietta(43.0179, 10.6278);
  assert.ok(campiglia.y > ALTEZZA * 0.25, 'abbastanza spazio sopra il punto per l’etichetta');
  for (const [nome, lat, lng] of [['Piombino', 42.924, 10.526], ['Suvereto', 43.0749, 10.6836], ['San Vincenzo', 43.1, 10.54], ['Capalbio', 42.4167, 11.4], ['Abbadia San Salvatore', 42.8808, 11.6733]] as const) {
    assert.equal(inMaremma(lat, lng), true, nome);
  }
});

test('paesi: ci sono tutti quelli da mostrare, con le coordinate dentro il riquadro', () => {
  const nomi = PAESI.map((p) => p.nome);
  for (const n of ['Piombino', 'San Vincenzo', 'Campiglia Marittima', 'Follonica', 'Massa Marittima', 'Castiglione della Pescaia', 'Grosseto', 'Marina di Grosseto', 'Orbetello', 'Capalbio', 'Arcidosso', 'Abbadia San Salvatore', 'Castel del Piano', 'Santa Fiora']) assert.ok(nomi.includes(n), n);
  for (const p of PAESI) assert.ok(p.lat < LAT_N && p.lat > LAT_S && p.lng > LON_O && p.lng < LON_E, p.nome);
});

const BOX = { w: 343, h: 332 };
const M = misuraEtichetta('Ricky Le Roy · Monteverdi', 'SAB 19 SETT · CAMPO G. SCIREA', false);

test('etichetta: misura entro i 290 px del CSS', () => {
  assert.ok(M.w <= 290 && M.w > 150);
  assert.equal(misuraEtichetta('X'.repeat(80), 'Y', false).w, 290);
  assert.equal(misuraEtichetta('X'.repeat(80), 'Y', true).w, 360);
});

test('etichetta: al centro, libero, sta sopra il punto', () => {
  const p = scegliLato({ x: 171, y: 166 }, M, BOX);
  assert.equal(p.lato, 'su');
  assert.equal(p.dentro, true);
  assert.ok(p.rett.y1 <= 166 - DISTANZA + 0.5);
});

test('etichetta: vicino al bordo alto passa sotto il punto', () => {
  const p = scegliLato({ x: 171, y: 40 }, M, BOX);
  assert.equal(p.lato, 'giu');
  assert.equal(p.dentro, true);
});

test('etichetta: vicino al bordo del riquadro non esce e lo stelo tocca ancora il punto', () => {
  for (const x of [10, 40, 303, 335]) {
    const p = scegliLato({ x, y: 170 }, M, BOX);
    assert.equal(p.dentro, true, `x=${x}`);
    assert.ok(p.rett.x0 >= 0 && p.rett.x1 <= BOX.w, `x=${x}`);
    const sulPunto = p.rett.x0 + (p.ancora / 100) * (p.rett.x1 - p.rett.x0);
    assert.ok(Math.abs(sulPunto - x) < 1.5, `stelo a ${sulPunto}, punto a ${x}`);
  }
});

test('etichetta: sceglie il lato che copre meno nomi', () => {
  const p = { x: 171, y: 166 };
  const sopra = { x0: 60, y0: 80, x1: 280, y1: 130 }; // un nome grande sopra il punto
  assert.equal(scegliLato(p, M, BOX, [sopra]).lato, 'giu');
  const sotto = { x0: 60, y0: 200, x1: 280, y1: 250 };
  const piccola = misuraEtichetta('Notte', 'SAB', false);
  assert.equal(scegliLato({ x: 150, y: 166 }, piccola, BOX, [sopra, sotto]).lato, 'dx', 'se coprono sopra e sotto, un’etichetta stretta va di lato');
});

test('etichetta: i pulsanti negli angoli in alto non si coprono', () => {
  const p = scegliLato({ x: 300, y: 70 }, misuraEtichetta('Notte', 'SAB 19 SETT', false), BOX, rettPulsanti(BOX.w, true));
  assert.equal(sovrapposizione(p.rett, rettPulsanti(BOX.w, true)[0]), 0);
});

test('nomi: rettangolo a destra, a sinistra o centrato sul punto', () => {
  const d = rettNome(100, 50, 'Grosseto');
  const s = rettNome(100, 50, 'Grosseto', { sinistra: true });
  const c = rettNome(100, 50, 'Elba', { centrato: true });
  assert.ok(d.x0 === 100 && s.x1 === 100 && d.x1 - d.x0 === s.x1 - s.x0);
  assert.ok(c.x0 < 100 && c.x1 > 100);
});
