'use client';

import { useActionState, useState, useTransition } from 'react';
import { eliminaTavoloAzione, salvaTavoloAzione, type EsitoAzione } from '@/app/azioni/admin';
import type { StatoTavolo } from '@/lib/dati/tipi';

export interface RigaTavolo {
  id: string; nome: string; zona: string; posti: number | null; spesaMinima: number;
  stato: StatoTavolo; nota: string; visibileDaPr: boolean; ordine: number;
}

const STATI: [StatoTavolo, string][] = [
  ['libero', 'Libero'], ['riservato', 'Riservato'], ['confermato', 'Confermato'], ['non_in_vendita', 'Non in vendita'],
];

/** Tavoli della serata: nome, zona, posti, spesa minima e stato. */
export function Tavoli({ eventoId, tavoli }: { eventoId: string; tavoli: RigaTavolo[] }) {
  const [msg, setMsg] = useState<EsitoAzione>({});
  const [inCorso, avvia] = useTransition();
  const zone = [...new Set(tavoli.map((t) => t.zona).filter(Boolean))];
  const prossimo = Math.max(-1, ...tavoli.map((t) => t.ordine)) + 1;
  return (
    <div className="flex flex-col gap-4">
      {msg.errore && <p role="alert" className="m-0 text-[14px] text-stop-testo">{msg.errore}</p>}
      <datalist id="tavoli-zone">{zone.map((z) => <option key={z} value={z} />)}</datalist>
      {tavoli.map((t) => (
        <div key={t.id} className="flex flex-col gap-2 border border-linea bg-notte-2 p-4">
          <FormTavolo eventoId={eventoId} t={t} />
          <div className="flex justify-end">
            <button type="button" className="mm-btn mm-btn--muto" disabled={inCorso} style={{ minHeight: 36 }}
              onClick={() => { if (confirm(`Eliminare il tavolo "${t.nome}"?`)) avvia(async () => setMsg(await eliminaTavoloAzione(t.id))); }}>Elimina</button>
          </div>
        </div>
      ))}
      <details className="border border-dashed border-linea-forte p-4" open={tavoli.length === 0 || undefined}>
        <summary className="cursor-pointer font-display text-[22px] font-extrabold uppercase">+ Aggiungi tavolo</summary>
        <div className="pt-4">
          {/* La chiave cambia dopo ogni aggiunta: il modulo torna vuoto per il tavolo successivo. */}
          <FormTavolo key={tavoli.length} eventoId={eventoId} t={{ id: '', nome: '', zona: '', posti: null, spesaMinima: 0, stato: 'libero', nota: '', visibileDaPr: true, ordine: prossimo }} />
        </div>
      </details>
    </div>
  );
}

function FormTavolo({ eventoId, t }: { eventoId: string; t: RigaTavolo }) {
  const [stato, invia, inCorso] = useActionState(salvaTavoloAzione, {} as EsitoAzione);
  const p = t.id || 'nuovo';
  return (
    <form action={invia} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px_120px_minmax(0,1fr)]">
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="ordine" value={t.ordine} />
      <Mini id={`t-${p}-nome`} nome="nome" etichetta="Nome" v={t.nome} />
      <Mini id={`t-${p}-zona`} nome="zona" etichetta="Zona" v={t.zona} lista="tavoli-zone" />
      <Mini id={`t-${p}-posti`} nome="posti" etichetta="Posti" v={t.posti == null ? '' : String(t.posti)} numerico />
      <Mini id={`t-${p}-spesa`} nome="spesaMinima" etichetta="Spesa min. €" v={String(t.spesaMinima)} numerico />
      <div className="mm-campo">
        <label className="mm-campo__etichetta" htmlFor={`t-${p}-stato`}>Stato</label>
        <select id={`t-${p}-stato`} name="stato" defaultValue={t.stato} className="mm-campo__input" style={{ height: 44, fontSize: 15 }}>
          {STATI.map(([v, testo]) => <option key={v} value={v}>{testo}</option>)}
        </select>
      </div>
      <div className="md:col-span-5"><Mini id={`t-${p}-nota`} nome="nota" etichetta="Nota (la vedi solo tu, es. a chi è riservato)" v={t.nota} /></div>
      <label className="flex items-center gap-2 text-[14px] md:col-span-3"><input type="checkbox" name="visibileDaPr" defaultChecked={t.visibileDaPr} className="h-4 w-4 accent-[var(--arancio)]" />Proponibile anche dai PR</label>
      <div className="flex items-center justify-end gap-3 md:col-span-2">
        {stato.ok && <span className="text-[13px] text-ok">{stato.ok}</span>}
        {stato.errore && <span role="alert" className="text-[13px] text-stop-testo">{stato.errore}</span>}
        <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 40 }} disabled={inCorso}>{t.id ? 'Salva tavolo' : 'Aggiungi'}</button>
      </div>
    </form>
  );
}

function Mini({ id, nome, etichetta, v, lista, numerico }: { id: string; nome: string; etichetta: string; v: string; lista?: string; numerico?: boolean }) {
  return (
    <div className="mm-campo">
      <label className="mm-campo__etichetta" htmlFor={id}>{etichetta}</label>
      <input className="mm-campo__input" style={{ height: 44, fontSize: 15 }} id={id} name={nome} type="text" defaultValue={v} list={lista} inputMode={numerico ? 'decimal' : undefined} />
    </div>
  );
}
