import { mock } from 'node:test';

/** Orologio fisso per i test che usano il seed: 20.10.2026 12:00 a Roma, 11 giorni prima della serata d'esempio. */
export const ADESSO_TEST = new Date('2026-10-20T12:00:00+02:00');

export function fissaOrologio(adesso = ADESSO_TEST) {
  mock.timers.enable({ apis: ['Date'], now: adesso });
}
