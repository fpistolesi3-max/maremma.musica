import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTANZA, misuraEtichetta, rettNome, scegliLato } from './etichetta';

const BOX = { w: 343, h: 332 };
const M = misuraEtichetta('Ricky Le Roy · Monteverdi', 'SAB 19 SETT · CAMPO G. SCIREA', false);

test('etichetta: misura entro i 290 px del CSS e mai più larga del riquadro', () => {
  assert.ok(M.w <= 290 && M.w > 150);
  assert.equal(misuraEtichetta('X'.repeat(80), 'Y', false).w, 290);
  assert.equal(misuraEtichetta('X'.repeat(80), 'Y', true).w, 360);
  assert.equal(misuraEtichetta('X'.repeat(80), 'Y', false, 276).w, 276, 'riquadro da 288 px (telefono da 320)');
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

test('nomi: rettangolo a destra, a sinistra o centrato sul punto', () => {
  const d = rettNome(100, 50, 'Grosseto');
  const s = rettNome(100, 50, 'Grosseto', { sinistra: true });
  const c = rettNome(100, 50, 'Elba', { centrato: true });
  assert.ok(d.x0 === 100 && s.x1 === 100 && d.x1 - d.x0 === s.x1 - s.x0);
  assert.ok(c.x0 < 100 && c.x1 > 100);
});

test('etichetta: a 320, 375 e 1280 px non esce mai dal riquadro finché il punto è sulla mappa', () => {
  // larghezze del riquadro della mappa: 288 (telefono da 320), 343 (375), 504 (computer da 1280); il punto è visibile se sta a 10 px dal bordo
  // (quando lo porti fuori trascinando, l'etichetta lo segue fuori)
  for (const w of [288, 343, 504]) {
    const box = { w, h: Math.round(w * 1.25) };
    const mis = misuraEtichetta('Una serata dal nome lunghissimo', 'SAB 19 SETT · TENUTA ELEONORA DI TOLEDO', w >= 560, w - 12);
    for (let x = 10; x <= w - 10; x += (w - 20) / 8) {
      for (let y = 10; y <= box.h - 10; y += (box.h - 20) / 8) {
        const p = scegliLato({ x, y }, mis, box);
        assert.equal(p.dentro, true, `w=${w} punto ${x},${y} lato ${p.lato}`);
      }
    }
  }
});
