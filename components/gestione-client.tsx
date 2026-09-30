'use client';

import { useState, useTransition } from 'react';
import { annullaConsegnaAzione, confermaConsegnaAzione } from '@/app/azioni/gestione';
import { copiaTesto } from './client';

const euro = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)} €`;

/**
 * "Ricevuti": chi ha in mano i soldi del PR conferma la consegna. La cifra mostrata è quella che
 * il server ricontrolla: se nel frattempo è cambiata, la conferma si ferma.
 */
export function ConfermaConsegna({ prId, prNome, eventoId, serata, importo, compatto }: {
  prId: string; prNome: string; eventoId: string | null; serata: string; importo: number; compatto?: boolean;
}) {
  const [inCorso, avvia] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; errore?: string } | null>(null);
  if (importo <= 0) return compatto ? null : <span className="font-mono text-[11px] text-osso-3">NIENTE DA RITIRARE</span>;
  return (
    <span className="flex flex-col items-stretch gap-1 md:items-end">
      <button type="button" disabled={inCorso} className={`mm-btn ${compatto ? 'mm-btn--linea' : 'mm-btn--primario'}`}
        style={compatto ? { minHeight: 36, padding: '0 12px', fontSize: 12 } : { minHeight: 48 }}
        onClick={() => {
          if (!window.confirm(`Confermi di aver ricevuto ${euro(importo)} da ${prNome}${eventoId ? ` per ${serata}` : ' (tutte le serate)'}?\n\nResterà registrato a tuo nome.`)) return;
          avvia(async () => setMsg(await confermaConsegnaAzione(prId, eventoId, importo)));
        }}>
        {inCorso ? 'Un attimo…' : `Ricevuti ${euro(importo)}`}
      </button>
      {msg && <span role="status" className={`text-[12px] ${msg.errore ? 'text-stop-testo' : 'text-ok'}`}>{msg.errore ?? msg.ok}</span>}
    </span>
  );
}

export function AnnullaConsegna({ id }: { id: string }) {
  const [inCorso, avvia] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 32, fontSize: 12 }}
        onClick={() => { if (window.confirm('Annullare questa consegna? Quei soldi torneranno "da ritirare".')) avvia(async () => { const r = await annullaConsegnaAzione(id); setErrore(r.errore ?? null); }); }}>
        Annulla
      </button>
      {errore && <span className="text-[12px] text-stop-testo">{errore}</span>}
    </span>
  );
}

/** Link etichettato da usare su un social: chi lo apre viene contato su quel canale. */
export function LinkCanale({ etichetta, percorso }: { etichetta: string; percorso: string }) {
  const [copiato, setCopiato] = useState(false);
  return (
    <div className="flex items-center gap-3 border-t border-linea py-3">
      <span className="w-[120px] flex-none font-display text-[18px] font-extrabold uppercase leading-none">{etichetta}</span>
      <span className="min-w-0 flex-grow truncate font-mono text-[12px] text-osso-2" suppressHydrationWarning>{percorso}</span>
      <button type="button" className="mm-btn mm-btn--linea flex-none" style={{ minHeight: 36, padding: '0 12px', fontSize: 12 }}
        onClick={async () => { if (await copiaTesto(`${window.location.origin}${percorso}`)) { setCopiato(true); setTimeout(() => setCopiato(false), 1600); } }}>
        {copiato ? 'Copiato' : 'Copia'}
      </button>
    </div>
  );
}
