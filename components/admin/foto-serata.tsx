'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FotoVista } from '@/lib/foto';
import { MAX_FOTO_SERATA, MAX_IN_EVIDENZA } from '@/lib/foto';
import {
  annullaFotoAzione, confermaFotoAzione, eliminaFotoAzione, eliminaTutteLeFotoAzione, impostaFotoAzione, preparaFotoAzione, salvaCreditoAzione, spostaFotoAzione,
  type EsitoFoto,
} from '@/app/azioni/foto';
import type { Destinazione } from '@/lib/dati/foto';
import { riduciFoto } from './riduci-foto';

type Stato = 'attesa' | 'riduco' | 'carico' | 'fatta' | 'errore';
interface Voce { chiave: number; nome: string; stato: Stato; pct: number; errore?: string }

const PARALLELE = 3;
const mb = (b: number) => (b / 1_000_000).toFixed(b < 10_000_000 ? 1 : 0).replace('.', ',');
const ETICHETTA: Record<Stato, string> = { attesa: 'in coda', riduco: 'preparo…', carico: 'carico', fatta: '✓ fatta', errore: 'non riuscita' };

/** Manda un file al suo indirizzo (Storage con indirizzo firmato, oppure il servizio locale in sviluppo) e segnala l'avanzamento. */
function invia(dest: Destinazione, blob: Blob, avanza: (byte: number) => void): Promise<void> {
  return new Promise((ok, ko) => {
    const x = new XMLHttpRequest();
    let corpo: XMLHttpRequestBodyInit;
    if (dest.tipo === 'firmato') {
      x.open('PUT', dest.url);
      const f = new FormData();
      f.append('cacheControl', '31536000');
      f.append('', blob);
      corpo = f;
    } else {
      x.open('POST', dest.url);
      corpo = blob;
    }
    x.upload.onprogress = (e) => avanza(e.loaded);
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : ko(new Error(`Caricamento rifiutato (${x.status})`)));
    x.onerror = () => ko(new Error('Connessione interrotta'));
    x.send(corpo);
  });
}

/** Sezione Foto della serata: carica (con coda e "Riprova"), sceglie le in evidenza, ordina, nasconde, elimina. */
export function FotoSerata({ eventoId, foto, credito, byteSerata, byteTotali }: {
  eventoId: string; foto: FotoVista[]; credito: string; byteSerata: number; byteTotali: number;
}) {
  const router = useRouter();
  const [voci, setVoci] = useState<Voce[]>([]);
  const [scelta, setScelta] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [testoCredito, setTestoCredito] = useState(credito);
  const [inCorso, avvia] = useTransition();
  const file = useRef(new Map<number, File>());
  const prossima = useRef(0);
  const attivi = useRef(0);
  const coda = useRef<number[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const aggiornaVoce = (chiave: number, patch: Partial<Voce>) => setVoci((v) => v.map((x) => (x.chiave === chiave ? { ...x, ...patch } : x)));

  async function lavora(chiave: number) {
    const f = file.current.get(chiave)!;
    let idCreato: string | undefined;
    try {
      aggiornaVoce(chiave, { stato: 'riduco', pct: 0, errore: undefined });
      const r = await riduciFoto(f);
      const p = await preparaFotoAzione(eventoId);
      if (!p.ok || !p.id || !p.grande || !p.mini) throw new Error(p.errore ?? 'Caricamento non preparato');
      idCreato = p.id;
      aggiornaVoce(chiave, { stato: 'carico', pct: 0 });
      const totale = r.grande.size + r.mini.size;
      await invia(p.grande, r.grande, (b) => aggiornaVoce(chiave, { pct: Math.round((b / totale) * 100) }));
      await invia(p.mini, r.mini, (b) => aggiornaVoce(chiave, { pct: Math.round(((r.grande.size + b) / totale) * 100) }));
      const c = await confermaFotoAzione(p.id, r.larghezza, r.altezza);
      if (!c.ok) { idCreato = undefined; throw new Error(c.errore ?? 'Conferma non riuscita'); }
      file.current.delete(chiave);
      aggiornaVoce(chiave, { stato: 'fatta', pct: 100 });
      router.refresh();
      // La foto è già nella griglia: la riga del caricamento si toglie da sola.
      setTimeout(() => setVoci((v) => v.filter((x) => x.chiave !== chiave)), 4000);
    } catch (e) {
      if (idCreato) void annullaFotoAzione(idCreato);
      aggiornaVoce(chiave, { stato: 'errore', errore: (e as Error).message });
    }
  }

  function pompa() {
    while (attivi.current < PARALLELE && coda.current.length) {
      const chiave = coda.current.shift()!;
      attivi.current++;
      void lavora(chiave).finally(() => { attivi.current--; pompa(); });
    }
  }

  function aggiungi(lista: FileList | File[]) {
    const nuovi = [...lista];
    if (!nuovi.length) return;
    const posti = Math.max(0, MAX_FOTO_SERATA - foto.length - voci.filter((v) => v.stato !== 'errore' && v.stato !== 'fatta').length);
    setMsg(nuovi.length > posti ? `Una serata può avere al massimo ${MAX_FOTO_SERATA} foto: ne aggiungo ${posti}.` : null);
    const nuove: Voce[] = nuovi.slice(0, posti).map((f) => {
      const chiave = prossima.current++;
      file.current.set(chiave, f);
      coda.current.push(chiave);
      return { chiave, nome: f.name, stato: 'attesa', pct: 0 };
    });
    setVoci((v) => [...v.filter((x) => x.stato !== 'fatta'), ...nuove]);
    pompa();
  }

  function riprova(chiave: number) {
    aggiornaVoce(chiave, { stato: 'attesa', errore: undefined });
    coda.current.push(chiave);
    pompa();
  }

  const esegui = (azione: () => Promise<EsitoFoto>, dopo?: () => void) => avvia(async () => {
    const r = await azione();
    setMsg(r.errore ?? null);
    if (r.ok) { dopo?.(); router.refresh(); }
  });

  const s = foto.find((f) => f.id === scelta) ?? null;
  const inEvidenza = foto.filter((f) => f.inEvidenza).length;
  const pos = s ? foto.indexOf(s) : -1;

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex flex-col gap-4 border border-dashed border-linea-forte bg-notte-2 p-4 md:p-6"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); aggiungi(e.dataTransfer.files); }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className="mm-btn mm-btn--primario" onClick={() => input.current?.click()}>+ Aggiungi foto</button>
          <input ref={input} type="file" accept="image/*" multiple hidden data-testid="scegli-foto" onChange={(e) => { aggiungi(e.target.files ?? []); e.target.value = ''; }} />
          <span className="font-mono text-[12px] leading-4 text-osso-2">
            Scegli anche più foto insieme (da PC puoi trascinarle qui). Le riduce il telefono prima dell&apos;invio e toglie la posizione GPS.
          </span>
        </div>
        {voci.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Caricamento in corso">
            {voci.map((v) => (
              <li key={v.chiave} className="flex flex-col gap-1 border-t border-linea pt-2 text-[14px]">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-grow truncate">{v.nome}</span>
                  <span className={`flex-none font-mono text-[12px] ${v.stato === 'errore' ? 'text-stop-testo' : v.stato === 'fatta' ? 'text-ok' : 'text-osso-2'}`}>
                    {ETICHETTA[v.stato]}{v.stato === 'carico' ? ` ${v.pct}%` : ''}
                  </span>
                  {v.stato === 'errore' && <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} onClick={() => riprova(v.chiave)}>Riprova</button>}
                </div>
                {v.stato === 'errore' && <span role="alert" className="text-[13px] text-stop-testo">{v.errore}</span>}
                {(v.stato === 'carico' || v.stato === 'riduco') && (
                  <div className="h-[3px] w-full bg-linea" role="progressbar" aria-valuenow={v.pct} aria-valuemin={0} aria-valuemax={100} aria-label={v.nome}>
                    <div className="h-full bg-arancio" style={{ width: `${v.stato === 'riduco' ? 5 : v.pct}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="mm-campo max-w-[460px]" onSubmit={(e) => { e.preventDefault(); esegui(() => salvaCreditoAzione(eventoId, testoCredito)); }}>
        <label className="mm-campo__etichetta" htmlFor="credito-foto">Foto di… (facoltativo)</label>
        <div className="flex gap-2">
          <input id="credito-foto" className="mm-campo__input min-w-0 flex-grow" value={testoCredito} maxLength={80} placeholder="Nome del fotografo" onChange={(e) => setTestoCredito(e.target.value)} />
          <button type="submit" className="mm-btn mm-btn--linea" disabled={inCorso || testoCredito.trim() === credito}>Salva</button>
        </div>
        <span className="mm-campo__aiuto">Sul sito compare come &ldquo;Foto di {testoCredito.trim() || '…'}&rdquo;.</span>
      </form>

      {msg && <p role="alert" className="m-0 text-[14px] text-stop-testo">{msg}</p>}

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 font-mono text-[12px] text-osso-2">
        <span>{foto.length} FOTO · {inEvidenza} IN EVIDENZA (MAX {MAX_IN_EVIDENZA}){inEvidenza === 0 && foto.length > 0 ? ' · SE NON NE SCEGLI, USO LE PRIME 4' : ''}</span>
        <span>SPAZIO: {mb(byteSerata)} MB QUI · {mb(byteTotali)} MB IN TUTTO (PIANO GRATUITO: 1 GB)</span>
      </div>

      {s && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border border-arancio bg-notte-2 p-3" role="group" aria-label="Azioni sulla foto scelta">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.urlMini} alt="" className="h-12 w-12 flex-none object-cover" />
          <button type="button" disabled={inCorso || s.nascosta} className="mm-btn mm-btn--linea" aria-pressed={s.inEvidenza} style={{ minHeight: 44 }}
            onClick={() => esegui(() => impostaFotoAzione(s.id, { inEvidenza: !s.inEvidenza }))}>{s.inEvidenza ? '★ Togli dall’evidenza' : '☆ In evidenza'}</button>
          <button type="button" disabled={inCorso} className="mm-btn mm-btn--linea" aria-pressed={s.nascosta} style={{ minHeight: 44 }}
            onClick={() => esegui(() => impostaFotoAzione(s.id, { nascosta: !s.nascosta }))}>{s.nascosta ? 'Mostra' : 'Nascondi'}</button>
          <button type="button" disabled={inCorso || pos <= 0} className="mm-btn mm-btn--muto" style={{ minHeight: 44 }}
            onClick={() => esegui(() => spostaFotoAzione(s.id, 'prima'))}>← Prima</button>
          <button type="button" disabled={inCorso || pos >= foto.length - 1} className="mm-btn mm-btn--muto" style={{ minHeight: 44 }}
            onClick={() => esegui(() => spostaFotoAzione(s.id, 'dopo'))}>Dopo →</button>
          <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 44 }}
            onClick={() => { if (confirm('Eliminare questa foto? Non si può annullare.')) esegui(() => eliminaFotoAzione(s.id), () => setScelta(null)); }}>Elimina</button>
          <button type="button" className="mm-btn mm-btn--muto ml-auto" style={{ minHeight: 44 }} onClick={() => setScelta(null)}>Chiudi</button>
        </div>
      )}

      {foto.length === 0 ? (
        <p className="m-0 border-y border-linea py-6 text-osso-2">Nessuna foto per questa serata. Aggiungine con il bottone qui sopra.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 md:grid-cols-5 lg:grid-cols-6">
          {foto.map((f, i) => (
            <li key={f.id}>
              <button type="button" onClick={() => setScelta(scelta === f.id ? null : f.id)} aria-pressed={scelta === f.id}
                aria-label={`Foto ${i + 1}${f.inEvidenza ? ', in evidenza' : ''}${f.nascosta ? ', nascosta' : ''}`}
                className={`relative block aspect-square w-full overflow-hidden border-0 bg-notte-2 p-0 ${scelta === f.id ? 'outline outline-2 outline-arancio' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.urlMini} alt="" loading="lazy" className={`h-full w-full object-cover ${f.nascosta ? 'opacity-30' : ''}`} />
                <span className="absolute left-1 top-1 bg-notte px-[6px] py-[2px] font-mono text-[10px] leading-3">{i + 1}</span>
                {f.inEvidenza && <span className="absolute right-1 top-1 bg-arancio px-[6px] py-[2px] font-mono text-[10px] leading-3 text-notte">★</span>}
                {f.nascosta && <span className="absolute inset-x-0 bottom-0 bg-notte px-1 py-[2px] text-center font-mono text-[10px] leading-3">NASCOSTA</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {foto.length > 0 && (
        <div className="border-t border-linea pt-4">
          <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 44 }}
            onClick={() => { if (confirm(`Eliminare tutte le ${foto.length} foto di questa serata? Non si può annullare.`)) esegui(() => eliminaTutteLeFotoAzione(eventoId), () => setScelta(null)); }}>
            Elimina tutte le foto della serata
          </button>
        </div>
      )}
    </div>
  );
}
