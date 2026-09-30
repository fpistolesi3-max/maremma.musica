'use client';

import { useActionState, useState, useTransition } from 'react';
import { eliminaLottoAzione, salvaLottoAzione, type EsitoAzione } from '@/app/azioni/admin';

export interface RigaLotto {
  id: string; nome: string; prezzo: number; quantita: number | null; usati: number;
  dataInizio: string; dataFine: string; visibileDaPr: boolean; ordine: number;
}

/** Lotti della serata: prezzo, posti, finestra di vendita, visibilità dai link PR. */
export function Lotti({ eventoId, lotti }: { eventoId: string; lotti: RigaLotto[] }) {
  const [msg, setMsg] = useState<EsitoAzione>({});
  const [inCorso, avvia] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {msg.errore && <p role="alert" className="m-0 text-[14px] text-stop-testo">{msg.errore}</p>}
      {lotti.map((l) => (
        <div key={l.id} className="flex flex-col gap-2 border border-linea bg-notte-2 p-4">
          <FormLotto eventoId={eventoId} l={l} />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-osso-2">{l.usati}{l.quantita != null ? `/${l.quantita}` : ''} ISCRITTI SU QUESTO LOTTO</span>
            <button type="button" className="mm-btn mm-btn--muto" disabled={inCorso || l.usati > 0} style={{ minHeight: 36 }}
              title={l.usati > 0 ? 'Ha già iscritti: chiudilo con una data di fine' : undefined}
              onClick={() => avvia(async () => setMsg(await eliminaLottoAzione(l.id)))}>Elimina</button>
          </div>
        </div>
      ))}
      <details className="border border-dashed border-linea-forte p-4">
        <summary className="cursor-pointer font-display text-[22px] font-extrabold uppercase">+ Aggiungi lotto</summary>
        <div className="pt-4">
          <FormLotto eventoId={eventoId} l={{ id: '', nome: '', prezzo: 0, quantita: null, usati: 0, dataInizio: '', dataFine: '', visibileDaPr: true, ordine: lotti.length }} />
        </div>
      </details>
    </div>
  );
}

function FormLotto({ eventoId, l }: { eventoId: string; l: RigaLotto }) {
  const [stato, invia, inCorso] = useActionState(salvaLottoAzione, {} as EsitoAzione);
  const p = l.id || 'nuovo';
  return (
    <form action={invia} className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_90px_90px_minmax(0,1.2fr)_minmax(0,1.2fr)]">
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="id" value={l.id} />
      <input type="hidden" name="ordine" value={l.ordine} />
      <Mini id={`${p}-nome`} nome="nome" etichetta="Nome" v={l.nome} />
      <Mini id={`${p}-prezzo`} nome="prezzo" etichetta="Prezzo €" v={String(l.prezzo)} />
      <Mini id={`${p}-q`} nome="quantita" etichetta="Posti" v={l.quantita == null ? '' : String(l.quantita)} />
      <Mini id={`${p}-da`} nome="dataInizio" etichetta="Dal" v={l.dataInizio} tipo="datetime-local" />
      <Mini id={`${p}-a`} nome="dataFine" etichetta="Fino al" v={l.dataFine} tipo="datetime-local" />
      <label className="flex items-center gap-2 text-[14px] md:col-span-3"><input type="checkbox" name="visibileDaPr" defaultChecked={l.visibileDaPr} className="h-4 w-4 accent-[var(--arancio)]" />Valido anche dai link PR</label>
      <div className="flex items-center justify-end gap-3 md:col-span-2">
        {stato.ok && <span className="text-[13px] text-ok">{stato.ok}</span>}
        {stato.errore && <span className="text-[13px] text-stop-testo">{stato.errore}</span>}
        <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 40 }} disabled={inCorso}>{l.id ? 'Salva lotto' : 'Aggiungi'}</button>
      </div>
    </form>
  );
}

function Mini({ id, nome, etichetta, v, tipo = 'text' }: { id: string; nome: string; etichetta: string; v: string; tipo?: string }) {
  return (
    <div className="mm-campo">
      <label className="mm-campo__etichetta" htmlFor={id}>{etichetta}</label>
      <input className="mm-campo__input" style={{ height: 44, fontSize: 15 }} id={id} name={nome} type={tipo} defaultValue={v} />
    </div>
  );
}
