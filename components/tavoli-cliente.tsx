'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { prenotaTavoloAzione, type StatoTavoloModulo } from '@/app/azioni/tavoli';

export interface TavoloScelta {
  id: string; nome: string; zona: string | null; posti: number | null; spesaMinima: number;
  x: number | null; y: number | null; libero: boolean;
}

const INIZIALE: StatoTavoloModulo = { errori: {}, valori: {} };
const euro = (n: number) => `${n.toLocaleString('it-IT')} €`;

/**
 * Scelta del tavolo (mappa se i tavoli sono stati posizionati, elenco sempre) e modulo di richiesta.
 * `perCliente`: la sta inserendo un PR a nome di un cliente. `chiuse`: la serata è iniziata, si guarda e basta.
 * Si paga sempre sul sito: `scadenza` è quanto resta fermo il tavolo durante il pagamento (o fino a quando vale il
 * link mandato al cliente). `nonAttivo`: il pagamento online non è ancora configurato, i tavoli si guardano e basta.
 */
export function PrenotaTavolo({ tavoli, piantinaUrl, prHandle, scadenza, perCliente = false, chiuse = false, nonAttivo = false }: {
  tavoli: TavoloScelta[]; piantinaUrl: string | null; prHandle: string | null; scadenza: string; perCliente?: boolean; chiuse?: boolean; nonAttivo?: boolean;
}) {
  const [stato, invia, inCorso] = useActionState(prenotaTavoloAzione, INIZIALE);
  const e = stato.errori;
  const v = stato.valori;
  const [scelto, setScelto] = useState<string | null>(v.tavoloId ?? null);
  // Un secondo tocco sullo stesso tavolo toglie la scelta.
  const scegli = (id: string) => setScelto((s) => (s === id ? null : id));
  const sel = tavoli.find((t) => t.id === scelto && t.libero) ?? null;
  const sullaMappa = tavoli.filter((t) => t.x != null && t.y != null);
  const liberi = tavoli.filter((t) => t.libero);

  if (tavoli.length === 0) return <p className="m-0 border-y border-linea py-6 text-osso-2">Per questa serata non ci sono tavoli in vendita.</p>;

  return (
    <div className="flex flex-col gap-8">
      {sullaMappa.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className={`relative w-full select-none overflow-hidden border border-linea-forte bg-vinile ${piantinaUrl ? '' : 'aspect-[4/3]'}`}
            style={piantinaUrl ? undefined : { backgroundImage: 'linear-gradient(var(--linea) 1px, transparent 1px), linear-gradient(90deg, var(--linea) 1px, transparent 1px)', backgroundSize: '10% 10%' }}>
            {piantinaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={piantinaUrl} alt="Piantina del locale" draggable={false} className="block h-auto w-full opacity-80" />
            )}
            {sullaMappa.map((t) => (
              <button key={t.id} type="button" disabled={!t.libero} aria-pressed={scelto === t.id}
                aria-label={`${t.nome}, ${t.libero ? `libero, spesa minima ${euro(t.spesaMinima)}` : 'occupato'}`}
                onClick={() => scegli(t.id)}
                className={`absolute flex h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border-2 px-2 font-mono text-[12px] font-semibold leading-none
                  ${!t.libero ? 'cursor-not-allowed border-linea-forte bg-notte-3 text-osso-3 line-through' : scelto === t.id ? 'z-10 border-arancio bg-arancio text-su-arancio outline outline-2 outline-offset-2 outline-osso' : 'border-ok bg-ok text-su-stato'}`}
                style={{ left: `${t.x}%`, top: `${t.y}%` }}>
                {t.nome}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] text-osso-2">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-ok bg-ok" aria-hidden="true" />LIBERO</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-arancio bg-arancio" aria-hidden="true" />IL TUO</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-linea-forte bg-notte-3" aria-hidden="true" />OCCUPATO</span>
          </div>
        </div>
      )}

      <div className="flex flex-col" role="radiogroup" aria-label="Tavoli">
        {tavoli.map((t, i) => (
          <button key={t.id} type="button" role="radio" aria-checked={scelto === t.id} disabled={!t.libero} onClick={() => scegli(t.id)}
            className={`flex items-center justify-between gap-4 border-0 border-t border-linea bg-transparent px-0 py-4 text-left ${i === tavoli.length - 1 ? 'border-b' : ''} ${t.libero ? 'cursor-pointer text-osso' : 'cursor-not-allowed text-osso-3'}`}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className={`font-display text-[26px] font-extrabold uppercase leading-none ${scelto === t.id ? 'text-arancio' : ''}`}>{t.nome}</span>
              <span className="font-mono text-[11px] leading-4 text-osso-2">{[t.zona, t.posti != null ? `fino a ${t.posti} persone` : null].filter(Boolean).join(' · ').toUpperCase() || ' '}</span>
            </span>
            <span className="flex flex-none flex-col items-end gap-1">
              <span className="font-display text-[22px] font-extrabold leading-none">{t.libero ? euro(t.spesaMinima) : 'Occupato'}</span>
              {t.libero && <span className="font-mono text-[10px] leading-3 text-osso-2">SPESA MINIMA</span>}
            </span>
          </button>
        ))}
      </div>
      {nonAttivo && !chiuse && <p className="m-0 border border-linea px-4 py-3 text-osso-2">La prenotazione online dei tavoli arriva a breve. Per un tavolo, intanto, scrivici.</p>}
      {chiuse && <p className="m-0 border border-linea px-4 py-3 text-osso-2">La serata è già iniziata: i tavoli non si chiedono più dal sito. Per un tavolo libero chiedi alla crew all&apos;ingresso.</p>}
      {!chiuse && !nonAttivo && liberi.length === 0 && <p className="m-0 text-osso-2">Tutti i tavoli sono già presi. Se una prenotazione decade, il tavolo torna libero qui.</p>}

      {!chiuse && !nonAttivo && liberi.length > 0 && (
        <form action={invia} noValidate className="flex flex-col gap-[22px] border border-linea bg-notte-2 p-5">
          <input type="hidden" name="tavoloId" value={sel?.id ?? ''} />
          {prHandle && <input type="hidden" name="pr" value={prHandle} />}
          {/* Campo trappola per i programmi automatici: fuori schermo, non raggiungibile da tastiera né letto ad alta voce. */}
          <input type="text" name="sito" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
          <div className="flex flex-col gap-[6px]">
            <span className="font-mono text-[11px] text-arancio">✦ {perCliente ? 'RICHIESTA PER UN CLIENTE' : 'LA TUA RICHIESTA'}</span>
            <span className="font-display text-[32px] font-black uppercase leading-none">{sel ? `Tavolo ${sel.nome}` : 'Scegli un tavolo'}</span>
            <span className="text-[14px] leading-5 text-osso-2">
              {sel ? `Spesa minima ${euro(sel.spesaMinima)}${sel.posti != null ? ` · fino a ${sel.posti} persone` : ''}.` : 'Tocca un tavolo libero sulla mappa o nell’elenco.'}
            </span>
          </div>
          {(e.tavolo || e.generale) && <p role="alert" className="m-0 border border-stop-testo px-4 py-3 text-[14px] leading-5 text-stop-testo">{e.tavolo ?? e.generale}</p>}

          <div className="mm-campi-2">
            <Campo id="tv-nome" nome="nome" etichetta={perCliente ? 'Nome del cliente' : 'Nome'} errore={e.nome} valore={v.nome} autoComplete={perCliente ? 'off' : 'given-name'} />
            <Campo id="tv-cognome" nome="cognome" etichetta="Cognome" errore={e.cognome} valore={v.cognome} autoComplete={perCliente ? 'off' : 'family-name'} />
          </div>
          <Campo id="tv-email" nome="email" etichetta={perCliente ? 'Email del cliente' : 'Email'} tipo="email" errore={e.email} valore={v.email} autoComplete={perCliente ? 'off' : 'email'} placeholder="nome@email.it"
            aiuto={perCliente ? 'Lì arriva il link per pagare, poi il QR del tavolo.' : 'Lì arrivano la conferma e il QR del tavolo.'} />
          <div className="mm-campi-2">
            <Campo id="tv-telefono" nome="telefono" etichetta="Telefono" tipo="tel" errore={e.telefono} valore={v.telefono} autoComplete={perCliente ? 'off' : 'tel'} aiuto="Se serve contattarti per il tavolo." />
            <Campo id="tv-persone" nome="persone" etichetta="Quante persone" errore={e.persone} valore={v.persone} inputMode="numeric" aiuto={sel?.posti != null ? `Al massimo ${sel.posti}.` : undefined} />
          </div>

          <label className="mm-prevendita__legale" htmlFor="tv-privacy">
            <input type="checkbox" id="tv-privacy" name="privacy" required defaultChecked={v.privacy === '1'} aria-invalid={Boolean(e.privacy)} />
            <span>{perCliente ? 'Il cliente ha letto l’' : 'Ho letto l’'}<Link href="/privacy" target="_blank">informativa privacy</Link> e i <Link href="/condizioni" target="_blank">termini</Link>.</span>
          </label>
          {e.privacy && <span className="-mt-2 text-[14px] leading-5 text-stop-testo">{e.privacy}</span>}

          <button type="submit" className="mm-btn mm-btn--clip mm-btn--primario mm-btn--pieno" style={{ minHeight: 56 }} disabled={inCorso || !sel}>
            {inCorso ? 'Un attimo…' : <>{perCliente ? 'Manda il link per pagare' : 'Continua al pagamento'} <span className="mm-btn__freccia" aria-hidden="true">→</span></>}
          </button>
          <span className="text-center font-mono text-[11px] leading-4 text-osso-2">
            {perCliente ? `AL CLIENTE ARRIVA IL LINK PER PAGARE · IL TAVOLO RESTA FERMO FINO A ${scadenza.toUpperCase()}`
              : `SI PAGA ONLINE ORA · CARTA, APPLE PAY, GOOGLE PAY · IL TAVOLO RESTA FERMO ${scadenza.toUpperCase()}`}
          </span>
        </form>
      )}
    </div>
  );
}

function Campo(p: {
  id: string; nome: string; etichetta: string; errore?: string; valore?: string; tipo?: string; autoComplete?: string; placeholder?: string; aiuto?: string; inputMode?: 'numeric';
}) {
  const descr = p.errore || p.aiuto ? `${p.id}-aiuto` : undefined;
  return (
    <div className={`mm-campo ${p.errore ? 'mm-campo--errore' : ''}`}>
      <label className="mm-campo__etichetta" htmlFor={p.id}>{p.etichetta}</label>
      <input className="mm-campo__input" id={p.id} name={p.nome} type={p.tipo ?? 'text'} autoComplete={p.autoComplete} placeholder={p.placeholder} inputMode={p.inputMode}
        defaultValue={p.valore} aria-invalid={Boolean(p.errore)} aria-describedby={descr} autoCapitalize={p.tipo === 'email' ? 'none' : 'words'} />
      {descr && <span className="mm-campo__aiuto" id={descr}>{p.errore ?? p.aiuto}</span>}
    </div>
  );
}
