'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { testoAltFoto } from '@/lib/foto';
import {
  cssTrasf, DURATA_APERTURA, DURATA_CHIUSURA, esitoTrascinamento, fotogrammiVolo, rettContenuto, STACCO, type Rett,
} from '@/lib/volo';
import { Rivela } from '@/components/rivela';

export interface FotoPubblica { id: string; urlGrande: string; urlMini: string; larghezza: number; altezza: number }

const MOLLA = 'cubic-bezier(.2,.7,.2,1)';
const movimentoRidotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Griglia delle foto di una serata e vista a schermo intero (scorrimento col dito, frecce, tastiera, tasto Indietro del telefono).
 * Fatta in casa: nessuna libreria. Le miniature arrivano per prime; la foto grande si carica solo quando si apre.
 * Con il movimento attivo la foto vola dalla miniatura a tutto schermo e ritorno, e nello scorrimento segue il dito;
 * con prefers-reduced-motion niente animazioni.
 */
export function GrigliaFoto({ foto, titolo, data, credito }: { foto: FotoPubblica[]; titolo: string; data: string; credito: string }) {
  const [aperta, setAperta] = useState<number | null>(null);
  const [movimento, setMovimento] = useState(false);
  const ultimo = useRef<HTMLElement | null>(null);
  const miniature = useRef<(HTMLButtonElement | null)[]>([]);
  const alt = useCallback((i: number) => testoAltFoto(titolo, data, i + 1, foto.length), [titolo, data, foto.length]);
  const chiudi = useCallback(() => { setAperta(null); requestAnimationFrame(() => ultimo.current?.focus()); }, []);
  const miniatura = useCallback((i: number) => miniature.current[i] ?? null, []);

  return (
    <>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4 md:gap-4" aria-label={`Foto della serata ${titolo}`}>
        {foto.map((f, i) => (
          <li key={f.id}>
            {/* Entrano dal basso una dopo l'altra, riga per riga. */}
            <Rivela indice={i % 4}>
              {/* Il nome del pulsante è il testo alternativo della foto: niente aria-label che lo copra. */}
              <button
                ref={(el) => { miniature.current[i] = el; }}
                type="button"
                className="mm-zoom relative block aspect-[3/4] w-full cursor-pointer overflow-hidden border-0 bg-[#111419] p-0"
                onClick={(e) => { ultimo.current = e.currentTarget; setMovimento(!movimentoRidotto()); setAperta(i); }}
                aria-haspopup="dialog"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.urlMini} alt={alt(i)} width={f.larghezza} height={f.altezza} loading={i < 4 ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
              </button>
            </Rivela>
          </li>
        ))}
      </ul>
      {credito && <p className="m-0 font-mono text-[12px] leading-4 text-osso-2">Foto di {credito}</p>}
      {aperta !== null && <Visore foto={foto} indice={aperta} alt={alt} credito={credito} cambia={setAperta} chiudi={chiudi} movimento={movimento} miniatura={miniatura} />}
    </>
  );
}

const rett = (r: DOMRect): Rett => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/**
 * Il volo tra la miniatura e lo schermo intero. Usa la miniatura già scaricata e decodificata nella griglia (niente attese)
 * e muove solo `transform` (vedi `fotogrammiVolo`). `miniatura` è il pulsante della griglia: la sua cornice e la foto dentro
 * (che col mouse sopra è un po' ingrandita). `verso` 'chiudi' fa il contrario. La copia sparisce a fine volo.
 */
function vola(f: FotoPubblica, miniatura: HTMLElement, finale: Rett, verso: 'apri' | 'chiudi', durata: number) {
  const img = miniatura.querySelector('img');
  const cornice = rett(miniatura.getBoundingClientRect());
  const { guscio, foto } = fotogrammiVolo(cornice, img ? rett(img.getBoundingClientRect()) : cornice, finale);
  if (verso === 'chiudi') { guscio.reverse(); foto.reverse(); }

  const copia = document.createElement('div');
  copia.setAttribute('aria-hidden', 'true');
  const base = { position: 'absolute', left: '0', top: '0', width: `${finale.width}px`, height: `${finale.height}px`, transformOrigin: '0 0', willChange: 'transform' };
  Object.assign(copia.style, base, { position: 'fixed', left: `${finale.left}px`, top: `${finale.top}px`, zIndex: '201', overflow: 'hidden', pointerEvents: 'none' });
  const dentro = document.createElement('img');
  dentro.src = f.urlMini;
  dentro.alt = '';
  Object.assign(dentro.style, base, { maxWidth: 'none' });
  copia.appendChild(dentro);
  document.body.appendChild(copia);

  const tempi = { duration: durata, easing: 'linear', fill: 'both' } as const; // la curva è già nei fotogrammi
  const a = copia.animate(guscio.map((t) => ({ transform: cssTrasf(t) })), tempi);
  const b = dentro.animate(foto.map((t) => ({ transform: cssTrasf(t) })), tempi);
  const togli = () => copia.remove();
  a.finished.then(togli, togli);
  return { finito: a.finished, ferma: () => { a.cancel(); b.cancel(); togli(); } };
}

/** La miniatura sotto il volo si nasconde, così sembra che la foto si stacchi davvero dalla griglia. */
function nascondi(miniatura: HTMLElement | null, si: boolean) {
  const img = miniatura?.querySelector('img');
  if (img) img.style.opacity = si ? '0' : '';
}

/** È visibile almeno in parte sullo schermo? */
const inVista = (el: HTMLElement | null): el is HTMLElement => {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

function Visore({ foto, indice, alt, credito, cambia, chiudi, movimento, miniatura }: {
  foto: FotoPubblica[]; indice: number; alt: (i: number) => string; credito: string; cambia: (i: number) => void; chiudi: () => void;
  movimento: boolean; miniatura: (i: number) => HTMLElement | null;
}) {
  const bottoneChiudi = useRef<HTMLButtonElement>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const binario = useRef<HTMLDivElement>(null);
  const scorrimento = useRef<Animation | null>(null);
  const inCammino = useRef(false); // una foto sta scivolando via: finché non arriva la prossima, niente altri scorrimenti
  const chiudendo = useRef(false);
  const apertura = useRef<(() => void) | null>(null); // ferma il volo d'apertura, se si chiude mentre la foto vola ancora
  const tocco = useRef<{ id: number; x: number; y: number; asse: 'x' | 'y' | null; dx: number; ultimi: { x: number; t: number }[] } | null>(null);
  // Durante il volo d'apertura si vede solo la copia: le foto grandi si montano (e si scaricano) solo all'atterraggio,
  // così niente scaricamento o decodifica di file grandi mentre la foto vola.
  const [atterrata, setAtterrata] = useState(!movimento);
  const n = foto.length;
  const attuale = useRef(indice);
  attuale.current = indice;

  // Uscita: la foto torna nella sua miniatura (se è in vista), altrimenti la finestra si dissolve. Parte subito, nello
  // stesso istante del tocco su Chiudi o di Esc; poi si chiude davvero.
  const esci = useCallback(() => {
    if (chiudendo.current) return;
    chiudendo.current = true;
    const radice = contenitore.current, area = palco.current;
    if (!movimento || !radice || !area) { chiudi(); return; }
    apertura.current?.();
    const i = attuale.current;
    const mini = miniatura(i);
    const conVolo = inVista(mini);
    const finale = rettContenuto(rett(area.getBoundingClientRect()), foto[i].larghezza, foto[i].altezza);
    area.style.visibility = 'hidden';
    const sfondo = radice.animate([{ opacity: 1 }, { opacity: 0 }], { duration: conVolo ? DURATA_CHIUSURA : 180, easing: 'ease-out', fill: 'forwards' });
    let finito = sfondo.finished;
    if (conVolo) {
      nascondi(mini, true);
      finito = vola(foto[i], mini, finale, 'chiudi', DURATA_CHIUSURA).finito;
    }
    const fine = () => { nascondi(mini, false); chiudi(); };
    finito.then(fine, fine);
  }, [movimento, chiudi, miniatura, foto]);

  // Tasto Indietro del telefono: con la foto aperta c'è una voce in più nella cronologia. Indietro la toglie e chiude la foto
  // (resti nella pagina); chiudendo con X o Esc si fa tornare indietro la cronologia, così non restano voci in più.
  useEffect(() => {
    if (!history.state?.mmFoto) history.pushState({ ...history.state, mmFoto: true }, ''); // (in sviluppo l'effetto parte due volte)
    const alIndietro = () => esci();
    window.addEventListener('popstate', alIndietro);
    return () => window.removeEventListener('popstate', alIndietro);
  }, [esci]);
  const chiediChiusura = useCallback(() => {
    // Prima l'animazione, poi la cronologia: il popstate che arriva dopo trova la chiusura già avviata e non fa niente.
    esci();
    if (history.state?.mmFoto) history.back();
  }, [esci]);

  // Con il movimento anche frecce e tastiera fanno scorrere la foto di lato; senza, cambia e basta.
  const vai = useCallback((verso: 1 | -1, da = 0) => {
    const b = binario.current, area = palco.current;
    const prossima = (attuale.current + verso + n) % n;
    if (!movimento || !b || !area || n < 2) { cambia(prossima); return; }
    if (inCammino.current) return;
    inCammino.current = true;
    const w = area.clientWidth + STACCO;
    const resto = Math.max(0.3, (w - Math.abs(da)) / w);
    const a = b.animate([{ transform: `translateX(${da}px)` }, { transform: `translateX(${-verso * w}px)` }], { duration: 280 * resto, easing: MOLLA, fill: 'forwards' });
    scorrimento.current = a;
    a.finished.then(() => cambia(prossima), () => {}); // l'animazione resta ferma in fondo finché la nuova foto non è al centro (sotto)
  }, [movimento, n, cambia]);

  // Appena la nuova foto è al centro il binario torna a zero, prima che il browser disegni: nessun salto.
  useLayoutEffect(() => {
    scorrimento.current?.cancel();
    scorrimento.current = null;
    inCammino.current = false;
    if (binario.current) binario.current.style.transform = '';
  }, [indice]);

  // Tastiera: frecce, Esc e Tab che resta dentro la finestra.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (chiudendo.current) return;
      if (e.key === 'Escape') { e.preventDefault(); chiediChiusura(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); vai(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); vai(-1); }
      else if (e.key === 'Tab') {
        const el = contenitore.current?.querySelectorAll<HTMLElement>('button');
        if (!el?.length) return;
        const primo = el[0], ultimo = el[el.length - 1];
        if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
      }
    };
    window.addEventListener('keydown', tasto);
    return () => window.removeEventListener('keydown', tasto);
  }, [vai, chiediChiusura]);

  // La pagina sotto non scorre (e non si sposta di lato quando sparisce la barra di scorrimento); il focus parte dalla chiusura.
  useEffect(() => {
    const prima = { overflow: document.body.style.overflow, padding: document.body.style.paddingRight };
    const barra = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (barra > 0) document.body.style.paddingRight = `${barra}px`;
    bottoneChiudi.current?.focus();
    return () => { document.body.style.overflow = prima.overflow; document.body.style.paddingRight = prima.padding; };
  }, []);

  // Apertura: la foto vola dalla miniatura toccata. Parte prima che il browser disegni la finestra, così il primo
  // fotogramma è già quello del volo.
  useLayoutEffect(() => {
    const radice = contenitore.current, area = palco.current;
    const mini = miniatura(indice);
    if (!movimento || !radice || !area) return;
    if (!inVista(mini)) { setAtterrata(true); return; }
    const i = indice;
    area.style.visibility = 'hidden';
    nascondi(mini, true);
    const finale = rettContenuto(rett(area.getBoundingClientRect()), foto[i].larghezza, foto[i].altezza);
    const sfondo = radice.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATA_APERTURA, easing: 'ease-out' });
    const v = vola(foto[i], mini, finale, 'apri', DURATA_APERTURA);
    const ripristina = () => { area.style.visibility = ''; nascondi(mini, false); };
    v.finito.then(() => { ripristina(); setAtterrata(true); }, () => {});
    apertura.current = () => { sfondo.cancel(); v.ferma(); nascondi(mini, false); };
    return () => { apertura.current = null; sfondo.cancel(); v.ferma(); ripristina(); };
    // solo all'apertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si scaricano in anticipo la foto prima e la seguente, così lo scorrimento è subito (dopo l'atterraggio).
  useEffect(() => {
    if (!atterrata) return;
    for (const j of [indice + 1, indice - 1]) { if (foto[(j + n) % n]) new Image().src = foto[(j + n) % n].urlGrande; }
  }, [atterrata, indice, foto, n]);

  // Dito (o mouse) sulla foto. Senza movimento basta il gesto finale; con il movimento la foto segue il dito e alla fine
  // scatta alla successiva (spinta oltre un quarto, o lanciata) o torna al suo posto.
  const giu = (e: React.PointerEvent) => {
    if (!e.isPrimary || chiudendo.current || inCammino.current) return;
    tocco.current = { id: e.pointerId, x: e.clientX, y: e.clientY, asse: null, dx: 0, ultimi: [{ x: e.clientX, t: e.timeStamp }] };
  };
  const muovi = (e: React.PointerEvent) => {
    const t = tocco.current, b = binario.current;
    if (!movimento || !t || t.id !== e.pointerId || !b) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (!t.asse && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      t.asse = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (t.asse === 'x') {
        // Il puntatore si "prende" solo quando è davvero un trascinamento, così il clic sulle frecce resta un clic.
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* il dito si è già staccato */ }
        scorrimento.current?.cancel(); // se stava ancora tornando al suo posto, si riprende da dove è
      }
    }
    if (t.asse !== 'x') return;
    t.dx = n > 1 ? dx : dx * 0.25; // con una foto sola si sente un elastico
    t.ultimi = [...t.ultimi.filter((u) => e.timeStamp - u.t < 100), { x: e.clientX, t: e.timeStamp }];
    b.style.transform = `translateX(${t.dx}px)`;
  };
  const su = (e: React.PointerEvent) => {
    const t = tocco.current; tocco.current = null;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (!movimento) {
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) vai(dx < 0 ? 1 : -1);
      return;
    }
    if (t.asse !== 'x') return;
    const primo = t.ultimi[0];
    const velocita = (e.clientX - primo.x) / Math.max(1, e.timeStamp - primo.t); // px al millisecondo
    const esito = esitoTrascinamento({ dx, velocita, larghezza: palco.current?.clientWidth ?? window.innerWidth, quante: n });
    if (esito) vai(esito, t.dx);
    else torna(t.dx);
  };
  const torna = (da: number) => {
    const b = binario.current;
    if (!b) return;
    b.style.transform = '';
    if (da) scorrimento.current = b.animate([{ transform: `translateX(${da}px)` }, { transform: 'translateX(0px)' }], { duration: 220, easing: MOLLA });
  };

  // Con il movimento (e dopo l'atterraggio) ci sono anche le foto accanto, pronte fuori dallo schermo. Con due foto sole
  // quella "accanto" è la stessa da tutte e due le parti: le chiavi tengono conto del lato.
  const lati = movimento && atterrata && n > 1 ? [-1, 0, 1] : [0];

  return createPortal(
    <div ref={contenitore} role="dialog" aria-modal="true" aria-label="Foto a schermo intero" className="fixed inset-0 z-[200] flex flex-col bg-[#08090c] text-osso">
      <div className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-[12px] md:px-8">
        <span aria-live="polite">{indice + 1} / {n}</span>
        <button ref={bottoneChiudi} type="button" onClick={chiediChiusura} className="mm-btn mm-btn--muto" style={{ minHeight: 44, minWidth: 44 }} aria-label="Chiudi">Chiudi ✕</button>
      </div>
      <div
        ref={palco}
        className="relative min-h-0 flex-1 touch-pan-y select-none overflow-hidden"
        onPointerDown={giu}
        onPointerMove={muovi}
        onPointerUp={su}
        onPointerCancel={() => { const t = tocco.current; tocco.current = null; if (movimento && t?.asse === 'x') torna(t.dx); }}
      >
        <div ref={binario} className="absolute inset-0">
          {lati.map((lato) => {
            const j = (indice + lato + n) % n;
            return (
              <Diapositiva
                key={n === 2 ? `${lato}-${foto[j].id}` : foto[j].id}
                f={foto[j]} alt={lato === 0 ? alt(j) : ''} lato={lato} grande={atterrata}
              />
            );
          })}
        </div>
        {n > 1 && (
          <>
            <button type="button" onClick={() => vai(-1)} aria-label="Foto precedente"
              className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-[rgba(8,9,12,.55)] text-[24px] text-osso md:left-4">‹</button>
            <button type="button" onClick={() => vai(1)} aria-label="Foto successiva"
              className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-[rgba(8,9,12,.55)] text-[24px] text-osso md:right-4">›</button>
          </>
        )}
      </div>
      <div className="px-4 py-3 font-mono text-[12px] text-osso-2 md:px-8">{credito ? `Foto di ${credito}` : ' '}</div>
    </div>,
    document.body,
  );
}

/** Una foto del visore: prima la miniatura (già scaricata nella griglia), poi la foto grande sopra (con `grande`). */
function Diapositiva({ f, alt, lato, grande }: { f: FotoPubblica; alt: string; lato: number; grande: boolean }) {
  const [pronta, setPronta] = useState(false);
  const accanto = lato !== 0;
  return (
    <div className="absolute inset-0" style={accanto ? { transform: `translateX(calc(${lato * 100}% + ${lato * STACCO}px))` } : undefined} aria-hidden={accanto || undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={f.urlMini} alt={grande ? '' : alt} aria-hidden={grande || undefined} draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      {grande && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={f.urlGrande} alt={alt} draggable={false} decoding="async" onLoad={() => setPronta(true)}
          className={`absolute inset-0 h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-300 ${pronta ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  );
}
