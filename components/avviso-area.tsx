'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PARAMETRO_AVVISO } from '@/lib/costanti';

/**
 * Avviso breve quando si è stati rimandati alla propria area ("?avviso=area"): sta in alto, si chiude da solo
 * e toglie il parametro dall'indirizzo, così un ricaricamento non lo rimostra.
 */
export function AvvisoArea() {
  const parametri = useSearchParams();
  const [visibile, setVisibile] = useState(false);
  const c = parametri.get(PARAMETRO_AVVISO) === 'area';

  useEffect(() => {
    if (!c) return;
    setVisibile(true);
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAMETRO_AVVISO);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    const t = setTimeout(() => setVisibile(false), 7000);
    return () => clearTimeout(t);
  }, [c]);

  if (!visibile) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3">
      <div className="flex w-full max-w-[520px] items-center gap-3 border border-attesa bg-vinile px-4 py-3 text-[14px] leading-5 text-osso shadow-lg">
        <span className="flex-grow">Quell&apos;area non è tua: ti abbiamo portato nella tua.</span>
        <button type="button" onClick={() => setVisibile(false)} className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} aria-label="Chiudi l'avviso">Ok</button>
      </div>
    </div>
  );
}
