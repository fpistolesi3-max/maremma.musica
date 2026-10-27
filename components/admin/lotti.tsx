'use client';

import { useActionState, useState, useTransition } from 'react';
import { copiaTipiAzione, eliminaLottoAzione, modelloTipiAzione, salvaLottoAzione, type EsitoAzione } from '@/app/azioni/admin';
import { MODELLI } from '@/lib/tipi-modelli';

export interface RigaLotto {
  id: string; nome: string; prezzo: number; quantita: number | null; usati: number;
  dataInizio: string; dataFine: string; visibileDaPr: boolean; ordine: number;
  categoria: string; confermaCategoria: boolean; uscitaGiorniPrima: number | null; fineOrePrima: number | null;
  dopoPrecedente: boolean; prAbilitati: string[] | null;
}

const CATEGORIE = ['Donne', 'Studenti', 'Gruppi', 'Under 25'];

/** Tipi di prevendita della serata: prezzo, categoria, quando escono e quando chiudono, posti, link PR. */
export function Lotti({ eventoId, lotti, pr, altreSerate }: {
  eventoId: string; lotti: RigaLotto[]; pr: { id: string; nome: string }[]; altreSerate: { id: string; etichetta: string; quanti: number }[];
}) {
  const [msg, setMsg] = useState<EsitoAzione>({});
  const [inCorso, avvia] = useTransition();
  const [copiaDa, setCopiaDa] = useState('');
  const sostituisce = lotti.length > 0 ? ' Sostituisce i tipi che ci sono ora.' : '';
  return (
    <div className="flex flex-col gap-4">
      {(msg.errore || msg.ok) && <p role={msg.errore ? 'alert' : 'status'} className={`m-0 text-[14px] ${msg.errore ? 'text-stop-testo' : 'text-ok'}`}>{msg.errore ?? msg.ok}</p>}

      <details className="border border-linea p-4">
        <summary className="cursor-pointer font-mono text-[12px] tracking-[.04em]">MODELLI RAPIDI E COPIA DA UN’ALTRA SERATA</summary>
        <div className="flex flex-col gap-4 pt-4">
          <div className="grid gap-2">
            {MODELLI.map((m) => (
              <button key={m.id} type="button" className="mm-btn mm-btn--linea flex-col items-start text-left" style={{ minHeight: 72, height: 'auto', padding: 12 }} disabled={inCorso}
                onClick={() => avvia(async () => setMsg(await modelloTipiAzione(eventoId, m.id)))}>
                <strong>{m.nome}</strong><span className="text-[12px] font-normal normal-case text-osso-2">{m.descrizione}{sostituisce}</span>
              </button>
            ))}
          </div>
          {altreSerate.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="mm-campo grow">
                <label className="mm-campo__etichetta" htmlFor="copia-tipi">Copia i tipi da</label>
                <select id="copia-tipi" className="mm-campo__input" value={copiaDa} onChange={(e) => setCopiaDa(e.target.value)}>
                  <option value="">Scegli una serata…</option>
                  {altreSerate.map((s) => <option key={s.id} value={s.id}>{s.etichetta} ({s.quanti} tipi)</option>)}
                </select>
              </div>
              <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} disabled={inCorso || !copiaDa}
                onClick={() => avvia(async () => setMsg(await copiaTipiAzione(eventoId, copiaDa)))}>Copia</button>
            </div>
          )}
        </div>
      </details>

      {lotti.map((l, k) => (
        <div key={l.id} className="flex flex-col gap-2 border border-linea bg-notte-2 p-4">
          <FormLotto eventoId={eventoId} l={l} pr={pr} primo={k === 0} />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-osso-2">{l.usati}{l.quantita != null ? `/${l.quantita}` : ''} VENDUTI{l.categoria ? ` · ${l.categoria.toUpperCase()}` : ''}</span>
            <button type="button" className="mm-btn mm-btn--muto" disabled={inCorso || l.usati > 0} style={{ minHeight: 36 }}
              title={l.usati > 0 ? 'Ha già iscritti: chiudilo con una data di fine' : undefined}
              onClick={() => avvia(async () => setMsg(await eliminaLottoAzione(l.id)))}>Elimina</button>
          </div>
        </div>
      ))}
      <details className="border border-dashed border-linea-forte p-4" open={lotti.length === 0}>
        <summary className="cursor-pointer font-display text-[22px] font-extrabold uppercase">+ Aggiungi tipo di prevendita</summary>
        <div className="pt-4">
          <FormLotto eventoId={eventoId} pr={pr} primo={lotti.length === 0}
            l={{ id: '', nome: '', prezzo: 0, quantita: null, usati: 0, dataInizio: '', dataFine: '', visibileDaPr: true, ordine: lotti.length, categoria: '', confermaCategoria: false, uscitaGiorniPrima: null, fineOrePrima: null, dopoPrecedente: false, prAbilitati: null }} />
        </div>
      </details>
    </div>
  );
}

function FormLotto({ eventoId, l, pr, primo }: { eventoId: string; l: RigaLotto; pr: { id: string; nome: string }[]; primo: boolean }) {
  const [stato, invia, inCorso] = useActionState(salvaLottoAzione, {} as EsitoAzione);
  const p = l.id || 'nuovo';
  const [uscita, setUscita] = useState(l.uscitaGiorniPrima != null ? 'giorni' : l.dataInizio ? 'data' : 'subito');
  const [fine, setFine] = useState(l.fineOrePrima != null ? 'ore' : l.dataFine ? 'data' : 'mai');
  const [categoria, setCategoria] = useState(l.categoria);
  const [prModo, setPrModo] = useState(!l.visibileDaPr ? 'nessuno' : l.prAbilitati ? 'alcuni' : 'tutti');
  return (
    <form action={invia} className="grid gap-3 md:grid-cols-4">
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="id" value={l.id} />
      <input type="hidden" name="ordine" value={l.ordine} />
      <div className="md:col-span-2"><Mini id={`${p}-nome`} nome="nome" etichetta="Nome" v={l.nome} /></div>
      <Mini id={`${p}-prezzo`} nome="prezzo" etichetta="Prezzo €" v={String(l.prezzo)} />
      <Mini id={`${p}-q`} nome="quantita" etichetta="Posti (vuoto = illimitati)" v={l.quantita == null ? '' : String(l.quantita)} />

      <div className="mm-campo md:col-span-2">
        <label className="mm-campo__etichetta" htmlFor={`${p}-cat`}>Categoria (controllata alla porta)</label>
        <input className="mm-campo__input" style={{ height: 44, fontSize: 15 }} id={`${p}-cat`} name="categoria" list="categorie-tipi" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Nessuna: ingresso normale" />
        <datalist id="categorie-tipi">{CATEGORIE.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <label className="flex items-center gap-2 text-[14px] md:col-span-2"><input type="checkbox" name="confermaCategoria" defaultChecked={l.confermaCategoria} disabled={!categoria} className="h-4 w-4 accent-[var(--arancio)]" />Il cliente dichiara nel modulo di rientrare nella categoria</label>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 md:col-span-2">
        <legend className="mm-campo__etichetta mb-1 p-0">Esce</legend>
        <select name="uscitaModo" className="mm-campo__input" style={{ height: 44, fontSize: 15 }} value={uscita} onChange={(e) => setUscita(e.target.value)} aria-label="Quando esce">
          <option value="subito">Subito (appena è il suo turno)</option>
          <option value="giorni">N giorni prima della serata</option>
          <option value="data">Data fissa</option>
        </select>
        {uscita === 'giorni' && <Mini id={`${p}-gg`} nome="uscitaGiorniPrima" etichetta="Giorni prima" v={l.uscitaGiorniPrima == null ? '' : String(l.uscitaGiorniPrima)} />}
        {uscita === 'data' && <Mini id={`${p}-da`} nome="dataInizio" etichetta="Dal" v={l.dataInizio} tipo="datetime-local" />}
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="dopoPrecedente" defaultChecked={l.dopoPrecedente} disabled={primo} className="h-4 w-4 accent-[var(--arancio)]" />Esce solo quando finiscono i posti del tipo prima</label>
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 md:col-span-2">
        <legend className="mm-campo__etichetta mb-1 p-0">Chiude</legend>
        <select name="fineModo" className="mm-campo__input" style={{ height: 44, fontSize: 15 }} value={fine} onChange={(e) => setFine(e.target.value)} aria-label="Quando chiude">
          <option value="mai">Alla serata (o a esaurimento)</option>
          <option value="ore">N ore prima della serata</option>
          <option value="data">Data fissa</option>
        </select>
        {fine === 'ore' && <Mini id={`${p}-ore`} nome="fineOrePrima" etichetta="Ore prima (168 = 7 giorni)" v={l.fineOrePrima == null ? '' : String(l.fineOrePrima)} />}
        {fine === 'data' && <Mini id={`${p}-a`} nome="dataFine" etichetta="Fino al" v={l.dataFine} tipo="datetime-local" />}
      </fieldset>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0 md:col-span-4">
        <legend className="mm-campo__etichetta mb-1 p-0">Link dei PR</legend>
        <select name="prModo" className="mm-campo__input" style={{ height: 44, fontSize: 15 }} value={prModo} onChange={(e) => setPrModo(e.target.value)} aria-label="Venduto dai link PR">
          <option value="tutti">Venduto anche dai link di tutti i PR</option>
          <option value="alcuni">Solo dai link di alcuni PR</option>
          <option value="nessuno">Solo dal sito (non dai PR)</option>
        </select>
        {prModo === 'alcuni' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {pr.map((x) => (
              <label key={x.id} className="flex items-center gap-2 text-[14px]"><input type="checkbox" name="prAbilitati" value={x.id} defaultChecked={l.prAbilitati?.includes(x.id) ?? false} className="h-4 w-4 accent-[var(--arancio)]" />{x.nome}</label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex items-center justify-end gap-3 md:col-span-4">
        {stato.ok && <span className="text-[13px] text-ok">{stato.ok}</span>}
        {stato.errore && <span className="text-[13px] text-stop-testo">{stato.errore}</span>}
        <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 40 }} disabled={inCorso}>{l.id ? 'Salva tipo' : 'Aggiungi'}</button>
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
