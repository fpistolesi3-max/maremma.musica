import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pennello } from './pennello';

test('pennello: il rumore di Perlin dà gli stessi numeri di p5.js (stessi blob dell\'intro)', () => {
  const canvasFinto = { getContext: () => ({}) } as unknown as HTMLCanvasElement;
  const p = new Pennello(canvasFinto);
  p.noiseSeed(7);
  // valori di riferimento calcolati con p5.js 2.3.4: noiseSeed(7), poi noise(x, y, z)
  const riferimento: [number, number, number, number][] = [
    [1.9, 1, 0, 0.5176390205134515],
    [0.1, 1.9, 0.8, 0.20100587013924903],
    [11.9, 11.2, 1.6, 0.6706229370173871],
    [31.4, 30.7, 2.24, 0.45564841415119783],
    [2, 1.2, 0, 0.4533435669390421],
    [7.3, 0.35, 0, 0.28002179904710456],
  ];
  for (const [x, y, z, atteso] of riferimento) assert.equal(p.noise(x, y, z), atteso, `noise(${x}, ${y}, ${z})`);
});
