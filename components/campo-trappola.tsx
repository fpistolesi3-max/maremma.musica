import { CAMPO_TRAPPOLA } from '@/lib/trappola';

/** Campo trappola per i programmi automatici (lib/trappola.ts): fuori schermo, non raggiungibile da tastiera né letto ad alta voce. */
export function CampoTrappola() {
  return <input type="text" name={CAMPO_TRAPPOLA} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />;
}
