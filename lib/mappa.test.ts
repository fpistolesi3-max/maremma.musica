import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etichettaMappa, linkIndicazioni, sceltaMappa, stileNotte, usaAppleMaps } from './mappa';
import { readFileSync } from 'node:fs';
import { luogoVisibile } from './luogo';

const scirea = { lat: 43.1512, lng: 10.7713, location: 'Campo G. Scirea', comune: 'Monteverdi M.mo' };

test('mappa o segnaposto: mappa vera solo con coordinate e luogo visibile', () => {
  assert.equal(sceltaMappa(scirea, true), 'mappa');
  assert.equal(sceltaMappa({ lat: null, lng: null }, true), 'segnaposto', 'senza coordinate');
  assert.equal(sceltaMappa({ lat: 43.1, lng: null }, true), 'segnaposto', 'coordinate a metà');
  assert.equal(sceltaMappa(scirea, false), 'segnaposto', 'location segreta');
  assert.equal(sceltaMappa({ lat: Number.NaN, lng: 10 }, true), 'segnaposto');
  // zero è una coordinata valida
  assert.equal(sceltaMappa({ lat: 0, lng: 0 }, true), 'mappa');
});

test('mappa: la location segreta si svela 48 ore prima e da quel momento la mappa compare', () => {
  const e = { locationSegreta: true, data: '2026-10-31T22:00:00+01:00' };
  assert.equal(sceltaMappa(scirea, luogoVisibile(e, new Date('2026-10-28T12:00:00Z'))), 'segnaposto');
  assert.equal(sceltaMappa(scirea, luogoVisibile(e, new Date('2026-10-30T12:00:00Z'))), 'mappa');
});

test('indicazioni: Apple Maps su iPhone e iPad, Google Maps altrove', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const ipadMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
  assert.ok(usaAppleMaps(iphone));
  assert.ok(usaAppleMaps(ipadMac, 5), 'iPad che si presenta come Mac');
  assert.ok(!usaAppleMaps(ipadMac, 0), 'Mac vero');
  assert.ok(!usaAppleMaps(android));
  assert.equal(linkIndicazioni(scirea, true), 'https://maps.apple.com/?daddr=43.1512,10.7713&dirflg=d');
  assert.equal(linkIndicazioni(scirea), 'https://www.google.com/maps/dir/?api=1&destination=43.1512,10.7713');
});

test('indicazioni: senza coordinate cerca per nome, senza niente non c\'è link', () => {
  const senza = { lat: null, lng: null, location: 'Campo G. Scirea', comune: 'Monteverdi M.mo' };
  assert.equal(linkIndicazioni(senza), 'https://www.google.com/maps/dir/?api=1&destination=Campo%20G.%20Scirea%2C%20Monteverdi%20M.mo');
  assert.equal(linkIndicazioni(senza, true), 'https://maps.apple.com/?daddr=Campo%20G.%20Scirea%2C%20Monteverdi%20M.mo');
  assert.equal(linkIndicazioni({ lat: null, lng: null, location: null, comune: null }), null);
});

test('etichetta per gli screen reader', () => {
  assert.equal(etichettaMappa(scirea), 'Mappa: Campo G. Scirea, Monteverdi M.mo');
  assert.equal(etichettaMappa({ location: null, comune: 'Grosseto' }), 'Mappa: Grosseto');
  assert.equal(etichettaMappa({ location: null, comune: null }), 'Mappa del luogo della serata');
});

test('stile notte: ricolora i livelli noti e lascia in pace gli altri', () => {
  const stile = {
    version: 8,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': 'rgb(12,12,12)' } },
      { id: 'place_town', type: 'symbol', paint: { 'text-color': 'rgb(101,101,101)', 'text-halo-blur': 1 }, layout: { 'text-font': ['Noto Sans Regular'] } },
      { id: 'altro', type: 'line', paint: { 'line-color': 'red' } },
    ],
  };
  const n = stileNotte(stile);
  assert.equal(n.layers[0].paint?.['background-color'], '#0a0d11');
  assert.equal(n.layers[1].paint?.['text-halo-blur'], 1, 'tiene il resto del paint');
  assert.deepEqual(n.layers[1].layout, stile.layers[1].layout);
  assert.deepEqual(n.layers[2], stile.layers[2]);
  assert.equal(stile.layers[0].paint['background-color'], 'rgb(12,12,12)', 'non modifica l\'originale');
});

test('il worker di MapLibre in public/ è quello della versione installata', () => {
  const copia = readFileSync('public/maplibre-gl-worker.mjs');
  const originale = readFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
  assert.ok(copia.equals(originale), 'dopo un aggiornamento di maplibre-gl: cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/');
});
