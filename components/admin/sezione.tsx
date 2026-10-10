'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Sezione richiudibile della pagina serata: chiuse, le sezioni stanno in una schermata.
 * I campi restano nella pagina anche da chiusi, quindi il salvataggio li manda comunque.
 * Si apre da sola se un link porta qui (#id) o se dentro c'è un campo da correggere (`forza`).
 */
export function Sezione({ id, n, titolo, nota, aperta = false, forza = false, children }: {
  id?: string; n: string; titolo: string; nota?: React.ReactNode; aperta?: boolean; forza?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(aperta || forza);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (forza) setOpen(true); }, [forza]);
  useEffect(() => {
    if (!id) return;
    const controlla = () => {
      if (window.location.hash !== `#${id}`) return;
      setOpen(true);
      // Dopo l'apertura la pagina è più lunga: si torna in cima alla sezione.
      requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start' }));
    };
    controlla();
    window.addEventListener('hashchange', controlla);
    return () => window.removeEventListener('hashchange', controlla);
  }, [id]);
  return (
    <details ref={ref} id={id} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group scroll-mt-4 border-t border-linea">
      <summary className="flex cursor-pointer list-none items-center gap-4 py-6 [&::-webkit-details-marker]:hidden">
        <span className="w-6 flex-none font-mono text-[11px] text-arancio">{n}</span>
        <span className="flex min-w-0 flex-grow flex-col gap-[6px]">
          <span className="font-display text-[26px] font-black uppercase leading-none">{titolo}</span>
          {nota && <span className="font-mono text-[11px] leading-[14px] text-osso-2">{nota}</span>}
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="flex-none text-osso-2 transition-transform group-open:rotate-180"><path d="M5 9l7 7 7-7" /></svg>
      </summary>
      <div className="flex min-w-0 flex-col gap-[18px] pb-8">{children}</div>
    </details>
  );
}
