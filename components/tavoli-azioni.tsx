'use client';

import { useState, useTransition } from 'react';
import { annullaPrenotazioneAzione, confermaPrenotazioneAzione, rimborsaPagamentoTardivoAzione } from '@/app/azioni/tavoli';
import type { MetodoTavolo } from '@/lib/dati/tipi';

const METODI: [MetodoTavolo, string][] = [['bonifico', 'Bonifico'], ['satispay', 'Satispay'], ['contanti', 'Contanti'], ['pos', 'POS / carta']];

/**
 * Pulsanti su una prenotazione. I permessi veri sono sul server.
 * `conferma` (solo admin): "Segna pagato" con il metodo, anche per riattivare una scaduta pagata in ritardo.
 * `pagata` (solo admin): la prenotazione è già pagata, quindi si annulla con o senza rimborso.
 * `annulla`: false per nascondere "Annulla" (es. su una scaduta, già chiusa).
 */
export function AzioniPrenotazione({ id, nome, conferma, pagata = false, annulla = true, testoConferma = 'Segna pagato' }: {
  id: string; nome: string; conferma: boolean; pagata?: boolean; annulla?: boolean; testoConferma?: string;
}) {
  const [msg, setMsg] = useState<{ ok?: string; errore?: string }>({});
  const [metodo, setMetodo] = useState<MetodoTavolo | ''>('');
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {conferma && (
        <>
          <label className="sr-only" htmlFor={`metodo-${id}`}>Come ha pagato</label>
          <select id={`metodo-${id}`} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoTavolo)} className="mm-campo__input w-auto" style={{ height: 44, fontSize: 15 }}>
            <option value="">Come ha pagato?</option>
            {METODI.map(([v, testo]) => <option key={v} value={v}>{testo}</option>)}
          </select>
          <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} disabled={inCorso || !metodo}
            onClick={() => { if (metodo && confirm(`Confermi di aver ricevuto il pagamento di ${nome}? Gli arriva il QR del tavolo.`)) avvia(async () => setMsg(await confermaPrenotazioneAzione(id, metodo))); }}>{testoConferma}</button>
        </>
      )}
      {pagata && (
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
          onClick={() => { if (confirm(`Hai restituito i soldi a ${nome}? La prenotazione viene chiusa come rimborsata, il tavolo torna libero e gli arriva un'email.`)) avvia(async () => setMsg(await annullaPrenotazioneAzione(id, true))); }}>Rimborsa</button>
      )}
      {annulla && (
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} disabled={inCorso}
          onClick={() => { if (confirm(pagata ? `Annullare la prenotazione pagata di ${nome} senza rimborso? Il tavolo torna libero e gli arriva un'email.` : `Annullare la prenotazione di ${nome}? Il tavolo torna libero e gli arriva un'email.`)) avvia(async () => setMsg(await annullaPrenotazioneAzione(id))); }}>{pagata ? 'Annulla senza rimborso' : 'Annulla'}</button>
      )}
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
      <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} disabled={inCorso || Boolean(msg.ok)}
        onClick={() => { if (confirm(`Restituire ${importo} a ${nome}? Il rimborso parte sul pagamento online e gli arriva un'email.`)) avvia(async () => setMsg(await rimborsaPagamentoTardivoAzione(id))); }}>Rimborsa {importo}</button>
      {msg.errore && <span role="alert" className="text-[13px] text-stop-testo">{msg.errore}</span>}
      {msg.ok && <span className="text-[13px] text-ok">{msg.ok}</span>}
    </div>
  );
}
