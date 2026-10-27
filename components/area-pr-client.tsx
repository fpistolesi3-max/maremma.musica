'use client';

import { useMemo, useState } from 'react';
import { copiaTesto } from './client';
import type { StatoIscrizione } from '@/lib/dati/tipi';

const CHIP: Record<StatoIscrizione, [string, string]> = {
  in_attesa: ['mm-chip mm-chip--incassare', 'Non pagato'],
  scaduta: ['mm-chip mm-chip--annullato', 'Scaduta'],
  in_lista: ['mm-chip mm-chip--lista', 'In lista'],
  pagato: ['mm-chip mm-chip--pagato', 'Pagato'],
  entrato: ['mm-chip mm-chip--entrato', 'Entrato'],
  annullato: ['mm-chip mm-chip--annullato', 'Annullato'],
  rimborsato: ['mm-chip mm-chip--annullato', 'Rimborsato'],
};

export interface RigaListaPr { id: string; nome: string; quando: string; stato: StatoIscrizione }

/** La lista personale del PR: ricerca e stato (pagato online, entrato). I soldi non passano dal PR. */
export function ListaPr({ righe }: { righe: RigaListaPr[] }) {
  const [q, setQ] = useState('');
  const [tutti, setTutti] = useState(false);
  const filtrate = useMemo(() => {
    const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return righe.filter((r) => n(r.nome).includes(n(q)));
  }, [righe, q]);
  const visibili = tutti || q ? filtrate : filtrate.slice(0, 8);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="mm-campo">
        <label className="sr-only" htmlFor="pr-cerca">Cerca nella lista</label>
        <input className="mm-campo__input" id="pr-cerca" placeholder="Cerca un nome" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex flex-col">
        {visibili.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-3 border-t border-linea py-[14px] ${i === visibili.length - 1 ? 'border-b' : ''}`}>
            <div className="flex min-w-0 flex-grow flex-col gap-[3px]">
              <span className="text-[16px] font-medium leading-5">{r.nome}</span>
              <span className="font-mono text-[11px] leading-[14px] text-osso-3">{r.quando}</span>
            </div>
            <span className={CHIP[r.stato][0]}>{CHIP[r.stato][1]}</span>
          </div>
        ))}
        {visibili.length === 0 && <p className="border-y border-linea py-4 text-osso-2">{q ? 'Nessun nome trovato.' : 'Ancora nessuno in lista: manda il tuo link.'}</p>}
      </div>
      {!q && !tutti && filtrate.length > 8 && (
        <button type="button" className="mm-btn mm-btn--muto self-center" onClick={() => setTutti(true)}>Vedi tutti i {filtrate.length}</button>
      )}
    </div>
  );
}

/** Condivisione del link PR: WhatsApp apre la chat, Instagram copia il link da incollare nella storia. */
export function CondividiLink({ link, testo }: { link: string; testo: string }) {
  const [msg, setMsg] = useState('');
  const assoluto = () => (link.startsWith('/') ? `${window.location.origin}${link}` : link);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-[10px]">
        <a className="mm-btn mm-btn--primario" style={{ padding: '0 12px' }} href="#"
          onClick={(e) => { e.preventDefault(); window.location.href = `https://wa.me/?text=${encodeURIComponent(`${testo} ${assoluto()}`)}`; }}>
          Su WhatsApp
        </a>
        <button type="button" className="mm-btn mm-btn--linea" style={{ padding: '0 12px' }}
          onClick={async () => setMsg((await copiaTesto(assoluto())) ? 'Link copiato: incollalo nella storia con lo sticker Link.' : 'Copia il link qui sopra.')}>
          Su Instagram
        </button>
      </div>
      <span aria-live="polite" className="text-[14px] leading-5 text-ok">{msg}</span>
    </div>
  );
}

/**
 * Richiesta inserita dal PR e non ancora pagata: il PR rimanda al cliente il link per pagare, su WhatsApp
 * (direttamente al suo numero) o copiandolo. Utile se l'email non arriva o finisce nello spam.
 */
export function MandaLinkPagamento({ link, telefono, testo }: { link: string; telefono: string; testo: string }) {
  const [msg, setMsg] = useState('');
  const assoluto = () => (link.startsWith('/') ? `${window.location.origin}${link}` : link);
  // Numero per WhatsApp: solo cifre, con il prefisso italiano se manca.
  const cifre = telefono.replace(/\D/g, '');
  const numero = telefono.trim().startsWith('+') || cifre.startsWith('00') ? cifre.replace(/^00/, '') : `39${cifre}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <a className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} href="#"
          onClick={(e) => { e.preventDefault(); window.location.href = `https://wa.me/${numero}?text=${encodeURIComponent(`${testo} ${assoluto()}`)}`; }}>
          Manda il link su WhatsApp
        </a>
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }}
          onClick={async () => setMsg((await copiaTesto(assoluto())) ? 'Link per pagare copiato.' : 'Non riesco a copiarlo: usa WhatsApp.')}>
          Copia il link per pagare
        </button>
      </div>
      <span aria-live="polite" className="text-[13px] leading-5 text-ok">{msg}</span>
    </div>
  );
}
