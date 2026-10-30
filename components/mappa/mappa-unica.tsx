'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etichettaMappa, zoomZona } from '@/lib/mappa';
import { DISTANZA, misuraEtichetta, rettNome, scegliLato, type Lato, type Rett } from '@/lib/etichetta';
import { ATTRIBUZIONI, FONDO, stileMappa } from '@/lib/stile-mappa';
import { EtichettaSerata, PuntoSerata } from './pin';
import type { DatiMappa } from './tipi';

type Etichetta = { lato: Lato; ancora: number };

/** Il pin della serata con l'etichetta arancio: nel segnaposto sta al centro, sulla mappa segue il posto. */
function Pin({ d, e }: { d: DatiMappa; e: Etichetta }) {
  return (
    <>
      <div className="absolute -translate-x-1/2 -translate-y-1/2"><PuntoSerata /></div>
      <EtichettaSerata titolo={d.titolo} sotto={d.sotto} lato={e.lato} ancora={e.ancora} />
    </>
  );
}

/**
 * L'unica mappa di "Come arrivare" (MapLibre + OpenFreeMap, senza chiavi né cookie).
 * Si muove con i gesti, senza pulsanti: sul telefono un dito scorre la pagina e due dita zoomano e spostano la mappa;
 * sul computer si trascina e la rotella zooma quando il puntatore si è mosso sulla mappa (se la mappa arriva sotto il puntatore
 * mentre scorri la pagina, la rotella continua a scorrere la pagina). La libreria si scarica solo quando il riquadro sta per
 * entrare nello schermo: prima, e se qualcosa va storto, resta il riquadro leggero con il pin.
 */
export function MappaUnica({ d, zoom }: { d: DatiMappa; zoom?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLDivElement>(null);
  const torna = useRef<() => void>(() => {});
  const [pronta, setPronta] = useState(false);
  const [fallita, setFallita] = useState(false);
  const [lontana, setLontana] = useState(false);
  const [tocco, setTocco] = useState(false);
  const [pin, setPin] = useState<HTMLElement | null>(null);
  const [etichetta, setEtichetta] = useState<Etichetta>({ lato: 'su', ancora: 50 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const toccoSolo = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    setTocco(toccoSolo);
    let chiusa = false;
    let mappa: { remove(): void } | null = null;
    let osservatore: ResizeObserver | null = null;
    const via: (() => void)[] = [];
    const cade = () => { if (!chiusa) setFallita(true); };

    async function carica() {
      if (!navigator.onLine) return cade();
      try {
        const [ml] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
        if (chiusa || !tela.current || !el) return;
        ml.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
        const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const centro: [number, number] = [d.lng, d.lat];
        const zoomIniziale = zoom ?? zoomZona(el.clientWidth, d.lat);
        const m = new ml.Map({
          container: tela.current,
          style: stileMappa() as never,
          center: centro,
          zoom: zoomIniziale,
          minZoom: 6,
          maxZoom: 18.5,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          keyboard: true,
          scrollZoom: false, // si accende quando il puntatore si muove sulla mappa (sotto)
          cooperativeGestures: toccoSolo, // sul telefono: un dito scorre la pagina, due dita muovono la mappa
          locale: { 'CooperativeGesturesHandler.MobileHelpText': 'Due dita per muovere la mappa' },
          fadeDuration: ridotto ? 0 : 200,
          canvasContextAttributes: { antialias: false },
        });
        mappa = m;
        if (process.env.NODE_ENV !== 'production') (el as HTMLDivElement & { mappa?: unknown }).mappa = m; // per le prove
        m.touchZoomRotate.disableRotation();

        // il pin è un segnaposto di MapLibre: il contenuto lo disegna React (portale), così è lo stesso del riquadro di attesa
        const nodo = document.createElement('div');
        new ml.Marker({ element: nodo, anchor: 'center' }).setLngLat(centro).addTo(m);
        setPin(nodo);

        // computer: la rotella zooma solo dopo un movimento vero del puntatore sulla mappa; scorrendo la pagina si spegne
        if (!toccoSolo) {
          const accendi = (ev: MouseEvent) => { if (ev.movementX || ev.movementY) m.scrollZoom.enable(); };
          const spegni = () => m.scrollZoom.disable();
          el.addEventListener('mousemove', accendi);
          el.addEventListener('mouseleave', spegni);
          window.addEventListener('scroll', spegni, { passive: true });
          via.push(() => { el.removeEventListener('mousemove', accendi); el.removeEventListener('mouseleave', spegni); window.removeEventListener('scroll', spegni); });
        }

        // Spazio riservato: un'icona trasparente grande quanto l'etichetta arancio, così i nomi della mappa le girano attorno invece di finirci sotto.
        let riservato = '';
        const riserva = (lato: Lato, ancora: number, mis: { w: number; h: number }) => {
          const chiave = `${lato}${ancora}${mis.w}`;
          if (riservato === chiave || !m.getLayer('mm-riserva')) return;
          riservato = chiave;
          const bordo = 6;
          const [iw, ih] = [mis.w + bordo * 2, mis.h + bordo * 2];
          if (m.hasImage('mm-riserva')) m.removeImage('mm-riserva');
          m.addImage('mm-riserva', { width: iw, height: ih, data: new Uint8Array(iw * ih * 4) });
          const via = DISTANZA - bordo;
          const dx = ((50 - ancora) / 100) * mis.w;
          const dy = ((50 - ancora) / 100) * mis.h;
          const [ancoraIcona, spinta]: ['bottom' | 'top' | 'left' | 'right', [number, number]] = lato === 'su' ? ['bottom', [dx, -via]] : lato === 'giu' ? ['top', [dx, via]] : lato === 'dx' ? ['left', [via, dy]] : ['right', [-via, dy]];
          m.setLayoutProperty('mm-riserva', 'icon-anchor', ancoraIcona);
          m.setLayoutProperty('mm-riserva', 'icon-offset', spinta);
        };

        // i paesi vicini (dai tasselli già scaricati): l'etichetta preferisce il lato dove ne copre meno
        let paesi: { nome: string; lngLat: [number, number]; grande: boolean }[] = [];
        const leggiPaesi = () => {
          const visti = new Set<string>();
          paesi = m.querySourceFeatures('omt', { sourceLayer: 'place', filter: ['match', ['get', 'class'], ['city', 'town', 'village'], true, false] }).flatMap((f) => {
            const nome = String(f.properties['name:it'] ?? f.properties.name ?? '');
            if (!nome || visti.has(nome) || f.geometry.type !== 'Point') return [];
            visti.add(nome);
            return [{ nome, lngLat: f.geometry.coordinates as [number, number], grande: f.properties.class !== 'village' }];
          });
        };

        // l'etichetta sta dalla parte dove c'è posto; "torna alla serata" compare solo se ti sei allontanato
        let attesa = 0;
        const aggiorna = () => {
          attesa = 0;
          const { clientWidth: w, clientHeight: h } = el;
          const p = m.project(centro);
          // la misura vera dell'etichetta quando è già disegnata, altrimenti la stima (mai più larga del riquadro, come nel CSS)
          const vera = el.querySelector<HTMLElement>('.cq-et > div');
          const mis = vera?.offsetWidth ? { w: vera.offsetWidth, h: vera.offsetHeight } : misuraEtichetta(d.titolo, d.sotto, w >= 560, w - 12);
          const z = m.getZoom();
          // città e paesi grandi pesano quattro volte i paesini: meglio coprire "Populonia Stazione" che "Campiglia Marittima"
          const ostacoli = paesi.filter((q) => q.grande || z >= 8.5).flatMap((q) => {
            const { x, y } = m.project(q.lngLat);
            return Array<Rett>(q.grande ? 4 : 1).fill(rettNome(x, y, q.nome, { centrato: true, carattere: q.grande ? 11 : 9 }));
          });
          const s = scegliLato(p, mis, { w, h }, ostacoli);
          riserva(s.lato, s.ancora, mis);
          setEtichetta((v) => (v.lato === s.lato && v.ancora === s.ancora ? v : { lato: s.lato, ancora: s.ancora }));
          setLontana(p.x < 0 || p.y < 0 || p.x > w || p.y > h || Math.abs(m.getZoom() - zoomIniziale) > 2.5);
        };
        m.on('move', () => { if (!attesa) attesa = requestAnimationFrame(aggiorna); });
        torna.current = () => {
          const vista = { center: centro, zoom: zoomIniziale };
          if (ridotto) m.jumpTo(vista); else m.flyTo({ ...vista, duration: 1200 });
        };

        osservatore = new ResizeObserver(() => { m.resize(); aggiorna(); });
        osservatore.observe(el);
        m.once('load', () => {
          if (chiusa) return;
          m.addSource('mm-serata', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: centro } } });
          m.addImage('mm-punto', { width: 28, height: 28, data: new Uint8Array(28 * 28 * 4) });
          const icona = (id: string, immagine: string) => m.addLayer({ id, type: 'symbol', source: 'mm-serata', layout: { 'icon-image': immagine, 'icon-allow-overlap': true, 'icon-ignore-placement': false } });
          icona('mm-punto', 'mm-punto');
          icona('mm-riserva', 'mm-riserva');
          aggiorna();
          setPronta(true);
          m.on('idle', () => { leggiPaesi(); aggiorna(); });
        });
        m.on('error', (ev) => { if (!chiusa && !m.loaded() && /style|webgl|planet/i.test(String(ev.error?.message))) cade(); });
      } catch {
        cade(); // niente rete o niente WebGL
      }
    }

    const fine = () => { chiusa = true; via.forEach((f) => f()); osservatore?.disconnect(); mappa?.remove(); };
    if (!('IntersectionObserver' in window)) {
      carica();
      return fine;
    }
    const osserva = new IntersectionObserver((voci) => {
      if (voci.some((v) => v.isIntersecting)) { osserva.disconnect(); carica(); }
    }, { rootMargin: '300px' });
    osserva.observe(el);
    return () => { osserva.disconnect(); fine(); };
  }, [d.lat, d.lng, d.titolo, d.sotto, zoom]);

  const attesa = !pronta;
  return (
    <div className="flex flex-col gap-2">
      <div
        ref={box}
        data-pronta={pronta}
        className="mm-grana mm-cq mm-mappa relative aspect-[4/5] w-full overflow-hidden border border-linea sm:aspect-[4/3]"
        style={{ background: FONDO }}
      >
        {/* il riquadro di attesa: curve di livello e il pin al centro, dove poi arriva la mappa */}
        <div aria-hidden="true" className={`mm-curve absolute inset-0 bg-[position:-900px_-260px] transition-opacity duration-500 motion-reduce:transition-none ${attesa ? 'opacity-60' : 'opacity-0'}`} />
        <div role="img" aria-label={etichettaMappa(d)} className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${pronta ? 'opacity-100' : 'opacity-0'}`}>
          <div ref={tela} className="h-full w-full" />
        </div>
        {attesa && (
          <div className="pointer-events-none absolute left-1/2 top-1/2"><Pin d={d} e={{ lato: 'su', ancora: 50 }} /></div>
        )}
        {pin && pronta && createPortal(<Pin d={d} e={etichetta} />, pin)}

        {attesa && (
          <span className="absolute bottom-[12px] left-3 font-mono text-[10px] leading-[14px] text-osso-3">
            {fallita ? 'LA MAPPA NON SI CARICA ADESSO · USA LE INDICAZIONI QUI SOTTO' : 'MAPPA · IN ARRIVO'}
          </span>
        )}
        {pronta && lontana && (
          <button type="button" onClick={() => torna.current()} className="absolute bottom-3 left-3 z-10 border border-linea-forte bg-notte px-3 py-[9px] font-mono text-[11px] leading-[14px] text-osso hover:border-osso">
            ⌖ Torna alla serata
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[10px] leading-[14px] text-osso-3">
        <span>{tocco ? 'DUE DITA PER ZOOM E SPOSTARTI' : 'ROTELLA PER ZOOM · TRASCINA PER SPOSTARTI'}</span>
        <span>
          {ATTRIBUZIONI.map((a, i) => (
            <span key={a.href}>{i > 0 && ' · '}<a href={a.href} target="_blank" rel="noopener noreferrer" className="text-osso-3 no-underline hover:text-osso">{a.nome}</a></span>
          ))}
        </span>
      </div>
    </div>
  );
}
