'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { testoAltFoto } from '@/lib/foto';
import { Rivela } from '@/components/rivela';

export interface FotoPubblica { id: string; urlGrande: string; urlMini: string; larghezza: number; altezza: number }

// PROVA (da togliere dopo la scelta): con ?prova=c nell'indirizzo il visore si apre "volando" dalla miniatura e la foto
// segue il dito. Senza, tutto come prima.
const provaC = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('prova') === 'c'
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MOLLA = 'cubic-bezier(.2,.7,.2,1)';

/**
 * Griglia delle foto di una serata e vista a schermo intero (scorrimento col dito, frecce, tastiera, tasto Indietro del telefono).
 * Fatta in casa: nessuna libreria. Le miniature arrivano per prime; la foto grande si carica solo quando si apre.
 */
export function GrigliaFoto({ foto, titolo, data, credito }: { foto: FotoPubblica[]; titolo: string; data: string; credito: string }) {
  const [aperta, setAperta] = useState<number | null>(null);
  const [volo, setVolo] = useState(false);
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
                onClick={(e) => { ultimo.current = e.currentTarget; setVolo(provaC()); setAperta(i); }}
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
      {aperta !== null && <Visore foto={foto} indice={aperta} alt={alt} credito={credito} cambia={setAperta} chiudi={chiudi} volo={volo} miniatura={miniatura} />}
    </>
  );
}

/** Dove sta la foto intera dentro `area` (come object-fit: contain). */
function contenuta(area: DOMRect, f: FotoPubblica) {
  const s = Math.min(area.width / f.larghezza, area.height / f.altezza);
  const w = f.larghezza * s, h = f.altezza * s;
  return { left: area.left + (area.width - w) / 2, top: area.top + (area.height - h) / 2, width: w, height: h };
}

/**
 * Il "volo" tra la miniatura e lo schermo intero: una copia della foto, posata sul rettangolo finale, parte ingrandita e
 * ritagliata come la miniatura (object-fit: cover) e si allarga fino alla foto intera. `verso` 'chiudi' fa il contrario.
 */
function vola(f: FotoPubblica, mini: DOMRect, finale: ReturnType<typeof contenuta>, verso: 'apri' | 'chiudi', durata: number) {
  const copia = document.createElement('div');
  copia.setAttribute('aria-hidden', 'true');
  Object.assign(copia.style, {
    position: 'fixed', left: `${finale.left}px`, top: `${finale.top}px`, width: `${finale.width}px`, height: `${finale.height}px`,
    zIndex: '201', pointerEvents: 'none', transformOrigin: '0 0', willChange: 'transform, clip-path',
    background: `center / cover no-repeat url("${f.urlMini}")`,
  });
  document.body.appendChild(copia);
  const s = Math.max(mini.width / finale.width, mini.height / finale.height);
  const dx = (finale.width - mini.width / s) / 2, dy = (finale.height - mini.height / s) / 2;
  const tx = mini.left + mini.width / 2 - (finale.width * s) / 2, ty = mini.top + mini.height / 2 - (finale.height * s) / 2;
  const daMini = { transform: `translate(${tx - finale.left}px, ${ty - finale.top}px) scale(${s})`, clipPath: `inset(${dy}px ${dx}px)` };
  const intera = { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px)' };
  const a = copia.animate(verso === 'apri' ? [daMini, intera] : [intera, daMini], { duration: durata, easing: MOLLA, fill: 'both' });
  const fine = () => copia.remove();
  a.finished.then(fine, fine);
  return a;
}

/** La miniatura sotto il volo si nasconde, così sembra che la foto si stacchi davvero dalla griglia. */
function nascondi(miniatura: HTMLElement | null, si: boolean) {
  const img = miniatura?.querySelector('img');
  if (img) img.style.opacity = si ? '0' : '';
}

function Visore({ foto, indice, alt, credito, cambia, chiudi, volo, miniatura }: {
  foto: FotoPubblica[]; indice: number; alt: (i: number) => string; credito: string; cambia: (i: number) => void; chiudi: () => void;
  volo: boolean; miniatura: (i: number) => HTMLElement | null;
}) {
  const bottoneChiudi = useRef<HTMLButtonElement>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const binario = useRef<HTMLDivElement>(null);
  const scorrimento = useRef<Animation | null>(null);
  const inCammino = useRef(false); // una foto sta scivolando via: finché non arriva la prossima, niente altri scorrimenti
  const chiudendo = useRef(false);
  const tocco = useRef<{ id: number; x: number; y: number; t: number; asse: 'x' | 'y' | null; dx: number; ultimi: { x: number; t: number }[] } | null>(null);
  const n = foto.length;
  const f = foto[indice];
  const attuale = useRef(indice);
  attuale.current = indice;

  // Uscita: con la prova C la foto torna nella sua miniatura (se è in vista), altrimenti si dissolve. Poi si chiude davvero.
  const esci = useCallback(() => {
    if (chiudendo.current) return;
    chiudendo.current = true;
    const radice = contenitore.current, area = palco.current;
    if (!volo || !radice || !area) { chiudi(); return; }
    const i = attuale.current;
    const mini = miniatura(i)?.getBoundingClientRect();
    const inVista = mini && mini.bottom > 0 && mini.top < window.innerHeight && mini.width > 0;
    area.style.visibility = 'hidden';
    const sfondo = radice.animate([{ opacity: 1 }, { opacity: 0 }], { duration: inVista ? 320 : 200, easing: 'ease-out', fill: 'forwards' });
    let a: Animation = sfondo;
    if (inVista) {
      nascondi(miniatura(i), true);
      a = vola(foto[i], mini, contenuta(area.getBoundingClientRect(), foto[i]), 'chiudi', 340);
    }
    const fine = () => { nascondi(miniatura(i), false); chiudi(); };
    a.finished.then(fine, fine);
  }, [volo, chiudi, miniatura, foto]);

  // Tasto Indietro del telefono: con la foto aperta c'è una voce in più nella cronologia. Indietro la toglie e chiude la foto
  // (resti nella pagina); chiudendo con X o Esc si fa tornare indietro la cronologia, così non restano voci in più.
  useEffect(() => {
    if (!history.state?.mmFoto) history.pushState({ ...history.state, mmFoto: true }, ''); // (in sviluppo l'effetto parte due volte)
    const alIndietro = () => esci();
    window.addEventListener('popstate', alIndietro);
    return () => window.removeEventListener('popstate', alIndietro);
  }, [esci]);
  const chiediChiusura = useCallback(() => {
    if (history.state?.mmFoto) history.back(); // poi arriva popstate e chiude
    else esci();
  }, [esci]);

  // Con la prova C anche frecce e tastiera fanno scorrere la foto di lato; senza, cambia e basta.
  const scorri = useCallback((verso: 1 | -1, da = 0) => {
    const b = binario.current, area = palco.current;
    const prossima = (attuale.current + verso + n) % n;
    if (!volo || !b || !area || n < 2) { cambia(prossima); return; }
    if (inCammino.current) return;
    inCammino.current = true;
    const w = area.clientWidth;
    const resto = Math.max(0.3, (w - Math.abs(da)) / w);
    const a = b.animate([{ transform: `translateX(${da}px)` }, { transform: `translateX(${-verso * w}px)` }], { duration: 300 * resto, easing: MOLLA, fill: 'forwards' });
    scorrimento.current = a;
    a.onfinish = () => cambia(prossima); // l'animazione resta ferma in fondo finché la nuova foto non è al centro (sotto)
  }, [volo, n, cambia]);
  const vai = scorri;

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

  // Apertura con la prova C: la foto vola dalla miniatura toccata. Parte prima che il browser disegni la finestra.
  useLayoutEffect(() => {
    const radice = contenitore.current, area = palco.current;
    const mini = miniatura(indice)?.getBoundingClientRect();
    if (!volo || !radice || !area || !mini) return;
    const i = indice;
    area.style.visibility = 'hidden';
    nascondi(miniatura(i), true);
    const sfondo = radice.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
    const a = vola(foto[i], mini, contenuta(area.getBoundingClientRect(), foto[i]), 'apri', 420);
    const fine = () => { area.style.visibility = ''; nascondi(miniatura(i), false); };
    a.finished.then(fine, fine);
    return () => { sfondo.cancel(); a.cancel(); fine(); };
    // solo all'apertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si scaricano in anticipo la foto prima e la seguente, così lo scorrimento è subito.
  useEffect(() => {
    for (const j of [indice + 1, indice - 1]) { if (foto[(j + n) % n]) new Image().src = foto[(j + n) % n].urlGrande; }
  }, [indice, foto, n]);

  // Dito (o mouse) sulla foto. Senza la prova C basta il gesto finale; con la prova C la foto segue il dito e alla fine
  // scatta alla successiva (spinta oltre un quarto, o lanciata) o torna al suo posto.
  const giu = (e: React.PointerEvent) => {
    if (!e.isPrimary || chiudendo.current || inCammino.current) return;
    tocco.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, asse: null, dx: 0, ultimi: [{ x: e.clientX, t: e.timeStamp }] };
  };
  const muovi = (e: React.PointerEvent) => {
    const t = tocco.current, b = binario.current;
    if (!volo || !t || t.id !== e.pointerId || !b) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (!t.asse && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      t.asse = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (t.asse === 'x') {
        // Il puntatore si "prende" solo quando è davvero un trascinamento, così il clic sulle frecce resta un clic.
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
    if (!volo) {
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) vai(dx < 0 ? 1 : -1);
      return;
    }
    if (t.asse !== 'x') return;
    const w = palco.current?.clientWidth ?? window.innerWidth;
    const primo = t.ultimi[0];
    const velocita = (e.clientX - primo.x) / Math.max(1, e.timeStamp - primo.t); // px al millisecondo
    const lancio = Math.abs(velocita) > 0.5 && Math.sign(velocita) === Math.sign(dx);
    if (n > 1 && (Math.abs(dx) > w / 4 || (lancio && Math.abs(dx) > 30))) scorri(dx < 0 ? 1 : -1, t.dx);
    else torna(t.dx);
  };
  const torna = (da: number) => {
    const b = binario.current;
    if (!b) return;
    b.style.transform = '';
    if (da) scorrimento.current = b.animate([{ transform: `translateX(${da}px)` }, { transform: 'translateX(0px)' }], { duration: 220, easing: MOLLA });
  };

  // Con la prova C ci sono anche le foto accanto, pronte fuori dallo schermo. Con due foto sole quella "accanto" è la
  // stessa da tutte e due le parti: le chiavi tengono conto del lato.
  const lati = volo && n > 1 ? [-1, 0, 1] : [0];

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
        onPointerCancel={() => { const t = tocco.current; tocco.current = null; if (volo && t?.asse === 'x') torna(t.dx); }}
      >
        <div ref={binario} className="absolute inset-0">
          {lati.map((lato) => {
            const j = (indice + lato + n) % n;
            return (
              <Diapositiva
                key={n === 2 ? `${lato}-${foto[j].id}` : foto[j].id}
                f={foto[j]} alt={lato === 0 ? alt(j) : ''} lato={lato}
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

/** Una foto del visore: prima la miniatura (già scaricata nella griglia), poi la foto grande sopra. */
function Diapositiva({ f, alt, lato }: { f: FotoPubblica; alt: string; lato: number }) {
  const [pronta, setPronta] = useState(false);
  const accanto = lato !== 0;
  return (
    <div className="absolute inset-0" style={accanto ? { transform: `translateX(${lato * 100}%)` } : undefined} aria-hidden={accanto || undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={f.urlMini} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={f.urlGrande} alt={alt} draggable={false} onLoad={() => setPronta(true)}
        className={`absolute inset-0 h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-300 ${pronta ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
