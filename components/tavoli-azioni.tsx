'use client';

import { useState, useTransition } from 'react';
import { annullaPrenotazioneAzione, rimborsaPagamentoTardivoAzione } from '@/app/azioni/tavoli';

/**
 * Pulsanti su una prenotazione. I permessi veri sono sul server. Nessun pagamento si segna a mano: si paga sul sito.
 * `pagata` (solo admin): la prenotazione è già pagata, quindi si annulla con o senza rimborso.
 */
export function AzioniPrenotazione({ id, nome, pagata = false }: { id: string; nome: string; pagata?: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; errore?: string }>({});
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pagata && (
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
          onClick={() => { if (confirm(`Restituire i soldi a ${nome}? Il rimborso parte sul pagamento online, la prenotazione si chiude come rimborsata, il tavolo torna libero e al cliente arriva un'email.`)) avvia(async () => setMsg(await annullaPrenotazioneAzione(id, true))); }}>Rimborsa</button>
      )}
      <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
        onClick={() => { if (confirm(pagata ? `Annullare la prenotazione pagata di ${nome} senza rimborso? Il tavolo torna libero e al cliente arriva un'email.` : `Annullare la prenotazione di ${nome}? Il tavolo torna libero e al cliente arriva un'email.`)) avvia(async () => setMsg(await annullaPrenotazioneAzione(id))); }}>{pagata ? 'Annulla senza rimborso' : 'Annulla'}</button>
      {msg.errore && <span role="alert" className="text-[13px] text-stop-testo">{msg.errore}</span>}
      {msg.ok && <span className="text-[13px] text-ok">{msg.ok}</span>}
    </div>
  );
}

/** Pagamento online arrivato a prenotazione chiusa: restituisce i soldi e chiude come rimborsata. */
export function RimborsaTardivo({ id, nome, importo }: { id: string; nome: string; importo: string }) {
  const [msg, setMsg] = useState<{ ok?: string; errore?: string }>({});
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="mm-btn mm-btn--clip mm-btn--linea" style={{ minHeight: 44 }} disabled={inCorso || Boolean(msg.ok)}
        onClick={() => { if (confirm(`Restituire ${importo} a ${nome}? Il rimborso parte sul pagamento online e al cliente arriva un'email.`)) avvia(async () => setMsg(await rimborsaPagamentoTardivoAzione(id))); }}>Rimborsa {importo}</button>
      {msg.errore && <span role="alert" className="text-[13px] text-stop-testo">{msg.errore}</span>}
      {msg.ok && <span className="text-[13px] text-ok">{msg.ok}</span>}
    </div>
  );
}
