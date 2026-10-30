'use client';

import { useState, useTransition } from 'react';
import { annullaERimborsaTavoloAzione, annullaPrenotazioneAzione } from '@/app/azioni/tavoli';

/**
 * Pulsanti su una prenotazione. I permessi veri sono sul server. Nessun pagamento si segna a mano: si paga sul sito.
 * `pagata` (solo admin): i soldi sono arrivati, quindi l'unica via è "Annulla e rimborsa"; "Annulla" senza rimborso resta per ciò che non è pagato.
 */
export function AzioniPrenotazione({ id, nome, pagata = false }: { id: string; nome: string; pagata?: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; errore?: string }>({});
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pagata ? (
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
          onClick={() => { if (confirm(`Annullare la prenotazione di ${nome} e restituire i soldi? Il rimborso parte subito sul pagamento online, la prenotazione si chiude come rimborsata, il tavolo torna libero e al cliente arriva un'email.`)) avvia(async () => setMsg(await annullaERimborsaTavoloAzione(id))); }}>Annulla e rimborsa</button>
      ) : (
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
          onClick={() => { if (confirm(`Annullare la prenotazione di ${nome}? Il tavolo torna libero e al cliente arriva un'email.`)) avvia(async () => setMsg(await annullaPrenotazioneAzione(id))); }}>Annulla</button>
      )}
      {msg.errore && <span role="alert" className="text-[13px] text-stop-testo">{msg.errore}</span>}
      {msg.ok && <span className="text-[13px] text-ok">{msg.ok}</span>}
    </div>
  );
}
