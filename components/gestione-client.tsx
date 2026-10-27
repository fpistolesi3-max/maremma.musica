'use client';

import { useState, useTransition } from 'react';
import { copiaTesto } from './client';

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
