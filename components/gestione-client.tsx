'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { copiaTesto } from './client';
import { dataPunti, parti } from '@/lib/formato';

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

/** Scelta della serata: si applica appena si sceglie. Senza JavaScript resta un modulo con il tasto "Vedi". */
export function SceltaSerata({ azione, eventi, scelto }: { azione: string; eventi: { id: string; nome: string; data: string }[]; scelto: string }) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  return (
    <form action={azione} className="flex items-end gap-2">
      <div className="mm-campo flex-grow md:w-[320px] md:flex-grow-0">
        <label className="mm-campo__etichetta" htmlFor="g-serata">Serata</label>
        <select id="g-serata" name="serata" defaultValue={scelto} className="mm-campo__input" style={{ height: 44 }} aria-busy={inCorso}
          onChange={(e) => avvia(() => router.push(`${azione}?serata=${encodeURIComponent(e.target.value)}`))}>
          <option value="tutte">Tutte le serate</option>
          {eventi.map((e) => <option key={e.id} value={e.id}>{dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)} · {e.nome}</option>)}
        </select>
      </div>
      <noscript><button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }}>Vedi</button></noscript>
    </form>
  );
}
