'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePorta, nuovoId } from './store';
import { Fotocamera } from './fotocamera';
import { cercaPerNome, decidiIngresso, entratiVoce, personeVoce, trovaVoce, type EsitoPorta, type VocePorta } from '@/lib/porta-logica';
import type { MetodoPagamento } from '@/lib/dati/tipi';
import { etichettaCanale } from '@/lib/canali';
import { SchermoCassa } from './cassa';
import type { DatiCassa } from '@/lib/porta-logica';

// Scanner della porta (mockup Porta 1–5). Tutto il controllo avviene sul telefono con l'elenco salvato:
// funziona anche senza campo, e gli ingressi si sincronizzano appena torna la connessione.

interface EventoPorta { id: string; nome: string; data: string; numero: number | null; etaMinima: number; prezzoCassa: number; cassa: boolean }

type Schermo =
  | { tipo: 'scanner' }
  | { tipo: 'cerca' }
  | { tipo: 'cassa' }
  | { tipo: 'impostazioni' }
  | { tipo: 'esito'; esito: EsitoPorta };

const oraDi = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const euro = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;
const nascita = (ymd: string) => ymd.split('-').reverse().join('.');
function anni(ymd: string) {
  const [a, m, g] = ymd.split('-').map(Number);
  const o = new Date();
  return o.getFullYear() - a - (o.getMonth() + 1 < m || (o.getMonth() + 1 === m && o.getDate() < g) ? 1 : 0);
}

export function Porta({ eventi, email, esci }: { eventi: EventoPorta[]; email: string; esci: () => Promise<void> }) {
  const st = usePorta();
  const [pronto, setPronto] = useState(false);
  const [schermo, setSchermo] = useState<Schermo>({ tipo: 'scanner' });
  const [torcia, setTorcia] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPagamento>('porta_contanti');
  const [codice, setCodice] = useState('');
  const [q, setQ] = useState('');
  const ritorno = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Evento di default: quello salvato, altrimenti il più vicino.
  useEffect(() => {
    usePorta.persist.rehydrate();
    setPronto(true);
  }, []);
  useEffect(() => {
    if (!pronto) return;
    if (!st.eventoId || !eventi.some((e) => e.id === st.eventoId)) { if (eventi[0]) st.scegliEvento(eventi[0].id); }
  }, [pronto, eventi, st]);

  // Sincronizza all'avvio, ogni 10 secondi, al ritorno della rete e quando il telefono si riaccende.
  useEffect(() => {
    if (!pronto || !st.eventoId) return;
    const sync = () => { void usePorta.getState().sincronizza(); };
    sync();
    const t = setInterval(sync, 10_000);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(t); window.removeEventListener('online', sync); document.removeEventListener('visibilitychange', sync); };
  }, [pronto, st.eventoId]);

  const evento = eventi.find((e) => e.id === st.eventoId) ?? null;
  // Cassa alla porta: vale l'ultima sincronizzazione (l'admin la può cambiare durante la serata), offline quella salvata.
  const cassaAttiva = Boolean(evento && (st.cassa ?? evento.cassa));
  // Si contano le persone: un tavolo vale per tutto il suo gruppo. I tavoli non ancora pagati non contano.
  const contate = st.elenco.filter((v) => (!v.tavolo || v.tavolo.pagato) && v.stato !== 'in_attesa');
  const totale = contate.reduce((n, v) => n + personeVoce(v), 0);
  const entrati = contate.reduce((n, v) => n + entratiVoce(v), 0);

  const mostra = useCallback((esito: EsitoPorta) => {
    clearTimeout(ritorno.current);
    setSchermo({ tipo: 'esito', esito });
    // Dopo un ingresso riuscito torna da solo allo scanner (mockup: 2 secondi). Con una categoria da controllare resta a schermo.
    if (esito.esito === 'entrato' && !esito.voce.categoria) {
      ritorno.current = setTimeout(() => setSchermo({ tipo: 'scanner' }), 2000);
    }
  }, []);

  const entra = useCallback((v: VocePorta) => {
    const s = usePorta.getState();
    const { esito, aggiornata } = decidiIngresso(v, { metodo, porta: s.porta, ora: new Date().toISOString() });
    if (aggiornata) {
      s.applicaLocale(aggiornata, { idLocale: nuovoId(), voceId: v.id, chiave: v.id, metodo, ora: aggiornata.oraCheckIn! });
    }
    mostra(esito);
  }, [metodo, mostra]);

  /** Ingresso in cassa: entra subito sul telefono, il server lo registra alla prossima sincronizzazione. */
  const registraCassa = useCallback((dati: DatiCassa) => {
    const s = usePorta.getState();
    const id = nuovoId();
    const ora = new Date().toISOString();
    const voce: VocePorta = {
      id: `cassa-${id}`, token: '', codice: '', nome: dati.nome, cognome: dati.cognome, dataNascita: dati.dataNascita,
      stato: 'entrato', importo: dati.importo, oraCheckIn: ora, porta: s.porta, lista: 'Cassa', canale: 'cassa', origine: 'cassa',
    };
    s.aggiungiCassa(voce, { idLocale: id, voceId: voce.id, chiave: '', metodo, ora, cassa: dati });
    mostra({ esito: 'entrato', voce, incassato: dati.importo, ora, primaPagato: false });
  }, [metodo, mostra]);

  const leggiChiave = useCallback(async (chiave: string) => {
    let v = trovaVoce(usePorta.getState().elenco, chiave);
    if ((!v || v.stato === 'in_attesa') && navigator.onLine) {
      // Forse ha pagato dopo l'ultimo salvataggio: riscarichiamo l'elenco e riproviamo.
      await usePorta.getState().sincronizza();
      v = trovaVoce(usePorta.getState().elenco, chiave);
    }
    if (!v) {
      const salvato = usePorta.getState().salvatoAlle;
      mostra({ esito: 'non_valido', motivo: chiave.startsWith('MM1.') ? `Non è in elenco${salvato ? ` (salvato alle ${oraDi(salvato)})` : ''}` : 'Codice non trovato' });
      return;
    }
    entra(v);
  }, [entra, mostra]);

  /** "Riprova" dopo un "Non pagato": magari ha appena pagato dal telefono. */
  const riprova = useCallback(async (v: VocePorta) => {
    await usePorta.getState().sincronizza();
    entra(trovaVoce(usePorta.getState().elenco, v.id) ?? v);
  }, [entra]);

  useEffect(() => () => clearTimeout(ritorno.current), []);

  const risultati = useMemo(() => cercaPerNome(st.elenco, q), [st.elenco, q]);

  if (!pronto) return <div className="min-h-dvh bg-vinile" />;

  const colori = schermo.tipo === 'esito'
    ? { entrato: 'bg-ok text-su-stato', non_pagato: 'bg-attesa text-su-stato', gia_entrato: 'bg-stop text-osso', annullato: 'bg-stop text-osso', non_valido: 'bg-stop text-osso' }[schermo.esito.esito]
    : schermo.tipo === 'cerca' || schermo.tipo === 'impostazioni' || schermo.tipo === 'cassa' ? 'bg-notte text-osso' : 'bg-vinile text-osso';
  const suPieno = schermo.tipo === 'esito';

  return (
    <div className={`flex min-h-dvh flex-col ${colori} transition-colors duration-cambio`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Testata con contatore ingressi */}
      <button type="button" onClick={() => setSchermo({ tipo: 'impostazioni' })} className="flex flex-none flex-col gap-[10px] border-0 bg-transparent px-4 pt-[14px] text-left text-current" aria-label="Impostazioni della porta">
        <span className="flex w-full items-center gap-[10px]">
          <span className="flex-grow text-[11px] font-semibold leading-none tracking-logo">{st.porta.replace('P', 'PORTA ')} · {(evento?.nome ?? 'SCEGLI LA SERATA').toUpperCase()}</span>
          <span className="font-mono text-[12px] font-medium leading-none" aria-label={`${entrati} entrati su ${totale}`}>
            {entrati}<span className={suPieno ? 'opacity-50' : 'text-osso-3'}>/{totale}</span>
          </span>
        </span>
        <span className={`block h-[3px] w-full ${suPieno ? 'bg-[rgba(5,5,5,.18)]' : 'bg-notte-3'}`}>
          <span className={`block h-full ${suPieno ? (colori.includes('text-osso') ? 'bg-osso' : 'bg-vinile') : 'bg-arancio'}`} style={{ width: `${totale ? (entrati / totale) * 100 : 0}%` }} />
        </span>
      </button>

      {st.serveAccesso && (
        <a href="/accedi?dopo=/door" className="mx-4 mt-3 block border border-attesa p-3 text-[14px] text-attesa no-underline">Accesso scaduto: gli ingressi restano salvati sul telefono. Tocca qui per rientrare.</a>
      )}

      {schermo.tipo === 'scanner' && (
        <>
          <div className="flex flex-grow flex-col items-center justify-center gap-[22px] px-4">
            <div className="relative h-[300px] w-[300px] max-w-full overflow-hidden">
              <div className="mm-disco absolute inset-0 opacity-50" style={{ boxShadow: 'none' }}><div className="mm-disco__foro" style={{ background: 'var(--vinile)' }} /></div>
              <Fotocamera attiva={Boolean(evento)} onLettura={leggiChiave} torcia={torcia} />
              <div className="mm-mirino pointer-events-none absolute inset-0"><i /><i /><i /><i /></div>
            </div>
            <span className="font-display text-[40px] font-black uppercase leading-none">Inquadra il QR</span>
            <form className="flex w-full max-w-[300px] gap-2" onSubmit={(e) => { e.preventDefault(); if (codice.trim()) { void leggiChiave(codice.trim()); setCodice(''); } }}>
              <label htmlFor="porta-codice" className="sr-only">Codice del biglietto</label>
              <input id="porta-codice" value={codice} onChange={(e) => setCodice(e.target.value)} placeholder="o scrivi il codice"
                autoCapitalize="characters" autoComplete="off" className="mm-campo__input text-center font-mono" style={{ height: 44, fontSize: 16 }} />
              <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 44, padding: '0 14px' }}>OK</button>
            </form>
            <StatoRete />
          </div>
          <div className="flex flex-none px-4 pb-[10px]">
            {cassaAttiva ? (
              <button type="button" className="mm-btn mm-btn--primario flex-grow" style={{ minHeight: 56 }} onClick={() => setSchermo({ tipo: 'cassa' })}>
                Ingresso in cassa{evento && evento.prezzoCassa > 0 ? ` · ${euro(evento.prezzoCassa)}` : ''}
              </button>
            ) : evento && (
              <span className="flex-grow border border-linea-forte px-4 py-3 text-center font-mono text-[12px] leading-4 text-osso-2">SOLO PREVENDITA · NIENTE CASSA STASERA</span>
            )}
          </div>
          <div className="flex flex-none gap-[10px] px-4 pb-7">
            <button type="button" className="mm-btn mm-btn--linea flex-grow" style={{ minHeight: 60 }} onClick={() => { setQ(''); setSchermo({ tipo: 'cerca' }); }}>Cerca per nome</button>
            <button type="button" aria-label={torcia ? 'Spegni la torcia' : 'Accendi la torcia'} aria-pressed={torcia} onClick={() => setTorcia(!torcia)}
              className={`grid h-[60px] w-[60px] flex-none place-items-center rounded-sm border border-linea-forte p-0 ${torcia ? 'bg-osso text-notte' : 'bg-notte-3 text-osso'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 2h8l-1 6H9L8 2z" /><path d="M9 8h6v4l-2 10h-2L9 12V8z" /></svg>
            </button>
          </div>
        </>
      )}

      {schermo.tipo === 'cerca' && (
        <div className="flex flex-grow flex-col gap-4 px-4 pt-5">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Torna allo scanner" onClick={() => setSchermo({ tipo: 'scanner' })} className="grid h-11 w-11 flex-none place-items-center border-0 bg-transparent p-0 text-osso">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <h1 className="m-0 font-display text-[36px] font-black uppercase leading-none">Cerca per nome</h1>
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="pc-cerca">Nome, cognome o data di nascita</label>
            <input className="mm-campo__input" id="pc-cerca" value={q} onChange={(e) => setQ(e.target.value)} autoFocus autoComplete="off" style={{ height: 60, fontSize: 22 }} />
          </div>
          {q && <span className="font-mono text-[11px] leading-[14px] text-osso-2">{risultati.length} RISULTATI · CONTROLLA LA DATA DI NASCITA SUL DOCUMENTO</span>}
          <div className="flex flex-col border-b border-linea">
            {risultati.map((v) => {
              const dentro = v.stato === 'entrato';
              const chip = v.tavolo && v.stato !== 'annullato' ? (v.tavolo.pagato ? [dentro ? 'mm-chip mm-chip--entrato' : 'mm-chip mm-chip--pagato', `Tavolo · ${v.tavolo.entrati}/${v.tavolo.persone} entrati`] : ['mm-chip mm-chip--incassare', 'Tavolo non pagato'])
                : dentro ? ['mm-chip mm-chip--entrato', `Entrato ${v.oraCheckIn ? oraDi(v.oraCheckIn) : ''}`]
                : v.stato === 'annullato' || v.stato === 'rimborsato' ? ['mm-chip mm-chip--annullato', 'Annullato']
                  : v.stato === 'pagato' ? ['mm-chip mm-chip--pagato', 'Pagato']
                    : v.stato === 'in_attesa' ? ['mm-chip mm-chip--incassare', 'Non pagato'] : ['mm-chip mm-chip--lista', 'In lista'];
              return (
                <div key={v.id} className="flex items-center gap-3 border-t border-linea py-4">
                  <div className="flex min-w-0 flex-grow flex-col gap-[6px]">
                    <span className="font-display text-[24px] font-extrabold uppercase leading-none">{v.nome} {v.cognome}</span>
                    <span className="font-mono text-[11px] leading-[14px] text-osso-2">{v.tavolo ? `TAVOLO ${v.tavolo.nome.toUpperCase()}` : nascita(v.dataNascita)}{v.categoria ? ` · ${v.categoria.toUpperCase()}` : ''} · {testoLista(v).replace('Lista: ', '').toUpperCase()}</span>
                    <span className={`${chip[0]} self-start`}>{chip[1]}</span>
                  </div>
                  {!dentro && v.stato !== 'annullato' && v.stato !== 'rimborsato' && (!v.tavolo || v.tavolo.pagato) && (
                    <button type="button" className="mm-btn mm-btn--primario" style={{ minHeight: 48, padding: '0 16px', fontSize: 13 }} onClick={() => entra(v)}>Apri</button>
                  )}
                </div>
              );
            })}
            {q && risultati.length === 0 && <p className="border-t border-linea py-4 text-osso-2">Nessuno con questo nome in elenco.</p>}
          </div>
        </div>
      )}

      {schermo.tipo === 'cassa' && evento && cassaAttiva && (
        <SchermoCassa evento={evento} elenco={st.elenco} metodo={metodo} setMetodo={setMetodo}
          onRegistra={registraCassa} onApri={(v) => entra(v)} onChiudi={() => setSchermo({ tipo: 'scanner' })} />
      )}

      {schermo.tipo === 'impostazioni' && (
        <div className="flex flex-grow flex-col gap-6 px-4 pt-6">
          <h1 className="m-0 font-display text-[36px] font-black uppercase leading-none">Porta</h1>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="imp-evento">Serata</label>
            <select id="imp-evento" className="mm-campo__input" value={st.eventoId ?? ''} onChange={(e) => st.scegliEvento(e.target.value)}>
              {eventi.map((e) => <option key={e.id} value={e.id}>{new Date(e.data).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' })} · {e.nome}</option>)}
            </select>
          </div>
          <div className="mm-campo">
            <span className="mm-campo__etichetta" id="imp-porta">Questa porta</span>
            <div role="radiogroup" aria-labelledby="imp-porta" className="grid grid-cols-4 border border-linea-forte">
              {['P1', 'P2', 'P3', 'P4'].map((p) => (
                <button key={p} type="button" role="radio" aria-checked={st.porta === p} onClick={() => st.scegliPorta(p)}
                  className={`h-12 border-0 font-mono text-[14px] ${st.porta === p ? 'bg-osso text-notte' : 'bg-transparent text-osso'}`}>{p}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1 font-mono text-[12px] leading-5 text-osso-2">
            <span>ELENCO: {st.elenco.length} NOMI{st.salvatoAlle ? ` · SALVATO ${oraDi(st.salvatoAlle)}` : ''}</span>
            <span>CASSA ALLA PORTA: {cassaAttiva ? 'SÌ' : 'NO, SOLO PREVENDITA'}</span>
            <span>IN CODA: {st.coda.length}{st.conflitti ? ` · GIÀ ENTRATI DA ALTRE PORTE: ${st.conflitti}` : ''}</span>
            <span>STAFF: {email}</span>
          </div>
          <button type="button" className="mm-btn mm-btn--linea mm-btn--pieno" onClick={() => void st.sincronizza()}>Aggiorna ora</button>
          <a href={`/gestione/pr${st.eventoId ? `?serata=${st.eventoId}` : ''}`} className="mm-btn mm-btn--linea mm-btn--pieno">Attività PR</a>
          <button type="button" className="mm-btn mm-btn--primario mm-btn--pieno" onClick={() => setSchermo({ tipo: 'scanner' })}>Torna allo scanner</button>
          <form action={esci}><button type="submit" className="mm-btn mm-btn--muto" disabled={st.coda.length > 0}>{st.coda.length ? 'Esci (prima sincronizza)' : 'Esci'}</button></form>
        </div>
      )}

      {schermo.tipo === 'esito' && (
        <Esito esito={schermo.esito} cassa={cassaAttiva} online={st.online} salvatoAlle={st.salvatoAlle}
          onRiprova={() => { if (schermo.esito.esito === 'non_pagato') void riprova(schermo.esito.voce); }}
          onCassa={() => setSchermo({ tipo: 'cassa' })}
          onChiudi={() => { clearTimeout(ritorno.current); setSchermo({ tipo: 'scanner' }); }} />
      )}
    </div>
  );
}

/** "Lista: Maremma Musica · da Instagram": senza PR si vede da dove è arrivato. */
function testoLista(v: VocePorta) {
  if (v.origine === 'cassa') return 'Ingresso in cassa · senza lista';
  const canale = v.canale && v.canale !== 'diretto' ? ` · da ${etichettaCanale(v.canale)}` : '';
  return `Lista: ${v.lista}${v.lista === 'Maremma Musica' ? canale : ''}`;
}

function StatoRete() {
  const { online, salvatoAlle, coda } = usePorta();
  const ok = online && coda.length === 0;
  return (
    <span className="flex items-center gap-2 font-mono text-[11px] leading-4 text-osso-2" role="status">
      <span className={`h-2 w-2 flex-none rounded-full ${ok ? 'bg-ok' : 'bg-attesa'}`} />
      {online ? '' : 'SENZA RETE · '}
      {salvatoAlle ? `ELENCO SALVATO ${oraDi(salvatoAlle)}` : 'ELENCO NON ANCORA SCARICATO'}
      {coda.length ? ` · ${coda.length} IN CODA` : ' · FUNZIONA OFFLINE'}
    </span>
  );
}

function Esito({ esito, cassa, online, salvatoAlle, onRiprova, onCassa, onChiudi }: {
  esito: EsitoPorta; cassa: boolean; online: boolean; salvatoAlle: string | null; onRiprova: () => void; onCassa: () => void; onChiudi: () => void;
}) {
  const linea = 'my-[10px] h-px bg-current opacity-30';
  const X = <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

  if (esito.esito === 'entrato') {
    const v = esito.voce;
    const incasso = esito.incassato > 0;
    return (
      <>
        <div role="status" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
          <svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
          <span className="font-mono text-[13px] font-medium leading-[18px]">
            {v.tavolo ? `TAVOLO ${v.tavolo.nome.toUpperCase()} · PAGATO` : incasso ? `${euro(esito.incassato)} INCASSATI` : esito.primaPagato ? 'PAGATO' : v.importo > 0 ? 'PAGATO' : 'INGRESSO LIBERO'} · {oraDi(esito.ora)}
          </span>
          <span className="font-display text-[104px] font-black uppercase leading-[.8]">{incasso ? 'Entrato' : 'Valido'}</span>
          {v.categoria && (
            <div className="border-[3px] border-current px-3 py-2" role="alert">
              <span className="block font-mono text-[11px] font-medium leading-4">CONTROLLA IL DOCUMENTO · PREVENDITA RISERVATA</span>
              <span className="block font-display text-[56px] font-black uppercase leading-[.9]">{v.categoria}</span>
            </div>
          )}
          {/* Un QR per tutto il tavolo: ogni passaggio è una persona. */}
          {v.tavolo && <span className="font-display text-[56px] font-black uppercase leading-[.85]">{v.tavolo.entrati} di {v.tavolo.persone}</span>}
          <div className={linea} />
          <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>
          <span className="text-[17px] font-medium leading-6">{testoLista(v)}</span>
        </div>
        <div className="flex flex-none flex-col gap-3 px-4 pb-7">
          <div className="h-[3px] bg-[rgba(5,5,5,.18)]"><div className="h-full bg-vinile" style={v.categoria ? { width: 0 } : { animation: 'mm-barra 2s linear forwards' }} /></div>
          <button type="button" className="mm-btn" style={{ background: 'var(--vinile)', color: 'var(--osso)', minHeight: 64, fontSize: 17 }} onClick={onChiudi}>Prossimo</button>
          <span className="text-center font-mono text-[11px] font-medium leading-[14px]">{v.categoria ? 'TOCCA PROSSIMO QUANDO HAI CONTROLLATO' : 'TORNO ALLO SCANNER TRA 2 S'}</span>
        </div>
      </>
    );
  }

  // Prevendita chiesta ma non pagata: alla porta non si incassa. Paga dal telefono (poi "Riprova") o passa dalla cassa.
  if (esito.esito === 'non_pagato') {
    const v = esito.voce;
    return (
      <>
        <div role="status" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
          <span className="font-mono text-[13px] font-medium leading-[18px]">PREVENDITA NON PAGATA{!online && salvatoAlle ? ` · ELENCO DELLE ${oraDi(salvatoAlle)}` : ''}</span>
          <span className="font-display text-[100px] font-black uppercase leading-[.8]">Non<br />pagato</span>
          <div className={linea} />
          <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>
          <span className="font-mono text-[13px] font-medium leading-[18px]">NASCITA {nascita(v.dataNascita)} · {anni(v.dataNascita)} ANNI</span>
          <span className="text-[17px] font-medium leading-6">
            {online
              ? `Può pagarla ora dal telefono: rifà la prevendita sul sito con gli stessi dati (ritrova il suo posto), poi tocca Riprova.${cassa ? ' Oppure passa dalla cassa.' : ' Stasera non c’è cassa: senza prevendita pagata non entra.'}`
              : 'Senza rete: se ha pagato dopo l’ultimo aggiornamento non lo vediamo ancora. Aspetta che torni la rete e tocca Riprova.'}
          </span>
        </div>
        <div className="flex flex-none flex-col gap-2 px-4 pb-7">
          <button type="button" className="mm-btn" style={{ background: 'var(--vinile)', color: 'var(--osso)', minHeight: 64, fontSize: 17 }} onClick={onRiprova}>Riprova</button>
          {cassa && <button type="button" className="mm-btn" style={{ border: '1px solid var(--vinile)', color: 'var(--vinile)', minHeight: 52 }} onClick={onCassa}>Ingresso in cassa</button>}
          <button type="button" className="mm-btn" style={{ color: 'var(--vinile)', minHeight: 48 }} onClick={onChiudi}>Non entra</button>
        </div>
      </>
    );
  }

  const v = 'voce' in esito ? esito.voce : null;
  const pieno = esito.esito === 'gia_entrato' && esito.voce.tavolo ? esito.voce.tavolo : null;
  const dettaglio = pieno ? `TAVOLO ${pieno.nome.toUpperCase()} · ${pieno.entrati} DI ${pieno.persone} GIÀ ENTRATI`
    : esito.esito === 'gia_entrato'
    ? `STESSO QR · ENTRATO ${esito.voce.oraCheckIn ? oraDi(esito.voce.oraCheckIn) : ''}${esito.voce.porta ? ` · ${esito.voce.porta.replace('P', 'PORTA ')}` : ''}`
    : esito.esito === 'annullato' ? 'QR ANNULLATO DALLA CREW' : esito.motivo.toUpperCase();
  return (
    <>
      <div role="alert" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
        {X}
        <span className="font-mono text-[13px] font-medium leading-[18px]">{dettaglio}</span>
        <span className="font-display text-[100px] font-black uppercase leading-[.8]">{pieno ? <>Tavolo<br />pieno</> : esito.esito === 'gia_entrato' ? <>Già<br />entrato</> : <>Non<br />valido</>}</span>
        <div className={linea} />
        {v && <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>}
        <span className="text-[17px] font-medium leading-6">
          {pieno ? 'Il tavolo è al completo: con questo QR non entra più nessuno. Chi è in più passa dalla cassa.'
            : esito.esito === 'non_valido' && esito.motivo.startsWith('Tavolo') ? 'La prenotazione non è stata pagata: il QR non vale. Chiama la crew.'
            : esito.esito === 'non_valido' && !online && esito.motivo.startsWith('Non è in elenco') ? 'Senza rete: chi ha pagato dopo l’ultimo aggiornamento non è ancora in elenco. Aspetta che torni la rete e riprova.'
            : esito.esito === 'gia_entrato' ? 'Controlla il documento. Se è un’altra persona, il QR è stato girato: non entra.'
            : esito.esito === 'annullato' ? 'Questa iscrizione è stata annullata: non entra con questo QR.'
              : 'Controlla il documento e prova con "Cerca per nome".'}
        </span>
      </div>
      <div className="flex flex-none px-4 pb-7">
        <button type="button" className="mm-btn mm-btn--linea flex-grow" style={{ minHeight: 64, fontSize: 17, borderColor: 'currentColor', color: 'inherit' }} onClick={onChiudi}>Torna allo scanner</button>
      </div>
    </>
  );
}
