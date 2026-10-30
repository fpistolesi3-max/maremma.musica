/**
 * Lo stile della mappa unica di "Come arrivare", scritto da zero sui tasselli vettoriali di OpenFreeMap (schema OpenMapTiles).
 * Niente rilievo ombreggiato (scelta del proprietario). Niente chiavi, niente cookie. Senza dipendenze, per i test.
 *
 * Da lontano: costa, mare, paesi e grandi strade. Da vicino: tutte le strade con il nome, edifici, parcheggi, numeri civici.
 */

const osso = (a: number) => `rgba(225,215,201,${a})`;

// Il sito di notte: terra quasi nera, mare blu notte, strade e nomi in osso.
const t = {
  terra: '#11141a', mare: '#0c2236', costa: osso(0.38), bosco: '#131b17', campi: '#15181d', abitato: '#1a1e25', edificio: '#232831', bordoEdificio: '#2e343e',
  strada: osso, involucro: '#0c0f13', traghetto: 'rgba(111,156,192,0.55)', ferrovia: osso(0.3),
  testo: '#e1d7c9', testo2: 'rgba(225,215,201,0.66)', alone: '#0b0e12', testoMare: '#6f9cc0', parcheggio: '#e1d7c9', suParcheggio: '#0c0f14',
};

/** Il colore di fondo del riquadro prima che la mappa arrivi (la terra: la mappa entra in dissolvenza). */
export const FONDO = t.terra;

export const ATTRIBUZIONI = [
  { nome: '© OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
  { nome: 'OpenMapTiles', href: 'https://openmaptiles.org/' },
  { nome: 'OpenFreeMap', href: 'https://openfreemap.org' },
];

const NOME = ['coalesce', ['get', 'name:it'], ['get', 'name:latin'], ['get', 'name']];
const REGOLARE = ['Noto Sans Regular'];
const GRASSETTO = ['Noto Sans Bold'];
const CORSIVO = ['Noto Sans Italic'];
/** Larghezza di una linea che cresce con lo zoom: coppie [zoom, px]. */
const largo = (...punti: number[]) => ['interpolate', ['exponential', 1.5], ['zoom'], ...punti];
const lineare = (...punti: number[]) => ['interpolate', ['linear'], ['zoom'], ...punti];
const classe = (...c: string[]) => ['match', ['get', 'class'], c, true, false];
const nonTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];

/** Lo stile completo per MapLibre. */
export function stileMappa() {
  const strade = (id: string, classi: string[], minzoom: number, larghezza: unknown[], colore: string, extra: Record<string, unknown> = {}) => ({
    id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom,
    filter: ['all', classe(...classi), nonTunnel],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colore, 'line-width': larghezza, ...extra },
  });

  return {
    version: 8,
    name: 'Maremma Musica · notte',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'terra', type: 'background', paint: { 'background-color': t.terra } },
      { id: 'abitato', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: classe('residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail'), paint: { 'fill-color': t.abitato, 'fill-opacity': lineare(8, 0.9, 15, 0.5) } },
      { id: 'campi', type: 'fill', source: 'omt', 'source-layer': 'landcover', minzoom: 11, filter: classe('farmland', 'grass'), paint: { 'fill-color': t.campi, 'fill-outline-color': t.abitato } },
      { id: 'bosco', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: classe('wood', 'forest'), paint: { 'fill-color': t.bosco, 'fill-opacity': 0.8 } },
      { id: 'mare', type: 'fill', source: 'omt', 'source-layer': 'water', filter: nonTunnel, paint: { 'fill-color': t.mare } },
      { id: 'costa', type: 'line', source: 'omt', 'source-layer': 'water', filter: ['all', nonTunnel, ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false]], paint: { 'line-color': t.costa, 'line-width': lineare(6, 0.5, 12, 1, 16, 1.6) } },
      { id: 'fiumi', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 9, filter: classe('river', 'canal'), paint: { 'line-color': t.mare, 'line-width': largo(9, 0.8, 14, 2.5, 18, 6) } },
      { id: 'edifici', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': t.edificio, 'fill-outline-color': t.bordoEdificio, 'fill-opacity': lineare(14, 0, 15, 1) } },

      // strade: dalla più piccola alla più grande, così le grandi passano sopra
      { ...strade('sterrate', ['track', 'path'], 13, largo(13, 0.5, 18, 2), t.strada(0.28)), paint: { 'line-color': t.strada(0.28), 'line-width': largo(13, 0.5, 18, 2), 'line-dasharray': [2, 2] } },
      strade('servizio', ['service'], 14, largo(14, 0.6, 18, 5), t.strada(0.3)),
      strade('minori', ['minor'], 11.5, largo(11.5, 0.4, 14, 1.8, 18, 10), t.strada(0.5), { 'line-opacity': lineare(11.5, 0.4, 13.5, 1) }),
      strade('terziarie-bordo', ['tertiary'], 12, largo(12, 1.5, 14, 3.2, 18, 15), t.involucro),
      strade('terziarie', ['tertiary'], 10, largo(10, 0.4, 12, 1, 14, 2, 18, 12), t.strada(0.55), { 'line-opacity': lineare(10, 0.35, 12.5, 1) }),
      strade('principali-bordo', ['primary', 'secondary'], 10, largo(10, 2, 14, 5, 18, 20), t.involucro),
      strade('principali', ['primary', 'secondary'], 7, largo(7, 0.5, 10, 0.9, 14, 3.2, 18, 16), t.strada(0.72), { 'line-opacity': lineare(8, 0.5, 11.5, 1) }),
      strade('superstrade-bordo', ['motorway', 'trunk'], 8, largo(8, 2, 12, 4, 18, 22), t.involucro),
      strade('superstrade', ['motorway', 'trunk'], 5, largo(5, 0.6, 9, 1.4, 12, 2.6, 18, 18), t.strada(0.95)),
      { id: 'ferrovia', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 9, filter: ['all', classe('rail'), nonTunnel], paint: { 'line-color': t.ferrovia, 'line-width': lineare(9, 0.6, 16, 1.6), 'line-dasharray': [3, 3] } },
      { id: 'traghetti', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 7, filter: classe('ferry'), paint: { 'line-color': t.traghetto, 'line-width': 1, 'line-dasharray': [4, 3] } },

      // ——— scritte ———
      {
        id: 'nomi-mare', type: 'symbol', source: 'omt', 'source-layer': 'water_name', filter: classe('sea', 'ocean', 'bay', 'lake'),
        layout: { 'text-field': NOME, 'text-font': CORSIVO, 'text-size': lineare(6, 11, 12, 14), 'text-letter-spacing': 0.45, 'text-transform': 'uppercase', 'text-max-width': 12, 'symbol-placement': 'point' },
        paint: { 'text-color': t.testoMare, 'text-halo-color': t.mare, 'text-halo-width': 1 },
      },
      {
        id: 'nomi-strade', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13,
        filter: classe('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'),
        layout: { 'text-field': NOME, 'text-font': REGOLARE, 'text-size': lineare(13, 10, 17, 13), 'symbol-placement': 'line', 'text-letter-spacing': 0.04, 'symbol-spacing': 350, 'text-max-angle': 30, 'text-padding': 6 },
        paint: { 'text-color': t.testo2, 'text-halo-color': t.alone, 'text-halo-width': 1.6 },
      },
      {
        id: 'sigle-strade', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 9, maxzoom: 14,
        filter: ['all', classe('motorway', 'trunk', 'primary'), ['has', 'ref']],
        layout: { 'text-field': ['get', 'ref'], 'text-font': GRASSETTO, 'text-size': 9, 'symbol-placement': 'line', 'symbol-spacing': 500, 'text-rotation-alignment': 'viewport', 'text-letter-spacing': 0.08 },
        paint: { 'text-color': t.testo2, 'text-halo-color': t.alone, 'text-halo-width': 2 },
      },
      {
        id: 'civici', type: 'symbol', source: 'omt', 'source-layer': 'housenumber', minzoom: 17,
        layout: { 'text-field': ['get', 'housenumber'], 'text-font': REGOLARE, 'text-size': 10 },
        paint: { 'text-color': t.testo2, 'text-halo-color': t.alone, 'text-halo-width': 1 },
      },
      {
        id: 'parcheggi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 14.5, filter: classe('parking'),
        layout: { 'text-field': 'P', 'text-font': GRASSETTO, 'text-size': 11, 'text-padding': lineare(14.5, 60, 17, 24) },
        paint: { 'text-color': t.suParcheggio, 'text-halo-color': t.parcheggio, 'text-halo-width': 4 },
      },
      {
        id: 'isole', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: classe('island'), minzoom: 8,
        layout: { 'text-field': NOME, 'text-font': CORSIVO, 'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.25 },
        paint: { 'text-color': t.testo2, 'text-halo-color': t.alone, 'text-halo-width': 1.4 },
      },
      {
        id: 'frazioni', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 12, filter: classe('hamlet', 'suburb', 'neighbourhood', 'isolated_dwelling', 'locality'),
        layout: { 'text-field': NOME, 'text-font': REGOLARE, 'text-size': lineare(12, 9, 16, 12), 'text-transform': 'uppercase', 'text-letter-spacing': 0.14, 'text-max-width': 8, 'text-padding': 12 },
        paint: { 'text-color': t.testo2, 'text-halo-color': t.alone, 'text-halo-width': 1.4 },
      },
      {
        id: 'paesi', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 8.5, filter: classe('village'),
        layout: { 'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.5, 'text-field': NOME, 'text-font': GRASSETTO, 'text-size': lineare(8.5, 9.5, 14, 14), 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 8 },
        paint: { 'text-color': t.testo, 'text-halo-color': t.alone, 'text-halo-width': 1.6 },
      },
      {
        id: 'citta', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 6, filter: classe('city', 'town'),
        layout: {
          'text-field': NOME, 'text-font': GRASSETTO, 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 8,
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.5,
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, ['match', ['get', 'class'], 'city', 13, 10], 12, ['match', ['get', 'class'], 'city', 20, 15], 16, ['match', ['get', 'class'], 'city', 26, 20]],
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: { 'text-color': t.testo, 'text-halo-color': t.alone, 'text-halo-width': 2 },
      },
    ],
  };
}
