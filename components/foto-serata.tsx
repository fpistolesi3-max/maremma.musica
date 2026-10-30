'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface FotoPubblica { id: string; urlGrande: string; urlMini: string; larghezza: number; altezza: number }

/**
 * Griglia delle foto di una serata e vista a schermo intero (scorrimento col dito, frecce, tastiera).
 * Fatta in casa: nessuna libreria. Le miniature arrivano per prime; la foto grande si carica solo quando si apre.
 */
export function GrigliaFoto({ foto, titolo, data, credito }: { foto: FotoPubblica[]; titolo: string; data: string; credito: string }) {
  const [aperta, setAperta] = useState<number | null>(null);
  const ultimo = useRef<HTMLElement | null>(null);
  const alt = (i: number) => `Foto della serata ${titolo} del ${data}, numero ${i + 1} di ${foto.length}`;

  return (
    <>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4 md:gap-4" aria-label={`Foto della serata ${titolo}`}>
        {foto.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              className="relative block aspect-[3/4] w-full cursor-pointer overflow-hidden border-0 bg-[#111419] p-0"
              onClick={(e) => { ultimo.current = e.currentTarget; setAperta(i); }}
              aria-label={`Apri la foto ${i + 1} di ${foto.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.urlMini} alt={alt(i)} width={f.larghezza} height={f.altezza} loading={i < 4 ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {credito && <p className="m-0 font-mono text-[12px] leading-4 text-osso-2">Foto di {credito}</p>}
      {aperta !== null && (
        <Visore
          foto={foto} indice={aperta} alt={alt} credito={credito}
          cambia={setAperta}
          chiudi={() => { setAperta(null); requestAnimationFrame(() => ultimo.current?.focus()); }}
        />
      )}
    </>
  );
}

function Visore({ foto, indice, alt, credito, cambia, chiudi }: {
  foto: FotoPubblica[]; indice: number; alt: (i: number) => string; credito: string; cambia: (i: number) => void; chiudi: () => void;
}) {
  const [grandeCaricata, setGrandeCaricata] = useState<string | null>(null);
  const bottoneChiudi = useRef<HTMLButtonElement>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  const tocco = useRef<{ x: number; y: number } | null>(null);
  const n = foto.length;
  const f = foto[indice];

  const vai = useCallback((verso: 1 | -1) => cambia((indice + verso + n) % n), [indice, n, cambia]);

  // Tastiera: frecce, Esc e Tab che resta dentro la finestra.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); chiudi(); }
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
  }, [vai, chiudi]);

  // La pagina sotto non scorre; il focus parte dal tasto di chiusura.
  useEffect(() => {
    const prima = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    bottoneChiudi.current?.focus();
    return () => { document.body.style.overflow = prima; };
  }, []);

  // Si scaricano in anticipo la foto prima e la seguente, così lo scorrimento è subito.
  useEffect(() => {
    for (const j of [indice + 1, indice - 1]) { if (foto[(j + n) % n]) new Image().src = foto[(j + n) % n].urlGrande; }
  }, [indice, foto, n]);

  const grandePronta = grandeCaricata === f.id;

  return createPortal(
    <div ref={contenitore} role="dialog" aria-modal="true" aria-label="Foto a schermo intero" className="fixed inset-0 z-[200] flex flex-col bg-[#08090c] text-osso">
      <div className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-[12px] md:px-8">
        <span aria-live="polite">{indice + 1} / {n}</span>
        <button ref={bottoneChiudi} type="button" onClick={chiudi} className="mm-btn mm-btn--muto" style={{ minHeight: 44, minWidth: 44 }} aria-label="Chiudi">Chiudi ✕</button>
      </div>
      <div
        className="relative min-h-0 flex-1 touch-pan-y select-none"
        onPointerDown={(e) => { tocco.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const t = tocco.current; tocco.current = null;
          if (!t) return;
          const dx = e.clientX - t.x, dy = e.clientY - t.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) vai(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => { tocco.current = null; }}
      >
        {/* Prima la miniatura (già scaricata nella griglia), poi la foto grande sopra. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.urlMini} alt="" aria-hidden="true" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={f.id} src={f.urlGrande} alt={alt(indice)} draggable={false} onLoad={() => setGrandeCaricata(f.id)}
          className={`absolute inset-0 h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-300 ${grandePronta ? 'opacity-100' : 'opacity-0'}`}
        />
        {n > 1 && (
          <>
            <button type="button" onClick={() => vai(-1)} aria-label="Foto precedente"
              className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-[rgba(8,9,12,.55)] text-[24px] text-osso md:left-4">‹</button>
            <button type="button" onClick={() => vai(1)} aria-label="Foto successiva"
              className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-[rgba(8,9,12,.55)] text-[24px] text-osso md:right-4">›</button>
          </>
        )}
      </div>
      <div className="px-4 py-3 font-mono text-[12px] text-osso-2 md:px-8">{credito ? `Foto di ${credito}` : ' '}</div>
    </div>,
    document.body,
  );
}
