'use client';

import { useEffect, useRef, useState } from 'react';
import { LUOGHI, PAESI } from '@/lib/cartina';
import { STILE_OPENFREEMAP, etichettaMappa, stileLocandina, zoomLocandina } from '@/lib/mappa';
import { misuraEtichetta, rettNome, rettPulsanti, scegliLato, sovrapposizione, type Lato, type Rett } from '@/lib/etichetta';
import type { DatiMappa } from './tipi';
import { EtichettaSerata, PuntoSerata } from './scatola';

type Nome = { nome: string; x: number; y: number; tipo: 'paese' | 'monte' | 'isola' | 'mare'; sinistra?: boolean };
const OMBRA = '[text-shadow:0_0_3px_#0a0d11,0_0_7px_#0a0d11]';

/**
 * Mappa vera "da locandina" (MapLibre + OpenFreeMap, senza chiavi né cookie), da vedere dall'alto: zoom largo con costa e paesi.
 * I nomi li scrive il sito (Big Shoulders, maiuscolo) sopra la mappa, non la mappa. La libreria si scarica solo quando serve
 * (`subito`) o quando il riquadro sta per entrare nello schermo; se non c'è rete o WebGL resta il riquadro con l'etichetta.
 * La mappa è ferma: non ruba lo scorrimento della pagina.
 */
export function MappaVera({ d, subito = false, onErrore, pulsanteSinistra = false }: { d: DatiMappa; subito?: boolean; onErrore?: () => void; pulsanteSinistra?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLDivElement>(null);
  const [pronta, setPronta] = useState(false);
  const [fallita, setFallita] = useState(false);
  const [nomi, setNomi] = useState<Nome[]>([]);
  const [etichetta, setEtichetta] = useState<{ lato: Lato; ancora: number }>({ lato: 'su', ancora: 50 });
  const errore = useRef(onErrore);
  errore.current = onErrore;
  const sinistraPulsante = useRef(pulsanteSinistra);
  sinistraPulsante.current = pulsanteSinistra;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let chiusa = false;
    let mappa: { remove(): void } | null = null;
    let osservatore: ResizeObserver | null = null;
    const ferma = new AbortController();
    const cade = () => { if (!chiusa) { setFallita(true); errore.current?.(); } };

    async function carica() {
      if (!navigator.onLine) return cade();
      try {
        const scaduto = setTimeout(() => ferma.abort(), 10_000);
        const [ml, stile] = await Promise.all([
          import('maplibre-gl'),
          fetch(STILE_OPENFREEMAP, { signal: ferma.signal, credentials: 'omit' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('stile')))),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        clearTimeout(scaduto);
        if (chiusa || !tela.current || !el) return;
        ml.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
        const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const m = new ml.Map({
          container: tela.current,
          style: stileLocandina(stile),
          center: [d.lng, d.lat],
          zoom: zoomLocandina(el.clientWidth),
          interactive: false,
          attributionControl: false,
          fadeDuration: ridotto ? 0 : 200,
          canvasContextAttributes: { antialias: false },
        });
        mappa = m;
        // I nomi stanno nei punti dove la mappa mette quei luoghi; si rifanno a ogni cambio di misura.
        const posiziona = () => {
          const { clientWidth: w, clientHeight: h } = el;
          const larga = w >= 560;
          const dentro = (x: number, y: number) => x > 16 && x < w - 16 && y > 12 && y < h - 12;
          const pulsanti = rettPulsanti(w, sinistraPulsante.current);
          // un nome per paese, nel lato dove sta (di default a destra del punto, a sinistra se non c'è posto)
          const paesi = [...PAESI].sort((p, q) => p.peso - q.peso).flatMap((p) => {
            const { x, y } = m.project([p.lng, p.lat]);
            const nome = p.corto && !larga ? p.corto : p.nome;
            const stanno = (s: boolean) => { const r = rettNome(x + (s ? 2 : -2), y, nome, { larga, sinistra: s }); return r.x0 > 4 && r.x1 < w - 4; };
            const sinistra = stanno(p.lato === 'l') ? p.lato === 'l' : p.lato !== 'l'; // se non sta dalla parte voluta si prova l'altra
            return dentro(x, y) && stanno(sinistra) ? [{ nome, x, y, tipo: 'paese' as const, sinistra, rett: rettNome(x + (sinistra ? 2 : -2), y, nome, { larga, sinistra }) }] : [];
          });
          const luoghi = LUOGHI.flatMap((l) => {
            const { x, y } = m.project([l.lng, l.lat]);
            return dentro(x, y) ? [{ nome: l.nome, x, y, tipo: l.tipo, sinistra: false, rett: rettNome(x, y, l.nome, { centrato: true, carattere: l.tipo === 'mare' ? 9 : 7 }) }] : [];
          });
          // l'etichetta della serata va dove copre meno nomi, poi i nomi si mettono nei posti rimasti (prima i più importanti)
          const pin = m.project([d.lng, d.lat]);
          const scelta = scegliLato(pin, misuraEtichetta(d.titolo, d.sotto, larga), { w, h }, [...paesi, ...luoghi].map((n) => n.rett).concat(pulsanti));
          const occupati: Rett[] = [...pulsanti, scelta.rett, { x0: pin.x - 10, y0: pin.y - 10, x1: pin.x + 10, y1: pin.y + 10 }];
          const lista: Nome[] = [];
          for (const n of [...paesi, ...luoghi]) {
            if (occupati.some((o) => sovrapposizione(n.rett, o) > 0)) continue;
            if (n.tipo === 'paese') occupati.push(n.rett);
            lista.push(n);
          }
          setNomi(lista);
          setEtichetta({ lato: scelta.lato, ancora: scelta.ancora });
        };
        osservatore = new ResizeObserver(() => { m.resize(); m.setZoom(zoomLocandina(el.clientWidth)); posiziona(); });
        osservatore.observe(el);
        m.once('load', () => { if (chiusa) return; posiziona(); setPronta(true); });
        m.on('error', (ev) => { if (!chiusa && !m.loaded() && /style|webgl/i.test(String(ev.error?.message))) cade(); });
      } catch {
        cade(); // niente rete o niente WebGL
      }
    }

    if (subito || !('IntersectionObserver' in window)) {
      carica();
    } else {
      const osserva = new IntersectionObserver((voci) => {
        if (voci.some((v) => v.isIntersecting)) { osserva.disconnect(); carica(); }
      }, { rootMargin: '300px' });
      osserva.observe(el);
      return () => { chiusa = true; osserva.disconnect(); ferma.abort(); osservatore?.disconnect(); mappa?.remove(); };
    }
    return () => { chiusa = true; ferma.abort(); osservatore?.disconnect(); mappa?.remove(); };
  }, [d.lat, d.lng, subito]);

  return (
    <div ref={box} data-pronta={pronta} className="absolute inset-0 bg-[#0e2b46]">
      {/* la mappa va in un contenitore dentro il riquadro: la sua classe (position: relative) toglierebbe l'altezza a un contenitore solo "inset-0" */}
      <div role="img" aria-label={etichettaMappa(d)} className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${pronta ? 'opacity-100' : 'opacity-0'}`}>
        <div ref={tela} className="h-full w-full" />
      </div>

      {pronta && nomi.map((n) => n.tipo === 'paese' ? (
        <span key={n.nome} aria-hidden="true" className={`pointer-events-none absolute flex -translate-y-1/2 items-center gap-[5px] ${n.sinistra ? '-translate-x-full flex-row-reverse' : ''} cq-paese whitespace-nowrap font-display font-bold uppercase leading-none tracking-[.08em] text-osso ${OMBRA}`} style={{ left: n.sinistra ? n.x + 2 : n.x - 2, top: n.y }}>
          <i className="h-[5px] w-[5px] flex-none rounded-full bg-osso" />{n.nome}
        </span>
      ) : (
        <span key={n.nome} aria-hidden="true" className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 cq-luogo whitespace-nowrap font-mono uppercase leading-none ${n.tipo === 'mare' ? 'tracking-[.5em] text-[#6f9cc0]' : 'tracking-[.12em] text-osso-2'} ${OMBRA}`} style={{ left: n.x, top: n.y }}>
          {n.tipo === 'monte' ? '▲ ' : ''}{n.nome}
        </span>
      ))}

      <div className="pointer-events-none absolute left-1/2 top-1/2">
        <div className="absolute -translate-x-1/2 -translate-y-1/2"><PuntoSerata /></div>
        <EtichettaSerata titolo={d.titolo} sotto={d.sotto} lato={etichetta.lato} ancora={etichetta.ancora} />
      </div>

      {fallita && !pronta && <span className="absolute bottom-[14px] left-4 font-mono text-[10px] leading-[14px] text-osso-3">MAPPA · SEGNAPOSTO</span>}
      {pronta && (
        <p className="absolute bottom-[3px] right-[6px] m-0 font-mono text-[10px] leading-[12px] text-osso-2 [text-shadow:0_0_3px_#0a0d11,0_0_6px_#0a0d11]">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-osso-2">© OpenStreetMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="text-osso-2">OpenMapTiles</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="text-osso-2">OpenFreeMap</a>
        </p>
      )}
    </div>
  );
}
