'use client';

import { useActionState } from 'react';
import { duplicaSerataAzione, type EsitoAzione } from '@/app/azioni/admin';

/** Duplica serata: chiede solo la nuova data. Il resto lo copia il sito e la copia nasce in bozza. */
export function DuplicaSerata({ id, giornoProposto }: { id: string; giornoProposto: string }) {
  const [stato, invia, inCorso] = useActionState(duplicaSerataAzione, {} as EsitoAzione);
  const errore = stato.campi?.giorno;
  return (
    <form action={invia} className="flex max-w-[480px] flex-col gap-5 px-4 py-8 md:px-12">
      <input type="hidden" name="id" value={id} />
      <div className={`mm-campo ${errore ? 'mm-campo--errore' : ''}`}>
        <label className="mm-campo__etichetta" htmlFor="f-giorno">Data della nuova serata</label>
        <input className="mm-campo__input" id="f-giorno" name="giorno" type="date" defaultValue={giornoProposto} aria-invalid={Boolean(errore)} aria-describedby={errore ? 'f-giorno-a' : undefined} />
        {errore && <span className="mm-campo__aiuto" id="f-giorno-a">{errore}</span>}
      </div>
      <button type="submit" className="mm-btn mm-btn--primario" disabled={inCorso}>{inCorso ? 'Creo la copia…' : 'Crea la copia in bozza'}</button>
    </form>
  );
}
