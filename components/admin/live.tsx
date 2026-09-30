'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Rinfresca i dati del server ogni pochi secondi: classifica e ingressi in tempo reale. */
export function AggiornamentoLive({ ogniSecondi = 4, aggiornatoAt }: { ogniSecondi?: number; aggiornatoAt: string }) {
  const router = useRouter();
  const [attivo, setAttivo] = useState(true);
  useEffect(() => {
    if (!attivo) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, ogniSecondi * 1000);
    return () => clearInterval(t);
  }, [attivo, ogniSecondi, router]);
  const ora = new Date(aggiornatoAt).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome' });
  return (
    <button type="button" onClick={() => setAttivo(!attivo)} aria-pressed={attivo}
      className={`flex items-center gap-[6px] border-0 bg-transparent p-0 font-mono text-[10px] leading-none ${attivo ? 'text-ok' : 'text-osso-2'}`}
      title={attivo ? 'Tocca per mettere in pausa' : 'Tocca per riprendere'}>
      <span className={`h-[7px] w-[7px] rounded-full ${attivo ? 'bg-ok' : 'bg-osso-3'}`} />
      {attivo ? 'LIVE' : 'IN PAUSA'} · {ora}
    </button>
  );
}
