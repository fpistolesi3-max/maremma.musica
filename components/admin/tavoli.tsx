'use client';

import { useActionState, useState, useTransition } from 'react';
import { eliminaTavoloAzione, salvaTavoloAzione, type EsitoAzione } from '@/app/azioni/admin';
import type { StatoPrenotazione, StatoTavolo } from '@/lib/dati/tipi';
import { AzioniPrenotazione } from '@/components/tavoli-azioni';

export interface PrenotazioneRiga {
  id: string; nome: string; email: string; telefono: string; persone: number; spesaMinima: number;
  stato: StatoPrenotazione; lista: string; scade: string; inseritaDa: 'cliente' | 'pr';
}

export interface RigaTavolo {
  id: string; nome: string; zona: string; posti: number | null; spesaMinima: number;
  stato: StatoTavolo; nota: string; visibileDaPr: boolean; prAbilitati: string[] | null; ordine: number;
  prenotazione: PrenotazioneRiga | null;   // quella attiva, se c'è: decide lei lo stato del tavolo
}

const STATI: [StatoTavolo, string][] = [
  ['libero', 'Libero'], ['riservato', 'Riservato'], ['confermato', 'Confermato'], ['non_in_vendita', 'Non in vendita'],
];

/** Tavoli della serata: nome, zona, posti, spesa minima, stato, a quali PR sono affidati e chi li ha chiesti. */
export function Tavoli({ eventoId, tavoli, pr }: { eventoId: string; tavoli: RigaTavolo[]; pr: { id: string; nome: string }[] }) {
  const [msg, setMsg] = useState<EsitoAzione>({});
  const [inCorso, avvia] = useTransition();
  const zone = [...new Set(tavoli.map((t) => t.zona).filter(Boolean))];
  const prossimo = Math.max(-1, ...tavoli.map((t) => t.ordine)) + 1;
  return (
    <div className="flex flex-col gap-4">
      {msg.errore && <p role="alert" className="m-0 text-[14px] text-stop-testo">{msg.errore}</p>}
      <datalist id="tavoli-zone">{zone.map((z) => <option key={z} value={z} />)}</datalist>
      {tavoli.map((t) => (
        <div key={t.id} className="flex flex-col gap-3 border border-linea bg-notte-2 p-4">
          {t.prenotazione && <Prenotazione p={t.prenotazione} />}
          <FormTavolo eventoId={eventoId} t={t} pr={pr} />
          <div className="flex justify-end">
            <button type="button" className="mm-btn mm-btn--muto" disabled={inCorso || Boolean(t.prenotazione)} style={{ minHeight: 36 }}
              title={t.prenotazione ? 'Ha una prenotazione: annullala prima di eliminarlo' : undefined}
              onClick={() => { if (confirm(`Eliminare il tavolo "${t.nome}"?`)) avvia(async () => setMsg(await eliminaTavoloAzione(t.id))); }}>Elimina</button>
          </div>
        </div>
      ))}
      <details className="border border-dashed border-linea-forte p-4" open={tavoli.length === 0 || undefined}>
        <summary className="cursor-pointer font-display text-[22px] font-extrabold uppercase">+ Aggiungi tavolo</summary>
        <div className="pt-4">
          {/* La chiave cambia dopo ogni aggiunta: il modulo torna vuoto per il tavolo successivo. */}
          <FormTavolo key={tavoli.length} eventoId={eventoId} pr={pr}
            t={{ id: '', nome: '', zona: '', posti: null, spesaMinima: 0, stato: 'libero', nota: '', visibileDaPr: true, prAbilitati: null, ordine: prossimo, prenotazione: null }} />
        </div>
      </details>
    </div>
  );
}

function Prenotazione({ p }: { p: PrenotazioneRiga }) {
  const attesa = p.stato === 'in_attesa';
  return (
    <div className={`flex flex-col gap-3 border-l-2 bg-notte px-4 py-3 ${attesa ? 'border-attesa' : 'border-ok'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`mm-chip ${attesa ? 'mm-chip--incassare' : 'mm-chip--entrato'}`}>{attesa ? 'In attesa di pagamento' : 'Pagato'}</span>
        <span className="font-display text-[22px] font-extrabold uppercase leading-none">{p.nome}</span>
        <span className="font-mono text-[12px] text-osso-2">{p.persone} PERSONE · {p.spesaMinima.toLocaleString('it-IT')} €</span>
      </div>
      <span className="font-mono text-[12px] leading-5 text-osso-2">
        <a href={`tel:${p.telefono.replace(/[^\d+]/g, '')}`} className="text-osso">{p.telefono}</a> · <a href={`mailto:${p.email}`} className="text-osso">{p.email}</a>
        <br />LISTA: {p.lista.toUpperCase()}{p.inseritaDa === 'pr' ? ' · INSERITA DAL PR' : ''}{attesa ? ` · DECADE ${p.scade.toUpperCase()}` : ''}
      </span>
      <AzioniPrenotazione id={p.id} nome={p.nome} conferma={attesa} />
    </div>
  );
}

function FormTavolo({ eventoId, t, pr }: { eventoId: string; t: RigaTavolo; pr: { id: string; nome: string }[] }) {
  const [stato, invia, inCorso] = useActionState(salvaTavoloAzione, {} as EsitoAzione);
  const [chi, setChi] = useState<'tutti' | 'alcuni' | 'nessuno'>(!t.visibileDaPr ? 'nessuno' : t.prAbilitati ? 'alcuni' : 'tutti');
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
        {/* Con una prenotazione attiva lo stato lo decide lei (in attesa → riservato, pagata → confermato). */}
        <select id={`t-${p}-stato`} name="stato" defaultValue={t.stato} disabled={Boolean(t.prenotazione)} className="mm-campo__input" style={{ height: 44, fontSize: 15 }}>
          {STATI.map(([v, testo]) => <option key={v} value={v}>{testo}</option>)}
        </select>
      </div>
      <div className="md:col-span-5"><Mini id={`t-${p}-nota`} nome="nota" etichetta="Nota (la vedi solo tu, es. a chi è riservato)" v={t.nota} /></div>
      <div className="mm-campo md:col-span-2">
        <label className="mm-campo__etichetta" htmlFor={`t-${p}-chi`}>Affidato ai PR</label>
        <select id={`t-${p}-chi`} name="prChi" value={chi} onChange={(e) => setChi(e.target.value as typeof chi)} className="mm-campo__input" style={{ height: 44, fontSize: 15 }}>
          <option value="tutti">Tutti i PR</option>
          <option value="alcuni">Solo alcuni PR</option>
          <option value="nessuno">Nessun PR</option>
        </select>
      </div>
      {chi === 'alcuni' && (
        <div className="flex flex-wrap content-end gap-x-4 gap-y-2 md:col-span-3">
          {pr.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="prAbilitati" value={x.id} defaultChecked={t.prAbilitati?.includes(x.id)} className="h-4 w-4 accent-[var(--arancio)]" />{x.nome}
            </label>
          ))}
          {pr.length === 0 && <span className="text-[14px] text-osso-2">Non ci sono PR.</span>}
        </div>
      )}
      <div className="flex items-center justify-end gap-3 md:col-span-5">
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
