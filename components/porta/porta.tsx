'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePorta, nuovoId } from './store';
import { Fotocamera } from './fotocamera';
import { categoriaDaControllare, cercaPerNome, decidiIngresso, entratiVoce, personeVoce, trovaVoce, type EsitoPorta, type SerataBiglietto, type VocePorta } from '@/lib/porta-logica';
import { etichettaCanale } from '@/lib/canali';

// Scanner della porta (mockup Porta 1–5). Tutto il controllo avviene sul telefono con l'elenco salvato:
// funziona anche senza campo, e gli ingressi si sincronizzano appena torna la connessione.

interface EventoPorta { id: string; nome: string; data: string; numero: number | null; etaMinima: number; limite: string | null; senzaTelefono: boolean }

type Schermo =
  | { tipo: 'scanner' }
  | { tipo: 'cerca' }
  | { tipo: 'impostazioni' }
  | { tipo: 'esito'; esito: EsitoPorta };

const SCANNER: Schermo = { tipo: 'scanner' };

const oraDi = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const giornoMese = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });
const nascita = (ymd: string) => ymd.split('-').reverse().join('.');
function anni(ymd: string) {
  const [a, m, g] = ymd.split('-').map(Number);
  const o = new Date();
  return o.getFullYear() - a - (o.getMonth() + 1 < m || (o.getMonth() + 1 === m && o.getDate() < g) ? 1 : 0);
}

export function Porta({ eventi, email, admin, esci }: { eventi: EventoPorta[]; email: string; admin: boolean; esci: () => Promise<void> }) {
  const st = usePorta();
  const [pronto, setPronto] = useState(false);
  const [schermo, setSchermo] = useState<Schermo>({ tipo: 'scanner' });
  const [torcia, setTorcia] = useState(false);
  const [daInstallare, setDaInstallare] = useState(false);
  useEffect(() => { setDaInstallare(!window.matchMedia('(display-mode: standalone)').matches); }, []);
  const [codice, setCodice] = useState('');
  const [q, setQ] = useState('');
  const [confermaEsci, setConfermaEsci] = useState(false);
  const [inSospeso, setInSospeso] = useState<{ eventoId: string; chiave: string } | null>(null); // QR da rileggere dopo "Cambia serata"
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
  // Orario limite della prevendita: vale l'ultima sincronizzazione (l'admin lo può cambiare durante la serata), offline quello salvato.
  // Il controllo usa l'orologio del telefono; il server lo rifà comunque quando riceve l'ingresso.
  const limite = evento ? st.limite ?? evento.limite : null;
  // Serata senza telefono: niente scanner, la porta parte dalla ricerca per cognome e controlla il documento.
  const senzaTelefono = Boolean(evento?.senzaTelefono);
  // Si contano le persone: un tavolo vale per tutto il suo gruppo. I tavoli non ancora pagati e le prevendite non completate non contano.
  // Gli ingressi in cassa storici (di quando la cassa esisteva) non sono nella lista e non fanno salire il totale.
  const contate = st.elenco.filter((v) => v.origine !== 'cassa' && (!v.tavolo || v.tavolo.pagato) && v.stato !== 'in_attesa');
  const totale = contate.reduce((n, v) => n + personeVoce(v), 0);
  const entrati = contate.reduce((n, v) => n + entratiVoce(v), 0);

  const mostra = useCallback((esito: EsitoPorta) => {
    clearTimeout(ritorno.current);
    setSchermo({ tipo: 'esito', esito });
    // Dopo un ingresso riuscito (o un "Non rientra") torna da solo allo scanner (mockup: 2 secondi).
    // Nelle serate senza telefono "scanner" è la ricerca per cognome, che riparte vuota per il prossimo.
    if (esito.esito === 'entrato' || esito.esito === 'rifiutato') {
      ritorno.current = setTimeout(() => { if (senzaTelefono) setQ(''); setSchermo(SCANNER); }, 2000);
    }
  }, [senzaTelefono]);

  /** `confermato`: lo staff ha toccato "Fai entrare" dopo aver controllato la categoria. */
  const entra = useCallback((v: VocePorta, confermato = false) => {
    const s = usePorta.getState();
    const { esito, aggiornata } = decidiIngresso(v, { porta: s.porta, ora: new Date().toISOString(), confermato, documento: senzaTelefono, limite });
    if (aggiornata) {
      s.applicaLocale(aggiornata, { idLocale: nuovoId(), voceId: v.id, chiave: v.id, ora: aggiornata.oraCheckIn!, ...(confermato ? { conferma: true } : {}) });
    }
    mostra(esito);
  }, [limite, mostra, senzaTelefono]);

  /** "Non rientra": nessun ingresso, il rifiuto va in coda come gli ingressi (anche offline) e l'iscrizione resta valida. */
  const rifiuta = useCallback((v: VocePorta) => {
    const s = usePorta.getState();
    const ora = new Date().toISOString();
    const aggiornata: VocePorta = { ...v, rifiuto: { ora, porta: s.porta, da: 'staff' } };
    s.applicaLocale(aggiornata, { idLocale: nuovoId(), voceId: v.id, chiave: v.id, ora, rifiuto: true });
    mostra({ esito: 'rifiutato', voce: aggiornata });
  }, [mostra]);

  const leggiChiave = useCallback(async (chiave: string) => {
    let v = trovaVoce(usePorta.getState().elenco, chiave);
    if ((!v || v.stato === 'in_attesa') && navigator.onLine) {
      // Forse ha pagato dopo l'ultimo salvataggio: riscarichiamo l'elenco e riproviamo.
      await usePorta.getState().sincronizza();
      v = trovaVoce(usePorta.getState().elenco, chiave);
    }
    if (!v) {
      // Un QR firmato può essere di un'altra serata: lo chiediamo al server (serve la rete; offline il token non dice la serata).
      if (chiave.startsWith('MM1.') && navigator.onLine) {
        const serata = await altraSerata(chiave, usePorta.getState().eventoId);
        if (serata) { mostra({ esito: 'altra_serata', serata, chiave }); return; }
      }
      const salvato = usePorta.getState().salvatoAlle;
      mostra({ esito: 'non_valido', motivo: chiave.startsWith('MM1.') ? `Non è in elenco${salvato ? ` (salvato alle ${oraDi(salvato)})` : ''}` : 'Codice non trovato' });
      return;
    }
    entra(v);
  }, [entra, mostra]);

  /** "Cambia serata →": passa all'altra serata e rilegge lo stesso QR appena arriva il suo elenco. */
  const cambiaSerata = useCallback(async (serata: SerataBiglietto, chiave: string) => {
    // Cambiare serata svuota la coda del telefono: prima si inviano gli ingressi ancora in sospeso.
    await usePorta.getState().sincronizza();
    if (usePorta.getState().coda.length > 0) {
      mostra({ esito: 'non_valido', motivo: 'Ci sono ingressi non ancora inviati: aspetta la sincronizzazione e riprova' });
      return;
    }
    usePorta.getState().scegliEvento(serata.id);
    setInSospeso({ eventoId: serata.id, chiave });
    setSchermo({ tipo: 'scanner' });
  }, [mostra]);
  useEffect(() => {
    if (!inSospeso || st.eventoId !== inSospeso.eventoId || !st.salvatoAlle) return;
    setInSospeso(null);
    void leggiChiave(inSospeso.chiave);
  }, [inSospeso, st.eventoId, st.salvatoAlle, leggiChiave]);

  /** "Riprova" dopo "Prevendita non completata": magari ha appena pagato dal telefono. */
  const riprova = useCallback(async (v: VocePorta) => {
    await usePorta.getState().sincronizza();
    entra(trovaVoce(usePorta.getState().elenco, v.id) ?? v);
  }, [entra]);

  useEffect(() => () => clearTimeout(ritorno.current), []);

  const risultati = useMemo(() => cercaPerNome(st.elenco, q), [st.elenco, q]);

  if (!pronto) return <div className="min-h-dvh bg-vinile" />;

  const colori = schermo.tipo === 'esito'
    ? { entrato: 'bg-ok text-su-stato', non_pagato: 'bg-attesa text-su-stato', oltre_orario: 'bg-stop text-osso', altra_serata: 'bg-attesa text-su-stato', gia_entrato: 'bg-stop text-osso', annullato: 'bg-stop text-osso', non_valido: 'bg-stop text-osso', da_confermare: 'bg-attesa text-su-stato', rifiutato: 'bg-stop text-osso' }[schermo.esito.esito]
    : schermo.tipo === 'cerca' || schermo.tipo === 'impostazioni' ? 'bg-notte text-osso' : 'bg-vinile text-osso';
  const suPieno = schermo.tipo === 'esito';

  return (
    // Sfondo a tutto schermo, contenuto in una colonna da telefono (480 px) centrata anche sui computer.
    <div className={`mm-interno min-h-dvh ${colori} transition-colors duration-cambio`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      {/* Navigazione leggera, come nel resto dell'area riservata: Esci sta sempre in alto a destra. Sparisce sulle schermate d'esito a tutto campo. */}
      {schermo.tipo !== 'esito' && (
        <nav aria-label="Area riservata" className="flex flex-none items-center border-b border-linea px-2">
          <span aria-current="page" className="flex min-h-[44px] items-center border-b-2 border-arancio px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-osso">Porta</span>
          {admin && <a href="/admin" className="flex min-h-[44px] items-center px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-osso-2 no-underline">Admin</a>}
          <span className="flex-grow" />
          <button type="button" onClick={() => setConfermaEsci(true)} className="flex min-h-[44px] items-center border-0 bg-transparent px-3 text-[11px] font-semibold uppercase tracking-[.12em] text-osso-2">Esci</button>
        </nav>
      )}
      {/* Testata con contatore ingressi */}
      <button type="button" onClick={() => setSchermo({ tipo: 'impostazioni' })} className="flex flex-none flex-col gap-[10px] border-0 bg-transparent px-4 pt-[14px] text-left text-current" aria-label="Impostazioni della porta">
        <span className="flex w-full items-center gap-[10px]">
          <span className="min-w-0 flex-grow truncate text-[11px] font-semibold leading-none tracking-logo">{st.porta.replace('P', 'PORTA ')} · {(evento?.nome ?? 'SCEGLI LA SERATA').toUpperCase()}</span>
          <span className="flex-none font-mono text-[12px] font-medium leading-none" aria-label={`In lista ${entrati} entrati su ${totale}`}>
            LISTA {entrati}<span className={suPieno ? 'opacity-50' : 'text-osso-3'}>/{totale}</span>
          </span>
        </span>
        <span className={`block h-[3px] w-full ${suPieno ? 'bg-[rgba(5,5,5,.18)]' : 'bg-notte-3'}`}>
          <span className={`block h-full ${suPieno ? (colori.includes('text-osso') ? 'bg-osso' : 'bg-vinile') : 'bg-arancio'}`} style={{ width: `${totale ? (entrati / totale) * 100 : 0}%` }} />
        </span>
      </button>

      {st.serveAccesso && (
        <a href="/accedi?dopo=/door" className="mx-4 mt-3 block border border-attesa p-3 text-[14px] text-attesa no-underline">Accesso scaduto: gli ingressi restano salvati sul telefono. Tocca qui per rientrare.</a>
      )}

      {schermo.tipo === 'scanner' && !senzaTelefono && (
        <>
          <div className="flex min-h-0 flex-grow flex-col items-center justify-center gap-3 px-4 py-2">
            <div className="relative aspect-square w-[min(300px,40dvh)] min-w-[170px] max-w-full overflow-hidden">
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
          <div className="flex flex-none flex-col gap-[10px] px-4 pb-5">
            <div className="flex gap-[10px]">
            <button type="button" className="mm-btn mm-btn--linea flex-grow" style={{ minHeight: 56 }} onClick={() => { setQ(''); setSchermo({ tipo: 'cerca' }); }}>Cerca per nome</button>
            <button type="button" aria-label={torcia ? 'Spegni la torcia' : 'Accendi la torcia'} aria-pressed={torcia} onClick={() => setTorcia(!torcia)}
              className={`grid h-[56px] w-[56px] flex-none place-items-center rounded-sm border border-linea-forte p-0 ${torcia ? 'bg-osso text-notte' : 'bg-notte-3 text-osso'}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 2h8l-1 6H9L8 2z" /><path d="M9 8h6v4l-2 10h-2L9 12V8z" /></svg>
            </button>
            </div>
          </div>
        </>
      )}

      {(schermo.tipo === 'cerca' || (schermo.tipo === 'scanner' && senzaTelefono)) && (
        <div className="flex flex-grow flex-col gap-4 px-4 pt-5">
          <div className="flex items-center gap-2">
            {!senzaTelefono && (
              <button type="button" aria-label="Torna allo scanner" onClick={() => setSchermo({ tipo: 'scanner' })} className="grid h-11 w-11 flex-none place-items-center border-0 bg-transparent p-0 text-osso">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
            )}
            <h1 className="m-0 font-display text-[36px] font-black uppercase leading-none">{senzaTelefono ? 'Cerca il cognome' : 'Cerca per nome'}</h1>
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="pc-cerca">{senzaTelefono ? 'Cognome (o nome)' : 'Nome, cognome o data di nascita'}</label>
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
                    : v.stato === 'in_attesa' ? ['mm-chip mm-chip--incassare', 'Prevendita non completata · non vale per entrare'] : ['mm-chip mm-chip--lista', 'In lista'];
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
          {senzaTelefono && (
            <div className="flex flex-col gap-3 pb-7">
              <StatoRete />
            </div>
          )}
        </div>
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
            {limite && <span>PREVENDITA VALIDA FINO ALLE {oraDi(limite)}</span>}
            <span>IN CODA: {st.coda.length}{st.conflitti ? ` · GIÀ ENTRATI DA ALTRE PORTE: ${st.conflitti}` : ''}</span>
            <span>STAFF: {email}</span>
          </div>
          <button type="button" className="mm-btn mm-btn--linea mm-btn--pieno" onClick={() => void st.sincronizza()}>Aggiorna ora</button>
          <button type="button" className="mm-btn mm-btn--primario mm-btn--pieno" onClick={() => setSchermo(SCANNER)}>Torna allo scanner</button>
          {daInstallare && <p className="m-0 font-mono text-[12px] leading-5 text-osso-2">PER APRIRE LA PORTA CON UN TOCCO: MENU DEL BROWSER → AGGIUNGI A HOME. L’INDIRIZZO È /door.</p>}
        </div>
      )}

      {schermo.tipo === 'esito' && (
        <Esito esito={schermo.esito} senzaTelefono={senzaTelefono} online={st.online} salvatoAlle={st.salvatoAlle}
          onRiprova={() => { if (schermo.esito.esito === 'non_pagato') void riprova(schermo.esito.voce); }}
          onCambiaSerata={() => { if (schermo.esito.esito === 'altra_serata') void cambiaSerata(schermo.esito.serata, schermo.esito.chiave); }}
          onFaiEntrare={() => { if (schermo.esito.esito === 'da_confermare') entra(schermo.esito.voce, true); }}
          onNonRientra={() => { if (schermo.esito.esito === 'da_confermare') rifiuta(schermo.esito.voce); }}
          onChiudi={() => { clearTimeout(ritorno.current); if (senzaTelefono) setQ(''); setSchermo(SCANNER); }} />
      )}

      {confermaEsci && (
        <div role="dialog" aria-modal="true" aria-labelledby="esci-titolo" className="fixed inset-0 z-50 grid place-items-end bg-[rgba(5,5,5,.8)] p-4 sm:place-items-center">
          <div className="flex w-full max-w-[420px] flex-col gap-4 border border-linea-forte bg-notte p-5 text-osso">
            <h2 id="esci-titolo" className="m-0 font-display text-[32px] font-black uppercase leading-none">Esci dalla porta?</h2>
            {st.coda.length > 0 ? (
              <p className="m-0 text-[15px] leading-5 text-attesa">Hai {st.coda.length} {st.coda.length === 1 ? 'ingresso non ancora inviato' : 'ingressi non ancora inviati'}: se esci ora restano sul telefono. Aspetta la sincronizzazione.</p>
            ) : (
              <p className="m-0 text-[15px] leading-5 text-osso-2">Dovrai rientrare con il link che ti arriva per email.</p>
            )}
            {st.coda.length > 0
              ? <button type="button" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 52 }} onClick={() => void st.sincronizza()}>Aggiorna ora</button>
              : <form action={esci}><button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 52 }}>Sì, esci</button></form>}
            <button type="button" className="mm-btn mm-btn--linea mm-btn--pieno" style={{ minHeight: 52 }} autoFocus onClick={() => setConfermaEsci(false)}>Resta</button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

/** Di quale serata è un QR che non è in elenco? Null se non si sa (rete assente, QR falso, serata non aperta alla porta) o se è questa. */
async function altraSerata(chiave: string, eventoId: string | null): Promise<SerataBiglietto | null> {
  try {
    const r = await fetch(`/api/door?biglietto=${encodeURIComponent(chiave)}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const { serata } = (await r.json()) as { serata: SerataBiglietto | null };
    return serata && serata.id !== eventoId ? serata : null;
  } catch {
    return null;
  }
}

/** "Lista: Maremma Musica · da Instagram": senza PR si vede da dove è arrivato. */
function testoLista(v: VocePorta) {
  if (v.origine === 'cassa') return 'Ingresso alla porta (storico) · senza lista';
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

function Esito({ esito, senzaTelefono, online, salvatoAlle, onRiprova, onCambiaSerata, onFaiEntrare, onNonRientra, onChiudi }: {
  esito: EsitoPorta; senzaTelefono: boolean; online: boolean; salvatoAlle: string | null; onRiprova: () => void; onCambiaSerata: () => void; onFaiEntrare: () => void; onNonRientra: () => void; onChiudi: () => void;
}) {
  const linea = 'my-[10px] h-px bg-current opacity-30';
  const indietro = senzaTelefono ? 'Torna alla ricerca' : 'Torna allo scanner';
  const X = <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

  if (esito.esito === 'entrato') {
    const v = esito.voce;
    return (
      <>
        <div role="status" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
          <svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
          <span className="font-mono text-[13px] font-medium leading-[18px]">
            {v.tavolo ? `TAVOLO ${v.tavolo.nome.toUpperCase()} · PAGATO` : esito.primaPagato ? 'PAGATO' : v.importo > 0 ? 'PAGATO' : 'INGRESSO LIBERO'} · {oraDi(esito.ora)}
          </span>
          <span className="font-display text-[104px] font-black uppercase leading-[.8]">Valido</span>
          {/* Un QR per tutto il tavolo: ogni passaggio è una persona. */}
          {v.tavolo && <span className="font-display text-[56px] font-black uppercase leading-[.85]">{v.tavolo.entrati} di {v.tavolo.persone}</span>}
          <div className={linea} />
          <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>
          <span className="text-[17px] font-medium leading-6">{testoLista(v)}{categoriaDaControllare(v) ? ` · ${v.categoria!.toUpperCase()} CONTROLLATA` : ''}</span>
        </div>
        <div className="flex flex-none flex-col gap-3 px-4 pb-7">
          <div className="h-[3px] bg-[rgba(5,5,5,.18)]"><div className="h-full bg-vinile" style={{ animation: 'mm-barra 2s linear forwards' }} /></div>
          <button type="button" className="mm-btn" style={{ background: 'var(--vinile)', color: 'var(--osso)', minHeight: 64, fontSize: 17 }} onClick={onChiudi}>Prossimo</button>
          <span className="text-center font-mono text-[11px] font-medium leading-[14px]">{senzaTelefono ? 'TORNO ALLA RICERCA TRA 2 S' : 'TORNO ALLO SCANNER TRA 2 S'}</span>
        </div>
      </>
    );
  }

  // Prevendita non completata (modulo compilato o link del PR, pagamento mai arrivato): non è una prevendita, non ha un QR e non vale per
  // entrare. Alla porta il sito non incassa: può comprarla ora dal suo telefono (poi "Riprova"), altrimenti non entra.
  if (esito.esito === 'non_pagato') {
    const v = esito.voce;
    return (
      <>
        <div role="status" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
          <span className="font-mono text-[13px] font-medium leading-[18px]">PREVENDITA NON COMPLETATA · NON VALE PER ENTRARE{!online && salvatoAlle ? ` · ELENCO DELLE ${oraDi(salvatoAlle)}` : ''}</span>
          <span className="font-display text-[72px] font-black uppercase leading-[.85]">Non<br />completata</span>
          <div className={linea} />
          <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>
          <span className="font-mono text-[13px] font-medium leading-[18px]">NASCITA {nascita(v.dataNascita)} · {anni(v.dataNascita)} ANNI</span>
          <span className="text-[17px] font-medium leading-6">
            {online
              ? 'Il pagamento non è arrivato: non ha un QR e non ha una prevendita valida. Può comprarla ora dal suo telefono (rifà la prevendita sul sito con gli stessi dati), poi tocca “Ha pagato ora? Riprova”.'
              : 'Senza rete: se ha pagato dopo l’ultimo aggiornamento non lo vediamo ancora. Aspetta che torni la rete e tocca “Ha pagato ora? Riprova”.'}
          </span>
        </div>
        <div className="flex flex-none flex-col gap-2 px-4 pb-7">
          <button type="button" className="mm-btn" style={{ background: 'var(--vinile)', color: 'var(--osso)', minHeight: 64, fontSize: 17 }} onClick={onRiprova}>Ha pagato ora? Riprova</button>
          <button type="button" className="mm-btn" style={{ color: 'var(--vinile)', minHeight: 48 }} onClick={onChiudi}>Non entra</button>
        </div>
      </>
    );
  }

  // Prevendita vera ma oltre l'orario limite: non registra nessun ingresso.
  if (esito.esito === 'oltre_orario') {
    const v = esito.voce;
    return (
      <>
        <div role="alert" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
          {X}
          <span className="font-mono text-[13px] font-medium leading-[18px]">PREVENDITA SCADUTA ALLE {oraDi(esito.limite)} · NON VALE PIÙ PER ENTRARE</span>
          <span className="font-display text-[88px] font-black uppercase leading-[.85]">Prevendita<br />scaduta</span>
          <div className={linea} />
          <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>
          <span className="text-[17px] font-medium leading-6">Il QR è valido, ma l’orario limite è passato: l’ingresso non è registrato. Se la crew lo fa entrare, l’ingresso si paga alla porta, fuori dal sito.</span>
        </div>
        <div className="flex flex-none flex-col gap-2 px-4 pb-7">
          <button type="button" className="mm-btn" style={{ background: 'var(--vinile)', color: 'var(--osso)', minHeight: 64, fontSize: 17 }} onClick={onChiudi}>{indietro}</button>
        </div>
      </>
    );
  }

  // Biglietto vero ma di un'altra serata: lo staff ha aperto la serata sbagliata.
  if (esito.esito === 'altra_serata') {
    const { serata } = esito;
    return (
      <>
        <div role="alert" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
          <span className="font-mono text-[13px] font-medium leading-[18px]">QR VALIDO · NON È DI QUESTA SERATA</span>
          <span className="font-display text-[88px] font-black uppercase leading-[.85]">Altra<br />serata</span>
          <div className={linea} />
          <span className="font-display text-[40px] font-black uppercase leading-[.95] [overflow-wrap:anywhere]">{serata.nome}</span>
          <span className="text-[17px] font-medium leading-6">Biglietto di {serata.nome} ({giornoMese(serata.data)}). Cambia serata e il QR si controlla lì.</span>
        </div>
        <div className="flex flex-none flex-col gap-2 px-4 pb-7">
          <button type="button" className="mm-btn" style={{ background: 'var(--vinile)', color: 'var(--osso)', minHeight: 64, fontSize: 17 }} onClick={onCambiaSerata}>Cambia serata →</button>
          <button type="button" className="mm-btn" style={{ color: 'var(--vinile)', minHeight: 48 }} onClick={onChiudi}>{indietro}</button>
        </div>
      </>
    );
  }

  // Prevendita con categoria: l'ingresso si registra solo dopo la scelta dello staff.
  if (esito.esito === 'da_confermare') {
    const v = esito.voce;
    return (
      <>
        <div role="alert" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
          <span className="font-mono text-[13px] font-medium leading-[18px]">{categoriaDaControllare(v) ? 'PREVENDITA RISERVATA · CONTROLLA IL DOCUMENTO' : 'SERATA SENZA TELEFONO · CONTROLLA IL DOCUMENTO'}</span>
          <span className={`font-display ${categoriaDaControllare(v) ? 'text-[88px]' : 'text-[64px]'} font-black uppercase leading-[.85] [overflow-wrap:anywhere]`}>{categoriaDaControllare(v) ? v.categoria : 'Documento'}</span>
          <div className={linea} />
          <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>
          <span className="font-mono text-[13px] font-medium leading-[18px]">NASCITA {nascita(v.dataNascita)} · {anni(v.dataNascita)} ANNI</span>
          {v.rifiuto && <span className="text-[17px] font-semibold leading-6">Rifiutato alle {oraDi(v.rifiuto.ora)}{v.rifiuto.da !== 'staff' ? ` da ${v.rifiuto.da}` : ''} ({v.rifiuto.porta.replace('P', 'PORTA ')}). Puoi comunque farlo entrare.</span>}
          <span className="text-[17px] font-medium leading-6">{testoLista(v)}</span>
        </div>
        <div className="flex flex-none flex-col gap-3 px-4 pb-7">
          <button type="button" className="mm-btn" style={{ background: 'var(--vinile)', color: 'var(--osso)', minHeight: 76, fontSize: 22 }} onClick={onFaiEntrare}>Fai entrare</button>
          <button type="button" className="mm-btn" style={{ border: '2px solid var(--vinile)', color: 'var(--vinile)', minHeight: 76, fontSize: 22 }} onClick={onNonRientra}>{categoriaDaControllare(v) ? 'Non rientra' : 'Non corrisponde'}</button>
          <button type="button" className="mm-btn" style={{ color: 'var(--vinile)', minHeight: 44 }} onClick={onChiudi}>{indietro}</button>
        </div>
      </>
    );
  }

  if (esito.esito === 'rifiutato') {
    const v = esito.voce;
    return (
      <div role="status" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
        {X}
        <span className="font-mono text-[13px] font-medium leading-[18px]">{categoriaDaControllare(v) ? `${v.categoria!.toUpperCase()} · ` : 'DOCUMENTO NON CORRISPONDE · '}RIFIUTO SALVATO{!online ? ' · SI SINCRONIZZA AL RITORNO DELLA RETE' : ''}</span>
        <span className="font-display text-[100px] font-black uppercase leading-[.8]">Non<br />entra</span>
        <div className={linea} />
        <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>
        <span className="text-[17px] font-medium leading-6">L’iscrizione resta valida: decide l’admin se rimborsare.</span>
      </div>
    );
  }

  const v = 'voce' in esito ? esito.voce : null;
  const pieno = esito.esito === 'gia_entrato' && esito.voce.tavolo ? esito.voce.tavolo : null;
  const dettaglio = pieno ? `TAVOLO ${pieno.nome.toUpperCase()} · ${pieno.entrati} DI ${pieno.persone} GIÀ ENTRATI`
    : esito.esito === 'gia_entrato'
    ? `STESSO QR · ENTRATO ${esito.voce.oraCheckIn ? oraDi(esito.voce.oraCheckIn) : ''}${esito.voce.porta ? ` · ${esito.voce.porta.replace('P', 'PORTA ')}` : ''}`
    : esito.esito === 'annullato' ? 'QR ANNULLATO DALLA CREW' : esito.esito === 'non_valido' ? esito.motivo.toUpperCase() : '';
  return (
    <>
      <div role="alert" className="flex flex-grow flex-col justify-center gap-[14px] px-4">
        {X}
        <span className="font-mono text-[13px] font-medium leading-[18px]">{dettaglio}</span>
        <span className="font-display text-[100px] font-black uppercase leading-[.8]">{pieno ? <>Tavolo<br />pieno</> : esito.esito === 'gia_entrato' ? <>Già<br />entrato</> : <>Non<br />valido</>}</span>
        <div className={linea} />
        {v && <span className="font-display text-[40px] font-black uppercase leading-[.95]">{v.nome} {v.cognome}</span>}
        <span className="text-[17px] font-medium leading-6">
          {pieno ? 'Il tavolo è al completo: con questo QR non entra più nessuno. Chi è in più non ha una prevendita valida: può comprarla ora dal telefono.'
            : esito.esito === 'non_valido' && esito.motivo.startsWith('Tavolo') ? 'La prenotazione non è stata pagata: il QR non vale. Chiama la crew.'
            : esito.esito === 'non_valido' && !online && esito.motivo.startsWith('Non è in elenco') ? 'Senza rete: chi ha pagato dopo l’ultimo aggiornamento non è ancora in elenco. Aspetta che torni la rete e riprova.'
            : esito.esito === 'gia_entrato' ? 'Controlla il documento. Se è un’altra persona, il QR è stato girato: non entra.'
            : esito.esito === 'annullato' ? 'Questa iscrizione è stata annullata: non entra con questo QR.'
              : 'Controlla il documento e prova con "Cerca per nome". Se non ha una prevendita valida, può comprarla ora dal telefono.'}
        </span>
      </div>
      <div className="flex flex-none px-4 pb-7">
        <button type="button" className="mm-btn mm-btn--linea flex-grow" style={{ minHeight: 64, fontSize: 17, borderColor: 'currentColor', color: 'inherit' }} onClick={onChiudi}>{indietro}</button>
      </div>
    </>
  );
}
