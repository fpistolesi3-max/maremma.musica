// Calcoli del visore delle foto (volo e scorrimento col dito). Si lancia con: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curvaVolo, esitoTrascinamento, fotogrammiVolo, rettContenuto, type Rett, type Trasf } from './volo';

const vicino = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≠ ${b}`);
const rettUguali = (a: Rett, b: Rett, msg?: string) => { vicino(a.left, b.left, msg); vicino(a.top, b.top, msg); vicino(a.width, b.width, msg); vicino(a.height, b.height, msg); };
/** Dove finisce sullo schermo un rettangolo di partenza dopo una trasformazione con origine in alto a sinistra. */
const applica = (base: Rett, t: Trasf): Rett => ({ left: base.left + t.x, top: base.top + t.y, width: base.width * t.sx, height: base.height * t.sy });
/** La foto dentro il guscio: prima la sua trasformazione (nel guscio), poi quella del guscio. */
const fotoSulloSchermo = (finale: Rett, g: Trasf, f: Trasf): Rett => ({
  left: finale.left + g.x + f.x * g.sx, top: finale.top + g.y + f.y * g.sy, width: finale.width * f.sx * g.sx, height: finale.height * f.sy * g.sy,
});

test('foto intera nello schermo: verticale e orizzontale, sempre centrata', () => {
  const telefono = { left: 0, top: 60, width: 375, height: 680 };
  rettUguali(rettContenuto(telefono, 2000, 1333), { left: 0, top: 60 + (680 - 375 * 1333 / 2000) / 2, width: 375, height: 375 * 1333 / 2000 });
  const computer = { left: 0, top: 60, width: 1280, height: 680 };
  rettUguali(rettContenuto(computer, 1333, 2000), { left: (1280 - 680 * 1333 / 2000) / 2, top: 60, width: 680 * 1333 / 2000, height: 680 });
});

test('curva del volo: parte decisa (a un quarto del tempo è già oltre metà strada) e arriva esatta', () => {
  assert.equal(curvaVolo(0), 0);
  assert.equal(curvaVolo(1), 1);
  assert.ok(curvaVolo(0.25) > 0.6);
});

test('volo: all’inizio il guscio è la cornice della miniatura e la foto è ritagliata come nella griglia, alla fine è la foto intera', () => {
  const finale = rettContenuto({ left: 0, top: 50, width: 375, height: 700 }, 2000, 1333);
  const cornice = { left: 16, top: 400, width: 167, height: 223 }; // miniatura 3:4
  const { guscio, foto } = fotogrammiVolo(cornice, cornice, finale, 10);
  assert.equal(guscio.length, 11);
  rettUguali(applica(finale, guscio[0]), cornice, 'guscio iniziale');
  // La foto copre la cornice (object-fit: cover): stessa altezza della miniatura, più larga, centrata.
  const inizio = fotoSulloSchermo(finale, guscio[0], foto[0]);
  vicino(inizio.height, cornice.height, 'altezza');
  vicino(inizio.width, cornice.height * 2000 / 1333, 'larghezza senza deformazioni');
  vicino(inizio.left + inizio.width / 2, cornice.left + cornice.width / 2, 'centro');
  rettUguali(applica(finale, guscio[10]), finale, 'guscio finale');
  rettUguali(fotoSulloSchermo(finale, guscio[10], foto[10]), finale, 'foto finale');
});

test('volo: in ogni fotogramma la foto non si deforma', () => {
  const finale = rettContenuto({ left: 0, top: 50, width: 1280, height: 690 }, 1364, 2000);
  const cornice = { left: 600, top: 300, width: 270, height: 360 };
  const copre = { left: 594.6, top: 292.8, width: 280.8, height: 374.4 }; // con l'ingrandimento del mouse (1,04)
  const { guscio, foto } = fotogrammiVolo(cornice, copre, finale);
  guscio.forEach((g, i) => {
    const r = fotoSulloSchermo(finale, g, foto[i]);
    vicino(r.width / r.height, finale.width / finale.height, `fotogramma ${i}`);
  });
});

test('trascinamento: cambia oltre un quarto o con un lancio, altrimenti torna; mai con una foto sola', () => {
  const base = { velocita: 0, larghezza: 375, quante: 10 };
  assert.equal(esitoTrascinamento({ ...base, dx: -60 }), 0, 'corto e lento: torna');
  assert.equal(esitoTrascinamento({ ...base, dx: -100 }), 1, 'oltre un quarto verso sinistra: successiva');
  assert.equal(esitoTrascinamento({ ...base, dx: 100 }), -1, 'verso destra: precedente');
  assert.equal(esitoTrascinamento({ ...base, dx: -40, velocita: -0.8 }), 1, 'lanciata: successiva');
  assert.equal(esitoTrascinamento({ ...base, dx: -40, velocita: 0.8 }), 0, 'lancio al contrario: torna');
  assert.equal(esitoTrascinamento({ ...base, dx: -20, velocita: -2 }), 0, 'lancio troppo corto: torna');
  assert.equal(esitoTrascinamento({ ...base, dx: -300, quante: 1 }), 0, 'una foto sola: torna');
});
