'use client';

import { useState, useTransition } from 'react';
import { copiaTavoliAzione, type EsitoAzione } from '@/app/azioni/admin';

/** Riprende tavoli, posizioni e piantina da un'altra serata (stesso locale): poi si ritoccano solo i prezzi. */
export function CopiaTavoli({ eventoId, serate, haTavoli }: { eventoId: string; serate: { id: string; etichetta: string }[]; haTavoli: boolean }) {
  const [da, setDa] = useState('');
  const [msg, setMsg] = useState<EsitoAzione>({});
  const [inCorso, avvia] = useTransition();
  if (serate.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border border-dashed border-linea-forte p-4">
      <label className="mm-campo__etichetta" htmlFor="copia-tavoli">Riprendi tavoli e piantina da un&apos;altra serata</label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="copia-tavoli" value={da} onChange={(e) => setDa(e.target.value)} className="mm-campo__input min-w-0 flex-grow" style={{ height: 44, fontSize: 15, flexBasis: 220 }}>
          <option value="">Scegli la serata…</option>
          {serate.map((x) => <option key={x.id} value={x.id}>{x.etichetta}</option>)}
        </select>
        <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} disabled={!da || inCorso}
          onClick={() => avvia(async () => setMsg(await copiaTavoliAzione(eventoId, da)))}>{inCorso ? 'Copio…' : 'Copia'}</button>
      </div>
      <span className="text-[13px] text-osso-2">
        {msg.errore ? <span role="alert" className="text-stop-testo">{msg.errore}</span> : msg.ok ? <span className="text-ok">{msg.ok}</span>
          : haTavoli ? 'I tavoli con un nome già presente qui non vengono toccati. La piantina si copia solo se questa serata non ne ha una.' : 'Arrivano tutti liberi, con zona, posti, spesa minima e posizione sulla mappa.'}
      </span>
    </div>
  );
}
