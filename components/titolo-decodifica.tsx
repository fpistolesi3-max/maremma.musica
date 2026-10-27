'use client';

import { useEffect, useRef, useState } from 'react';

const GLIFI = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>+*';

/**
 * Testo che si "decodifica": le lettere scorrono tra glifi e si fermano da sinistra a destra.
 * Il testo vero è già nell'HTML (nessun salto, leggibile da screen reader e senza JS).
 * Su desktop le lettere vicino al cursore tremolano in arancio.
 */
export function TitoloDecodifica({ testo, className = '', as: Tag = 'span', ritardo = 0 }: { testo: string; className?: string; as?: 'span' | 'h1'; ritardo?: number }) {
  const radice = useRef<HTMLElement>(null);

  // le larghezze si misurano solo a font caricati: con il font di ripiego restavano bloccate troppo larghe (lettere sopra la locandina)
  const [fontPronti, setFontPronti] = useState(false);

  useEffect(() => {
    let vivo = true;
    document.fonts.ready.then(() => { if (vivo) setFontPronti(true); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    const el = radice.current;
    if (!fontPronti || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lettere = Array.from(el.querySelectorAll<HTMLElement>('[data-l]'));
    const vere = lettere.map((l) => l.textContent ?? '');
    // blocco la larghezza di ogni lettera: i glifi diversi non fanno saltare il testo
    lettere.forEach((l) => { l.style.width = `${l.getBoundingClientRect().width}px`; });

    const t0 = performance.now() + ritardo;
    const durata = 650 + lettere.length * 55;
    let raf = 0;
    let finito = false;
    let mx = -9999, my = -9999;
    let rect: DOMRect[] = [];
    const misura = () => { rect = lettere.map((l) => l.getBoundingClientRect()); };

    const passo = (ora: number) => {
      const t = ora - t0;
      let vivo = false;
      lettere.forEach((l, i) => {
        const fermaA = durata * ((i + 1) / lettere.length) * 0.9 + 200;
        let ch = vere[i];
        if (t < fermaA) {
          vivo = true;
          ch = t < 0 ? GLIFI[(i * 7) % GLIFI.length] : GLIFI[(Math.random() * GLIFI.length) | 0];
          l.style.color = 'var(--arancio)';
        } else {
          // tremolio vicino al cursore (solo puntatore preciso)
          const r = rect[i];
          const d = r ? Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2)) : 1e4;
          if (d < 90) { ch = Math.random() < 0.5 ? GLIFI[(Math.random() * GLIFI.length) | 0] : vere[i]; l.style.color = 'var(--arancio)'; }
          else l.style.color = '';
        }
        if (l.textContent !== ch) l.textContent = ch;
      });
      finito = !vivo;
      raf = requestAnimationFrame(passo);
    };

    const fine = window.matchMedia('(pointer: fine)').matches;
    const mossa = (ev: PointerEvent) => { mx = ev.clientX; my = ev.clientY; if (!rect.length || ev.type === 'pointerenter') misura(); };
    const esce = () => { mx = my = -9999; };
    if (fine) {
      el.addEventListener('pointermove', mossa);
      el.addEventListener('pointerenter', mossa);
      el.addEventListener('pointerleave', esce);
      window.addEventListener('scroll', misura, { passive: true });
    }
    misura();
    raf = requestAnimationFrame(passo);

    // dopo l'ingresso, senza puntatore preciso il ciclo si ferma del tutto
    const ferma = setInterval(() => {
      if (finito && !fine) { cancelAnimationFrame(raf); clearInterval(ferma); lettere.forEach((l, i) => { l.textContent = vere[i]; l.style.color = ''; }); }
    }, 300);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(ferma);
      el.removeEventListener('pointermove', mossa);
      el.removeEventListener('pointerenter', mossa);
      el.removeEventListener('pointerleave', esce);
      window.removeEventListener('scroll', misura);
      lettere.forEach((l, i) => { l.textContent = vere[i]; l.style.color = ''; l.style.width = ''; });
    };
  }, [testo, ritardo, fontPronti]);

  const parole = testo.split(' ');
  return (
    <Tag ref={radice as never} className={className} aria-label={testo}>
      {parole.map((p, w) => (
        <span key={w} aria-hidden="true">
          <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
          {Array.from(p).map((c, i) => (
            <span key={i} data-l style={{ display: 'inline-block', textAlign: 'center' }}>{c}</span>
          ))}
          </span>
          {w < parole.length - 1 && ' '}
        </span>
      ))}
    </Tag>
  );
}
