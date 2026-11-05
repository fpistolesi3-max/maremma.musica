'use client';

import { useState, useTransition } from 'react';

/**
 * Un clic per copiare la chiave segreta dei QR dal sito (variabile di Vercel) nel database, così i biglietti restano validi anche se la
 * variabile sparisse. Parla con POST /api/admin/allinea-segreto, che risponde solo `{ ok, allineato, motivo }`: il valore non si vede mai.
 */
export function AllineaSegreto() {
  const [inCorso, avvia] = useTransition();
  const [esito, setEsito] = useState<{ ok: boolean; motivo: string } | null>(null);
  const vai = () => {
    if (!window.confirm('Copiare la chiave segreta dei QR dal sito al database? I QR già emessi restano validi. Se è già uguale non cambia niente.')) return;
    avvia(async () => {
      try {
        const r = await fetch('/api/admin/allinea-segreto', { method: 'POST' });
        const corpo = await r.json().catch(() => null) as { ok?: boolean; motivo?: string; errore?: string } | null;
        setEsito({ ok: Boolean(r.ok && corpo?.ok), motivo: corpo?.motivo ?? corpo?.errore ?? 'Non ho avuto risposta dal sito. Riprova.' });
      } catch {
        setEsito({ ok: false, motivo: 'Non ho avuto risposta dal sito. Riprova.' });
      }
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] leading-[20px] text-osso-2">
        I QR e gli accessi si firmano con una chiave segreta che sta su Vercel. Qui la copi anche nel database: se un giorno su Vercel sparisse,
        i biglietti già emessi continuerebbero a valere. Serve una volta sola, prima delle serate vere.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={inCorso} className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} onClick={vai}>{inCorso ? 'Un attimo…' : 'Allinea la chiave dei QR'}</button>
        {esito && <span role="status" className={`text-[14px] ${esito.ok ? 'text-ok' : 'text-stop-testo'}`}>{esito.motivo}</span>}
      </div>
    </div>
  );
}
