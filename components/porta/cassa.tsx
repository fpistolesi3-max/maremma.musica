'use client';

import { useRef, useState } from 'react';
import type { MetodoPagamento } from '@/lib/dati/tipi';
import type { DatiCassa, VocePorta } from '@/lib/porta-logica';
import { chiaveCognome, componiData, etaSufficiente } from '@/lib/regole';

// Ingresso in cassa (solo nelle serate che ce l'hanno): chi arriva senza prevendita paga e viene registrato dallo staff.
// Solo nome, cognome e data di nascita (età minima e doppioni): niente email, niente QR, niente attese.

export interface EventoCassa { data: string; etaMinima: number; prezzoCassa: number }

export function SchermoCassa({ evento, elenco, metodo, setMetodo, onRegistra, onApri, onChiudi }: {
  evento: EventoCassa;
  elenco: VocePorta[];
  metodo: MetodoPagamento;
  setMetodo: (m: MetodoPagamento) => void;
  onRegistra: (dati: DatiCassa) => void;
  onApri: (v: VocePorta) => void;
  onChiudi: () => void;
}) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [data, setData] = useState({ g: '', m: '', a: '' });
  const [importo, setImporto] = useState(String(evento.prezzoCassa));
  const [errore, setErrore] = useState<string | null>(null);
  const [doppio, setDoppio] = useState<VocePorta | null>(null);
  const mese = useRef<HTMLInputElement>(null);
  const anno = useRef<HTMLInputElement>(null);

  function registra(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null); setDoppio(null);
    if (!nome.trim() || !cognome.trim()) return setErrore('Scrivi nome e cognome come sul documento.');
    const dataNascita = componiData(data.g, data.m, data.a);
    if (!dataNascita) return setErrore('Controlla la data di nascita (giorno, mese, anno).');
    if (!etaSufficiente(dataNascita, evento)) return setErrore(`Serata ${evento.etaMinima}+: con questa data non può entrare.`);
    const k = chiaveCognome(cognome);
    // Chi ha solo chiesto la prevendita senza pagarla può entrare in cassa.
    const trovato = elenco.find((v) => v.dataNascita === dataNascita && chiaveCognome(v.cognome) === k && v.stato !== 'annullato' && v.stato !== 'rimborsato' && v.stato !== 'in_attesa');
    if (trovato) { setDoppio(trovato); return; }
    const euro = Number(importo.replace(',', '.'));
    if (!Number.isFinite(euro) || euro < 0) return setErrore('Importo non valido.');
    onRegistra({ nome: nome.trim(), cognome: cognome.trim(), dataNascita, importo: euro });
  }

  const cifre = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n);

  return (
    <form onSubmit={registra} className="flex flex-grow flex-col gap-4 px-4 pb-7 pt-5" noValidate>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Torna allo scanner" onClick={onChiudi} className="grid h-11 w-11 flex-none place-items-center border-0 bg-transparent p-0 text-osso">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <h1 className="m-0 font-display text-[36px] font-black uppercase leading-none">Ingresso in cassa</h1>
      </div>
      <span className="text-[14px] leading-5 text-osso-2">Per chi non è in lista. Niente email e niente QR: entra subito.</span>

      <div className="grid grid-cols-2 gap-3">
        <div className="mm-campo">
          <label className="mm-campo__etichetta" htmlFor="c-nome">Nome</label>
          <input className="mm-campo__input" id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" autoCapitalize="words" autoFocus />
        </div>
        <div className="mm-campo">
          <label className="mm-campo__etichetta" htmlFor="c-cognome">Cognome</label>
          <input className="mm-campo__input" id="c-cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} autoComplete="off" autoCapitalize="words" />
        </div>
      </div>

      <fieldset className="mm-campo m-0 border-0 p-0">
        <legend className="mm-campo__etichetta mb-2 p-0">Data di nascita · dal documento</legend>
        <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-2">
          <input className="mm-campo__input text-center font-mono" inputMode="numeric" placeholder="GG" aria-label="Giorno" value={data.g}
            onChange={(e) => { const v = cifre(e.target.value, 2); setData((d) => ({ ...d, g: v })); if (v.length === 2) mese.current?.focus(); }} />
          <input ref={mese} className="mm-campo__input text-center font-mono" inputMode="numeric" placeholder="MM" aria-label="Mese" value={data.m}
            onChange={(e) => { const v = cifre(e.target.value, 2); setData((d) => ({ ...d, m: v })); if (v.length === 2) anno.current?.focus(); }} />
          <input ref={anno} className="mm-campo__input text-center font-mono" inputMode="numeric" placeholder="AAAA" aria-label="Anno" value={data.a}
            onChange={(e) => setData((d) => ({ ...d, a: cifre(e.target.value, 4) }))} />
        </div>
      </fieldset>

      <div className="grid grid-cols-[1fr_1.4fr] items-end gap-3">
        <div className="mm-campo">
          <label className="mm-campo__etichetta" htmlFor="c-importo">Incasso €</label>
          <input className="mm-campo__input text-center font-display font-black" id="c-importo" inputMode="decimal" value={importo}
            onChange={(e) => setImporto(e.target.value.replace(/[^\d.,]/g, ''))} style={{ fontSize: 28 }} />
        </div>
        <div role="radiogroup" aria-label="Metodo di pagamento" className="grid h-[52px] grid-cols-2 border border-linea-forte">
          {([['porta_contanti', 'Contanti'], ['porta_pos', 'POS']] as const).map(([m, t]) => (
            <button key={m} type="button" role="radio" aria-checked={metodo === m} onClick={() => setMetodo(m)}
              className={`border-0 text-[13px] font-semibold uppercase tracking-bottone ${metodo === m ? 'bg-osso text-notte' : 'bg-transparent text-osso'}`}>{t}</button>
          ))}
        </div>
      </div>

      {errore && <p role="alert" className="m-0 border border-stop-testo px-4 py-3 text-[15px] leading-5 text-stop-testo">{errore}</p>}
      {doppio && (
        <div role="alert" className="flex items-center gap-3 border border-attesa p-4">
          <span className="flex-grow text-[15px] leading-5 text-attesa">
            {doppio.nome} {doppio.cognome} è già {doppio.stato === 'entrato' ? 'entrato' : `in lista (${doppio.lista})`}: non registrarlo due volte.
          </span>
          {doppio.stato !== 'entrato' && <button type="button" className="mm-btn mm-btn--linea flex-none" style={{ minHeight: 44 }} onClick={() => onApri(doppio)}>Apri</button>}
        </div>
      )}

      <div className="flex-grow" />
      <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 64, fontSize: 17 }}>
        Incassato · fai entrare
      </button>
    </form>
  );
}
