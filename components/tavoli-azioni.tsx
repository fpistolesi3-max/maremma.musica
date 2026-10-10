'use client';

import { useState, useTransition } from 'react';
import { annullaPrenotazioneAzione, confermaPrenotazioneAzione } from '@/app/azioni/tavoli';

/** Pulsanti su una prenotazione: "Pagato" (solo admin) e "Annulla". I permessi veri sono sul server. */
export function AzioniPrenotazione({ id, nome, conferma }: { id: string; nome: string; conferma: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; errore?: string }>({});
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {conferma && (
        <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 36 }} disabled={inCorso}
          onClick={() => { if (confirm(`Confermi di aver ricevuto il pagamento di ${nome}? Gli arriva il QR del tavolo.`)) avvia(async () => setMsg(await confermaPrenotazioneAzione(id))); }}>Segna pagato</button>
      )}
      <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 36 }} disabled={inCorso}
        onClick={() => { if (confirm(`Annullare la prenotazione di ${nome}? Il tavolo torna libero.`)) avvia(async () => setMsg(await annullaPrenotazioneAzione(id))); }}>Annulla</button>
      {msg.errore && <span role="alert" className="text-[13px] text-stop-testo">{msg.errore}</span>}
      {msg.ok && <span className="text-[13px] text-ok">{msg.ok}</span>}
    </div>
  );
}
