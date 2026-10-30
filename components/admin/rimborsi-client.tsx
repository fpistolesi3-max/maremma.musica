'use client';

import { useState, useTransition } from 'react';
import { rimborsaPagamentoAzione } from '@/app/azioni/admin';

/**
 * Pulsante "Rimborsa" di un pagamento da restituire. La conferma evita il clic per sbaglio; il doppio clic e un secondo admin non
 * possono rimborsare due volte (lo garantisce il server).
 */
export function RimborsaPagamento({ tipo, id, pagamento, persona, importo }: { tipo: 'prevendita' | 'tavolo'; id: string; pagamento: string; persona: string; importo: string }) {
  const [msg, setMsg] = useState<{ ok?: string; errore?: string }>({});
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="mm-btn mm-btn--clip mm-btn--linea" style={{ minHeight: 44 }} disabled={inCorso || Boolean(msg.ok)}
        onClick={() => { if (window.confirm(`Restituire ${importo} a ${persona}? Il rimborso parte subito sulla carta del cliente e non si può annullare.`)) avvia(async () => setMsg(await rimborsaPagamentoAzione(tipo, id, pagamento))); }}>
        {inCorso ? 'Un attimo…' : `Rimborsa ${importo}`}
      </button>
      {msg.errore && <span role="alert" className="text-[13px] text-stop-testo">{msg.errore}</span>}
      {msg.ok && <span role="status" className="text-[13px] text-ok">{msg.ok}</span>}
    </div>
  );
}
