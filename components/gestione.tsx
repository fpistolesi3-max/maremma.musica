import type { ReactNode } from 'react';
import { dataPunti, parti } from '@/lib/formato';

/** Scelta della serata (GET, funziona senza JavaScript). */
export function SceltaSerata({ azione, eventi, scelto }: { azione: string; eventi: { id: string; nome: string; data: string }[]; scelto: string }) {
  return (
    <form action={azione} className="flex items-end gap-2">
      <div className="mm-campo flex-grow md:w-[320px] md:flex-grow-0">
        <label className="mm-campo__etichetta" htmlFor="g-serata">Serata</label>
        <select id="g-serata" name="serata" defaultValue={scelto} className="mm-campo__input" style={{ height: 44 }}>
          <option value="tutte">Tutte le serate</option>
          {eventi.map((e) => <option key={e.id} value={e.id}>{dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)} · {e.nome}</option>)}
        </select>
      </div>
      <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }}>Vedi</button>
    </form>
  );
}

export function Resa({ valore }: { valore: number | null }) {
  if (valore == null) return <span className="font-mono text-[11px] text-osso-3" title="La resa si calcola quando apre la porta">—</span>;
  return (
    <div className="flex items-center gap-[10px]">
      <div className="mm-barra flex-grow" aria-label={`Resa ${valore}%`}><span style={{ width: `${valore}%` }} /></div>
      <span className="w-9 text-right font-mono text-[12px] text-osso-2">{valore}%</span>
    </div>
  );
}

export function Riquadro({ etichetta, valore, nota, colore }: { etichetta: string; valore: ReactNode; nota?: ReactNode; colore?: string }) {
  return (
    <div className="flex flex-col gap-2 border-b border-r border-linea p-4 md:p-6">
      <span className="text-[11px] font-semibold leading-[14px] tracking-etichetta text-osso-2">{etichetta.toUpperCase()}</span>
      <span className={`font-display text-[40px] font-black leading-[.85] md:text-[56px] ${colore ?? ''}`}>{valore}</span>
      <span className="font-mono text-[11px] leading-[14px] text-osso-3">{nota ?? ' '}</span>
    </div>
  );
}
