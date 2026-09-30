'use client';

import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

/**
 * Lettore QR con la fotocamera posteriore. Usa BarcodeDetector dove c'è (Chrome Android),
 * altrimenti jsQR su un canvas (Safari iOS). Serve una pagina sicura: localhost o https.
 */
export function Fotocamera({ attiva, onLettura, torcia }: { attiva: boolean; onLettura: (testo: string) => void; torcia: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const flusso = useRef<MediaStream | null>(null);
  const ultima = useRef<{ testo: string; t: number }>({ testo: '', t: 0 });
  const [errore, setErrore] = useState<string | null>(null);
  const callback = useRef(onLettura);
  callback.current = onLettura;

  useEffect(() => {
    if (!attiva) return;
    let fermo = false;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    type Rilevatore = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Rilevatore }).BarcodeDetector;
    const rilevatore = BD ? new BD({ formats: ['qr_code'] }) : null;

    async function avvia() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrore(window.isSecureContext ? 'Questo browser non dà accesso alla fotocamera.' : 'La fotocamera funziona solo su https o localhost.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (fermo) { s.getTracks().forEach((t) => t.stop()); return; }
        flusso.current = s;
        const v = video.current!;
        v.srcObject = s;
        v.setAttribute('playsinline', 'true');
        await v.play();
        setErrore(null);
        ciclo();
      } catch {
        setErrore('Fotocamera non disponibile: dai il permesso o usa "Cerca per nome".');
      }
    }

    async function leggi(): Promise<string | null> {
      const v = video.current;
      if (!v || v.readyState < 2) return null;
      if (rilevatore) {
        try { const r = await rilevatore.detect(v); return r[0]?.rawValue ?? null; } catch { /* ripiega su jsQR */ }
      }
      if (!ctx) return null;
      // Ritaglio centrale ridotto: più veloce e più stabile al buio.
      const lato = Math.min(v.videoWidth, v.videoHeight);
      const dim = Math.min(lato, 640);
      canvas.width = dim; canvas.height = dim;
      ctx.drawImage(v, (v.videoWidth - lato) / 2, (v.videoHeight - lato) / 2, lato, lato, 0, 0, dim, dim);
      const img = ctx.getImageData(0, 0, dim, dim);
      return jsQR(img.data, dim, dim, { inversionAttempts: 'dontInvert' })?.data ?? null;
    }

    async function ciclo() {
      if (fermo) return;
      const testo = await leggi();
      const adesso = Date.now();
      // Lo stesso QR davanti alla camera non viene letto due volte di fila.
      if (testo && (testo !== ultima.current.testo || adesso - ultima.current.t > 4000)) {
        ultima.current = { testo, t: adesso };
        navigator.vibrate?.(60);
        callback.current(testo);
      }
      timer = setTimeout(ciclo, 180);
    }

    void avvia();
    return () => {
      fermo = true;
      clearTimeout(timer);
      flusso.current?.getTracks().forEach((t) => t.stop());
      flusso.current = null;
    };
  }, [attiva]);

  useEffect(() => {
    const traccia = flusso.current?.getVideoTracks()[0];
    if (!traccia) return;
    traccia.applyConstraints({ advanced: [{ torch: torcia } as MediaTrackConstraintSet] }).catch(() => undefined);
  }, [torcia]);

  return (
    <>
      <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      {errore && <p className="absolute inset-x-3 bottom-3 m-0 bg-vinile p-3 text-center text-[13px] leading-5 text-attesa">{errore}</p>}
    </>
  );
}
