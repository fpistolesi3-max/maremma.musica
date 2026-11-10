'use client';

import { useEffect } from 'react';
import { pulisciElencoPorta } from '@/lib/porta-pulizia';

/**
 * Aprendo qualsiasi pagina del sito, l'elenco della porta scaduto sparisce dal telefono dello staff (lib/porta-pulizia.ts).
 * Sulla porta non fa niente: lì ci pensa la porta stessa (serataFuoriPorta), con lo stato già in memoria.
 */
export function PuliziaPorta() {
  useEffect(() => {
    if (window.location.pathname.startsWith('/door')) return;
    try { pulisciElencoPorta(window.localStorage); } catch { /* localStorage bloccato */ }
  }, []);
  return null;
}
