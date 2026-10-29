'use client';

import { useRef, useState } from 'react';
import type { MetodoPagamento } from '@/lib/dati/tipi';
import { proposteRiuso, riepilogoCassa, type DatiCassa, type VocePorta } from '@/lib/porta-logica';
import { chiaveCognome, componiData, etaSufficiente } from '@/lib/regole';

// Cassa (solo nelle serate che ce l'hanno): una postazione a sé, separata dallo scanner. Chi arriva senza prevendita paga qui e viene
// registrato dallo staff: non passa mai dallo scanner. Solo nome, cognome e data di nascita (età minima e doppioni): niente email, niente QR.

export interface EventoCassa { data: string; etaMinima: number; prezzoCassa: number }

const euro = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;
const oraDi = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const nascita = (ymd: string) => ymd.split('-').reverse().join('.');

export function SchermoCassa({ evento, elenco, metodo, setMetodo, onRegistra, onApri }: {
  evento: EventoCassa;
  elenco: VocePorta[];
  metodo: MetodoPagamento;
  setMetodo: (m: MetodoPagamento) => void;
  onRegistra: (dati: DatiCassa) => void;
  onApri: (v: VocePorta) => void;
}) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [data, setData] = useState({ g: '', m: '', a: '' });
  const [importo, setImporto] = useState(String(evento.prezzoCassa));
  const [errore, setErrore] = useState<string | null>(null);
  const [doppio, setDoppio] = useState<VocePorta | null>(null);
  const mese = useRef<HTMLInputElement>(null);
  const anno = useRef<HTMLInputElement>(null);

  // Mentre si scrive il cognome: chi ha compilato la prevendita senza pagarla si può riusare con un tocco.
  const riuso = proposteRiuso(elenco, cognome).filter((v) => !(v.nome === nome && v.cognome === cognome && v.dataNascita === `${data.a}-${data.m}-${data.g}`));
  const riepilogo = riepilogoCassa(elenco);

  function usaDati(v: VocePorta) {
    const [a = '', m = '', g = ''] = v.dataNascita.split('-');
    setNome(v.nome); setCognome(v.cognome); setData({ g, m, a });
    setErrore(null); setDoppio(null);
  }

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
    <div className="flex flex-grow flex-col gap-6 px-4 pb-7 pt-4">
      <form onSubmit={registra} className="flex flex-col gap-4" noValidate>
        <h1 className="m-0 font-display text-[32px] font-black uppercase leading-[.95]">Ingresso senza prevendita{evento.prezzoCassa > 0 ? ` · ${euro(evento.prezzoCassa)}` : ''}</h1>
        <span className="text-[14px] leading-5 text-osso-2">Per chi arriva senza prevendita e paga qui. Niente email e niente QR: entra subito.</span>

        <div className="grid grid-cols-2 gap-3">
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="c-nome">Nome</label>
            <input className="mm-campo__input" id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" autoCapitalize="words" />
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="c-cognome">Cognome</label>
            <input className="mm-campo__input" id="c-cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} autoComplete="off" autoCapitalize="words" />
          </div>
        </div>

        {riuso.length > 0 && (
          <div className="flex flex-col gap-2" role="group" aria-label="Prevendite non completate con questo cognome">
            <span className="font-mono text-[11px] leading-[14px] text-osso-2">PREVENDITA NON COMPLETATA · USA QUESTI DATI</span>
            {riuso.map((v) => (
              <button key={v.id} type="button" onClick={() => usaDati(v)} className="mm-btn mm-btn--linea justify-between text-left" style={{ minHeight: 48, padding: '0 14px' }}>
                <span className="truncate">{v.nome} {v.cognome}</span>
                <span className="flex-none font-mono text-[12px]">{nascita(v.dataNascita)}</span>
              </button>
            ))}
          </div>
        )}

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

        <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 64, fontSize: 17 }}>
          Incassato · fai entrare
        </button>
      </form>

      <section aria-label="Ultimi ingressi in cassa" className="flex flex-col gap-2 border-t border-linea pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="m-0 font-mono text-[11px] font-medium leading-[14px] text-osso-2">ULTIMI INGRESSI IN CASSA</h2>
          <span className="font-mono text-[11px] leading-[14px] text-osso-2">{riepilogo.ingressi}</span>
        </div>
        <div className="flex gap-4 font-mono text-[13px] leading-[18px]">
          <span>CONTANTI {euro(riepilogo.contanti)}</span>
          <span>POS {euro(riepilogo.pos)}</span>
        </div>
        {riepilogo.ultimi.length === 0 ? (
          <p className="m-0 text-[14px] text-osso-2">Ancora nessun ingresso in cassa.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {riepilogo.ultimi.map((v) => (
              <li key={v.id} className="flex items-center gap-3 border-t border-linea py-2 text-[14px]">
                <span className="min-w-0 flex-grow truncate">{v.nome} {v.cognome}</span>
                <span className="flex-none font-mono text-[12px] text-osso-2">{v.oraCheckIn ? oraDi(v.oraCheckIn) : ''} · {euro(v.importo)}{v.metodo ? ` · ${v.metodo === 'porta_pos' ? 'POS' : 'CONTANTI'}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
