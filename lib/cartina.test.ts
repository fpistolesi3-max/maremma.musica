import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALTEZZA, LARGHEZZA, LAT_N, LON_O, distanzeStimate, inMaremma, minutiStimati, proietta, rigaDistanze } from './cartina';
import { stileLocandina, zoomLocandina } from './mappa';

test('proiezione: gli angoli del riquadro cadono negli angoli del disegno', () => {
  assert.deepEqual(proietta(LAT_N, LON_O), { x: 0, y: 0 });
  const g = proietta(42.7604, 11.1137); // Grosseto sta al centro-destra, a metà altezza
  assert.ok(g.x > LARGHEZZA * 0.55 && g.x < LARGHEZZA * 0.65);
  assert.ok(g.y > ALTEZZA * 0.4 && g.y < ALTEZZA * 0.55);
});

test('la cartina vale solo in Maremma, con margine dal bordo', () => {
  assert.equal(inMaremma(43.1512, 10.7713), true, 'Campo Scirea, Monteverdi');
  assert.equal(inMaremma(43.0179, 10.6278), true, 'Tenuta Eleonora di Toledo, Campiglia');
  assert.equal(inMaremma(43.7696, 11.2558), false, 'Firenze');
  assert.equal(inMaremma(43.27, 10.8), false, 'troppo vicino al bordo nord');
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
