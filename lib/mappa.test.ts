import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etichettaMappa, linkIndicazioni, linkNavigatori, sceltaMappa, usaAppleMaps, zoomZona } from './mappa';
import { luogoVisibile } from './luogo';
import { ATTRIBUZIONI, stileMappa } from './stile-mappa';

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

const eleonora = { lat: 43.0179, lng: 10.6278, location: 'Tenuta Eleonora di Toledo', comune: 'Campiglia M.ma' };

test('navigatori: con le coordinate Google Maps, Apple Maps e Waze portano al punto esatto', () => {
  const n = linkNavigatori(eleonora);
  assert.deepEqual(n.map((x) => x.app), ['google', 'apple', 'waze']);
  assert.equal(n[0].href, 'https://www.google.com/maps/dir/?api=1&destination=43.0179,10.6278');
  assert.equal(n[1].href, 'https://maps.apple.com/?daddr=43.0179,10.6278&dirflg=d');
  assert.equal(n[2].href, 'https://waze.com/ul?ll=43.0179,10.6278&navigate=yes');
  assert.deepEqual(n.map((x) => x.nome), ['Google Maps', 'Apple Maps', 'Waze']);
});

test('navigatori: senza coordinate cercano il luogo per nome', () => {
  const n = linkNavigatori({ ...eleonora, lat: null, lng: null });
  const nome = 'Tenuta%20Eleonora%20di%20Toledo%2C%20Campiglia%20M.ma';
  assert.equal(n[0].href, `https://www.google.com/maps/dir/?api=1&destination=${nome}`);
  assert.equal(n[1].href, `https://maps.apple.com/?daddr=${nome}`);
  assert.equal(n[2].href, `https://waze.com/ul?q=${nome}&navigate=yes`);
  assert.deepEqual(linkNavigatori({ lat: null, lng: null, location: null, comune: null }), [], 'niente da cercare, niente pulsanti');
});

test('navigatori: con la location segreta nessun pulsante', () => {
  assert.deepEqual(linkNavigatori(eleonora, false, false), []);
  assert.deepEqual(linkNavigatori(eleonora, true, false), []);
});

test('navigatori: su iPhone e iPad Apple Maps viene per primo', () => {
  assert.deepEqual(linkNavigatori(eleonora, true).map((x) => x.app), ['apple', 'google', 'waze']);
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  assert.equal(linkNavigatori(scirea, usaAppleMaps(iphone))[0].app, 'apple');
});

test('zoom iniziale: la stessa distanza attorno al pin su telefono e computer, in Maremma e a Milano', () => {
  const metri = (larghezza: number, lat: number) => (larghezza * 156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoomZona(larghezza, lat) + 1);
  for (const [w, lat] of [[343, 43.0179], [504, 43.0179], [343, 45.4441], [504, 45.4441]]) {
    assert.ok(Math.abs(metri(w, lat) - 34_000) < 1, `${w} px a ${lat}`);
  }
  assert.ok(zoomZona(504, 43) > zoomZona(343, 43), 'riquadro più largo, zoom più vicino');
});

test('stile della mappa: solo OpenFreeMap, senza rilievo né chiavi, con le attribuzioni', () => {
  const s = stileMappa();
  const indirizzi = JSON.stringify([s.glyphs, s.sources]);
  for (const u of indirizzi.match(/https:\/\/[^"/]+/g) ?? []) assert.equal(u, 'https://tiles.openfreemap.org', u);
  assert.ok(!/key=|token=/i.test(indirizzi), 'nessuna chiave');
  assert.deepEqual(ATTRIBUZIONI.map((a) => a.nome), ['© OpenStreetMap', 'OpenMapTiles', 'OpenFreeMap']);
  const id = s.layers.map((l) => l.id);
  assert.equal(new Set(id).size, id.length, 'livelli con nomi unici');
  for (const l of ['mare', 'nomi-strade', 'parcheggi', 'citta']) assert.ok(id.includes(l), l);
  assert.ok(!s.layers.some((l) => l.type === 'hillshade'), 'niente rilievo ombreggiato');
  assert.ok(!s.layers.some((l) => (l as { 'source-layer'?: string })['source-layer'] === 'mountain_peak'), 'niente etichette delle cime');
});
