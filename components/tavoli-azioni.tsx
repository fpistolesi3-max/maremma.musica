'use client';

import { useState, useTransition } from 'react';
import { annullaERimborsaTavoloAzione, annullaPrenotazioneAzione } from '@/app/azioni/tavoli';
import { fraseEmailCliente } from '@/lib/avviso-email';

/**
 * Pulsanti su una prenotazione. I permessi veri sono sul server. Nessun pagamento si segna a mano: si paga sul sito.
 * `pagata` (solo admin): i soldi sono arrivati, quindi l'unica via è "Annulla e rimborsa"; "Annulla" senza rimborso resta per ciò che non è pagato.
 * `emailVere`: false se le email vere non sono attive, così la conferma non promette un'email al cliente.
 */
export function AzioniPrenotazione({ id, nome, pagata = false, emailVere }: { id: string; nome: string; pagata?: boolean; emailVere: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; errore?: string }>({});
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pagata ? (
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
          onClick={() => { if (confirm(`Annullare la prenotazione di ${nome} e restituire i soldi? Il rimborso parte subito sul pagamento online, la prenotazione si chiude come rimborsata, il tavolo torna libero e ${fraseEmailCliente(emailVere)}.`)) avvia(async () => setMsg(await annullaERimborsaTavoloAzione(id))); }}>Annulla e rimborsa</button>
      ) : (
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
          onClick={() => { if (confirm(`Annullare la prenotazione di ${nome}? Il tavolo torna libero e ${fraseEmailCliente(emailVere)}.`)) avvia(async () => setMsg(await annullaPrenotazioneAzione(id))); }}>Annulla</button>
      )}
      {msg.errore && <span role="alert" className="text-[13px] text-stop-testo">{msg.errore}</span>}
      {msg.ok && <span className="text-[13px] text-ok">{msg.ok}</span>}
    </div>
  );
}
