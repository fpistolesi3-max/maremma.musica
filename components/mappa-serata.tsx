'use client';

import { useEffect, useRef, useState } from 'react';
import { ZOOM_MAPPA, STILE_OPENFREEMAP, etichettaMappa, linkIndicazioni, stileNotte, usaAppleMaps } from '@/lib/mappa';

type Props = { lat: number; lng: number; location: string | null; comune: string | null; etichetta: string };

/**
 * Mappa vera di "Come arrivare" (MapLibre + OpenFreeMap, senza chiavi né cookie).
 * La libreria si scarica solo quando la sezione sta per entrare nello schermo; fino ad allora, e se il
 * caricamento fallisce (niente rete, niente WebGL), si vede il riquadro con il pin e basta.
 * La mappa è ferma: non ruba lo scorrimento della pagina. Un tocco apre le indicazioni.
 */
export function MappaSerata({ lat, lng, location, comune, etichetta }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLDivElement>(null);
  const [pronta, setPronta] = useState(false);
  const [fallita, setFallita] = useState(false);
  const [apple, setApple] = useState(false);
  useEffect(() => setApple(usaAppleMaps(navigator.userAgent, navigator.maxTouchPoints)), []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let chiusa = false;
    let mappa: { remove(): void } | null = null;
    const ferma = new AbortController();

    async function carica() {
      if (!navigator.onLine) return setFallita(true);
      try {
        const scaduto = setTimeout(() => ferma.abort(), 10_000);
        const [ml, stile] = await Promise.all([
          import('maplibre-gl'),
          fetch(STILE_OPENFREEMAP, { signal: ferma.signal, credentials: 'omit' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('stile')))),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ]);
        clearTimeout(scaduto);
        if (chiusa || !tela.current) return;
        ml.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
        const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const m = new ml.Map({
          container: tela.current,
          style: stileNotte(stile),
          center: [lng, lat],
          zoom: ZOOM_MAPPA,
          interactive: false,
          attributionControl: false,
          fadeDuration: ridotto ? 0 : 200,
          canvasContextAttributes: { antialias: false },
        });
        mappa = m;
        m.once('load', () => !chiusa && setPronta(true));
        m.on('error', (ev) => { if (!chiusa && !m.loaded() && /style|webgl/i.test(String(ev.error?.message))) setFallita(true); });
      } catch {
        if (!chiusa) setFallita(true); // niente rete o niente WebGL: resta il riquadro
      }
    }

    if (!('IntersectionObserver' in window)) {
      carica();
    } else {
      const osserva = new IntersectionObserver((voci) => {
        if (voci.some((v) => v.isIntersecting)) {
          osserva.disconnect();
          carica();
        }
      }, { rootMargin: '300px' });
      osserva.observe(el);
      return () => { chiusa = true; osserva.disconnect(); ferma.abort(); mappa?.remove(); };
    }
    return () => { chiusa = true; ferma.abort(); mappa?.remove(); };
  }, [lat, lng]);

  const href = linkIndicazioni({ lat, lng, location, comune }, apple);

  return (
    <div ref={box} className="mm-curve relative h-[220px] overflow-hidden border border-linea bg-[#0a0d11] bg-[position:-900px_-260px] md:h-[360px]">
      <div
        ref={tela}
        role="img"
        aria-label={etichettaMappa({ location, comune })}
        className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${pronta ? 'opacity-100' : 'opacity-0'}`}
      />
      {pronta && href && <a href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="absolute inset-0" />}
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-[22px] flex-col items-center gap-[10px] md:-translate-y-7">
        <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-arancio md:h-14 md:w-14"><div className="h-[10px] w-[10px] rounded-full bg-arancio md:h-3 md:w-3" /></div>
        <span className="bg-notte px-2 py-[5px] font-mono text-[11px] leading-[14px] md:text-[12px]">{etichetta}</span>
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="absolute left-3 top-3 border border-linea-forte bg-notte px-3 py-[10px] font-mono text-[11px] leading-[14px] text-osso no-underline hover:border-osso">
          Indicazioni →
        </a>
      )}
      {fallita && !pronta && <span className="absolute bottom-[14px] left-4 font-mono text-[10px] leading-[14px] text-osso-3">MAPPA · SEGNAPOSTO</span>}
      {pronta && (
        <p className="absolute bottom-0 right-0 m-0 text-right bg-notte/80 px-2 py-[3px] font-mono text-[10px] leading-[14px] text-osso-2">
          <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="text-osso-2">OpenFreeMap</a>{' '}
          <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer" className="text-osso-2">© OpenMapTiles</a> · dati{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-osso-2">© OpenStreetMap</a>
        </p>
      )}
    </div>
  );
}

/** "Apri in Maps" sopra la mappa: stessa regola delle indicazioni (Apple Maps su iOS, Google altrove), anche senza mappa vera. */
export function ApriInMaps({ lat, lng, location, comune }: { lat: number | null; lng: number | null; location: string | null; comune: string | null }) {
  const [apple, setApple] = useState(false);
  useEffect(() => setApple(usaAppleMaps(navigator.userAgent, navigator.maxTouchPoints)), []);
  const href = linkIndicazioni({ lat, lng, location, comune }, apple);
  return href ? <a href={href} className="link-sottolineato self-start py-3" target="_blank" rel="noopener noreferrer">Apri in Maps →</a> : null;
}
