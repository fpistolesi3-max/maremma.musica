// Disegna la cartina illustrata della Maremma e la salva in public/img/cartina-maremma.svg.
// Si lancia a mano, una volta sola (o se cambia il riquadro in lib/cartina.ts):
//   node scripts/cartina-maremma.mjs
//
// Dati usati (liberi, scaricati al momento e non copiati nel repo):
// - Costa e isole: OpenStreetMap (natural=coastline) via Overpass — © contributori di OpenStreetMap, licenza ODbL
//   (https://www.openstreetmap.org/copyright). Va citato: lo fa la didascalia della cartina.
// - Rilievo (curve di livello): tessere "Terrarium" di Mapzen/AWS Open Data, che derivano da SRTM e altri dataset aperti
//   (https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Servono solo qui, non al sito.
// Servono i pacchetti di sviluppo d3-contour e pngjs.
import { writeFileSync } from 'node:fs';
import { contours } from 'd3-contour';
import { PNG } from 'pngjs';
import { ALTEZZA, LARGHEZZA, LAT_N, LAT_S, LON_E, LON_O, proietta } from '../lib/cartina.ts';

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const URL_TESSERE = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const ZOOM = 9;
const LIVELLI = [250, 500, 800, 1100, 1400];
const BORDO = 30; // il ritaglio sbordando dal disegno: i suoi lati restano fuori vista e non si vede nessun tratto finto
const TERRAFERMA = [43.15, 10.77]; // un punto che sta di sicuro sulla terraferma (serve a scegliere da che parte chiudere la costa)

const num = (n) => String(Math.round(n * 10) / 10);
const percorso = (anello) => 'M' + anello.map((p) => `${num(p.x)} ${num(p.y)}`).join('L') + 'Z';

// ——— Costa ———
async function overpass(query) {
  for (let giro = 0; giro < 3; giro++) {
    for (const url of OVERPASS) {
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'maremma-musica-cartina/1.0' } });
        if (r.ok) return await r.json();
      } catch { /* prova il prossimo */ }
    }
    await new Promise((ok) => setTimeout(ok, 5000));
  }
  throw new Error('Overpass non risponde');
}
const dati = await overpass(`[out:json][timeout:90];way["natural"="coastline"](${LAT_S - 0.3},${LON_O - 0.3},${LAT_N + 0.3},${LON_E + 0.3});out geom;`);

// Le coste OSM sono tanti pezzi con la terra a sinistra: si incollano per estremi.
const pezzi = dati.elements.map((w) => w.geometry.map((g) => proietta(g.lat, g.lon)));
const chiave = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
const catene = [];
{
  const perInizio = new Map();
  pezzi.forEach((p, i) => perInizio.set(chiave(p[0]), [...(perInizio.get(chiave(p[0])) ?? []), i]));
  const usato = new Set();
  const haPrecedente = new Set(pezzi.map((p) => chiave(p.at(-1))));
  const ordine = [...pezzi.keys()].sort((a, b) => Number(haPrecedente.has(chiave(pezzi[a][0]))) - Number(haPrecedente.has(chiave(pezzi[b][0]))));
  for (const i of ordine) {
    if (usato.has(i)) continue;
    let catena = [...pezzi[i]];
    usato.add(i);
    for (;;) {
      const prossimo = (perInizio.get(chiave(catena.at(-1))) ?? []).find((j) => !usato.has(j));
      if (prossimo === undefined) break;
      usato.add(prossimo);
      catena.push(...pezzi[prossimo].slice(1));
    }
    catene.push(catena);
  }
}

const dentro = (p) => p.x >= -BORDO && p.x <= LARGHEZZA + BORDO && p.y >= -BORDO && p.y <= ALTEZZA + BORDO;
/** Punto dove il segmento a→b attraversa il bordo del disegno (a fuori, b dentro o viceversa). */
function incrocio(a, b) {
  let t = 1;
  const lati = [[-BORDO, 'x'], [LARGHEZZA + BORDO, 'x'], [-BORDO, 'y'], [ALTEZZA + BORDO, 'y']];
  for (const [v, asse] of lati) {
    if ((a[asse] - v) * (b[asse] - v) < 0) t = Math.min(t, (v - a[asse]) / (b[asse] - a[asse]));
  }
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
/** Posizione lungo il perimetro del rettangolo (in senso orario, partendo dall'angolo in alto a sinistra). */
function lungoBordo(p) {
  const x0 = -BORDO, x1 = LARGHEZZA + BORDO, y0 = -BORDO, y1 = ALTEZZA + BORDO, w = x1 - x0, h = y1 - y0;
  const e = 0.01;
  if (Math.abs(p.y - y0) < e) return p.x - x0;
  if (Math.abs(p.x - x1) < e) return w + (p.y - y0);
  if (Math.abs(p.y - y1) < e) return w + h + (x1 - p.x);
  return 2 * w + h + (y1 - p.y);
}
const angoli = (da, a, senso) => { // angoli del rettangolo incontrati andando da `da` ad `a` lungo il perimetro
  const x0 = -BORDO, x1 = LARGHEZZA + BORDO, y0 = -BORDO, y1 = ALTEZZA + BORDO, w = x1 - x0, h = y1 - y0;
  const tutti = [[0, { x: x0, y: y0 }], [w, { x: x1, y: y0 }], [w + h, { x: x1, y: y1 }], [2 * w + h, { x: x0, y: y1 }]];
  const per = 2 * (w + h);
  const out = [];
  let pos = da;
  for (let guardia = 0; guardia < 5; guardia++) {
    const dist = senso > 0 ? (a - pos + per) % per : (pos - a + per) % per;
    const prossimo = tutti
      .map(([s, p]) => ({ s, p, d: senso > 0 ? (s - pos + per) % per : (pos - s + per) % per }))
      .filter((c) => c.d > 1e-6 && c.d < dist)
      .sort((u, v) => u.d - v.d)[0];
    if (!prossimo) break;
    out.push(prossimo.p);
    pos = prossimo.s;
  }
  return out;
};
function dentroPoligono(p, poli) {
  let r = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    if ((poli[i].y > p.y) !== (poli[j].y > p.y) && p.x < ((poli[j].x - poli[i].x) * (p.y - poli[i].y)) / (poli[j].y - poli[i].y) + poli[i].x) r = !r;
  }
  return r;
}

/** Douglas–Peucker: toglie i punti che spostano la linea meno di `tol` unità del disegno. */
function semplifica(pt, tol) {
  if (pt.length < 3) return pt;
  const tieni = new Uint8Array(pt.length);
  tieni[0] = tieni[pt.length - 1] = 1;
  const pila = [[0, pt.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop();
    let max = 0, k = -1;
    const a = pt[i], b = pt[j];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    for (let n = i + 1; n < j; n++) {
      const d = Math.abs(dy * pt[n].x - dx * pt[n].y + b.x * a.y - b.y * a.x) / len;
      if (d > max) { max = d; k = n; }
    }
    if (max > tol && k > 0) { tieni[k] = 1; pila.push([i, k], [k, j]); }
  }
  return pt.filter((_, n) => tieni[n]);
}

/** Come semplifica, ma per un anello chiuso (primo punto = ultimo): si semplificano le due metà. */
function semplificaAnello(pt, tol) {
  const p = pt.slice(0, -1);
  const k = Math.floor(p.length / 2);
  return [...semplifica(p.slice(0, k + 1), tol).slice(0, -1), ...semplifica([...p.slice(k), p[0]], tol).slice(0, -1)];
}
const area = (s) => Math.abs(s.reduce((t, p, k) => t + (p.x * s[(k + 1) % s.length].y - s[(k + 1) % s.length].x * p.y), 0)) / 2;

const punto = proietta(...TERRAFERMA);
let terra = '';
let anelli = 0;
for (const catena of catene) {
  const chiusa = chiave(catena[0]) === chiave(catena.at(-1));
  if (chiusa) { // isola: basta tenerla se tocca il disegno
    if (catena.some(dentro)) { const a = semplificaAnello(catena, 0.45); if (a.length >= 3 && area(a) > 3) { terra += percorso(a); anelli++; } }
    continue;
  }
  // Costa aperta (la terraferma): si tiene il tratto dentro il disegno e si chiude lungo il bordo, dalla parte della terra.
  let tratto = [];
  for (let i = 0; i < catena.length; i++) {
    const p = catena[i];
    if (dentro(p)) {
      if (!tratto.length && i > 0) tratto.push(incrocio(catena[i - 1], p));
      tratto.push(p);
    } else if (tratto.length) {
      tratto.push(incrocio(catena[i - 1], p));
      break;
    }
  }
  if (tratto.length < 3) continue;
  tratto = semplifica(tratto, 0.45);
  for (const senso of [1, -1]) {
    const a = lungoBordo(tratto.at(-1)), b = lungoBordo(tratto[0]);
    const poli = [...tratto, ...angoli(a, b, senso)];
    if (dentroPoligono(punto, poli)) { terra += percorso(poli); anelli++; break; }
  }
}
if (!anelli) throw new Error('nessuna costa trovata');

// ——— Rilievo ———
const n = 2 ** ZOOM;
const tx = (lng) => ((lng + 180) / 360) * n;
const ty = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
const lng0 = (x) => (x / n) * 360 - 180;
const lat0 = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
const xa = Math.floor(tx(LON_O)), xb = Math.floor(tx(LON_E));
const ya = Math.floor(ty(LAT_N)), yb = Math.floor(ty(LAT_S));
const W = (xb - xa + 1) * 256, H = (yb - ya + 1) * 256;
const quota = new Float32Array(W * H);
for (let x = xa; x <= xb; x++) {
  for (let y = ya; y <= yb; y++) {
    const r = await fetch(URL_TESSERE(ZOOM, x, y));
    if (!r.ok) throw new Error(`tessera ${x}/${y}: ${r.status}`);
    const png = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
      const o = (j * 256 + i) * 4;
      quota[((y - ya) * 256 + j) * W + (x - xa) * 256 + i] = Math.max(0, png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768);
    }
  }
}
// un po' di sfocatura toglie il rumore dei dati e rende le curve morbide
function sfuma(src, volte) {
  let a = src;
  for (let v = 0; v < volte; v++) {
    const b = new Float32Array(a.length);
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      b[k] = (a[k] * 4 + a[k - 1] * 2 + a[k + 1] * 2 + a[k - W] * 2 + a[k + W] * 2 + a[k - W - 1] + a[k - W + 1] + a[k + W - 1] + a[k + W + 1]) / 16;
    }
    a = b;
  }
  return a;
}
const liscia = sfuma(quota, 2);
const px = (i, j) => proietta(lat0(ya + j / 256), lng0(xa + i / 256)); // pixel della griglia → punto del disegno
let fasce = '';
for (const c of contours().size([W, H]).thresholds(LIVELLI)(liscia)) {
  let d = '';
  for (const poli of c.coordinates) for (const anello of poli) {
    const s = semplificaAnello(anello.map(([i, j]) => px(i, j)), 1.1);
    if (s.length >= 4 && area(s) > 60) d += percorso(s);
  }
  if (d) fasce += `<path d="${d}"/>`;
}

// ——— Disegno ———
const griglia = [];
for (let lat = Math.ceil(LAT_S * 4) / 4; lat < LAT_N; lat += 0.25) griglia.push(`M0 ${num(proietta(lat, LON_O).y)}H${LARGHEZZA}`);
for (let lng = Math.ceil(LON_O * 4) / 4; lng < LON_E; lng += 0.25) griglia.push(`M${num(proietta(LAT_N, lng).x)} 0V${ALTEZZA}`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGHEZZA} ${ALTEZZA}" width="${LARGHEZZA}" height="${ALTEZZA}">
<title>Cartina della Maremma</title>
<desc>Costa: © contributori di OpenStreetMap (ODbL). Rilievo: tessere Terrarium (Mapzen, da SRTM e altri dati aperti). Disegno: Maremma Musica.</desc>
<rect width="${LARGHEZZA}" height="${ALTEZZA}" fill="#0b1824"/>
<path d="${griglia.join('')}" stroke="#7d9bb5" stroke-opacity=".09" stroke-width="1" stroke-dasharray="2 7" fill="none"/>
<defs><path id="t" d="${terra}"/></defs>
<g fill="none" stroke="#7d9bb5" stroke-linejoin="round"><use href="#t" stroke-width="34" stroke-opacity=".05"/><use href="#t" stroke-width="22" stroke-opacity=".06"/><use href="#t" stroke-width="11" stroke-opacity=".09"/></g>
<use href="#t" fill="#171d24"/>
<g fill="#e1d7c9" fill-opacity=".06" fill-rule="evenodd" stroke="#e1d7c9" stroke-opacity=".2" stroke-width=".8" stroke-linejoin="round">${fasce}</g>
<use href="#t" fill="none" stroke="#e1d7c9" stroke-opacity=".85" stroke-width="1.6" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(new URL('../public/img/cartina-maremma.svg', import.meta.url), svg);
console.log(`cartina-maremma.svg: ${(svg.length / 1024).toFixed(1)} KB (costa ${(terra.length / 1024).toFixed(1)} KB, ${anelli} anelli, rilievo ${(fasce.length / 1024).toFixed(1)} KB, quota max ${liscia.reduce((m, v) => Math.max(m, v), 0).toFixed(0)} m)`);
