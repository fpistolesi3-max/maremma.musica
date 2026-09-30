'use client';

import { useEffect } from 'react';

/**
 * Registra il service worker della porta: la pagina si riapre anche senza campo.
 * Solo sul sito pubblicato: in sviluppo i file non cambiano nome e la cache mostrerebbe codice vecchio,
 * quindi lì lo togliamo.
 */
export function RegistraServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((r) => r.forEach((x) => x.unregister())).catch(() => undefined);
      caches?.keys().then((k) => k.filter((n) => n.startsWith('mm-porta')).forEach((n) => caches.delete(n))).catch(() => undefined);
      return;
    }
    navigator.serviceWorker.register('/sw-porta.js', { scope: '/door' }).catch(() => undefined);
  }, []);
  return null;
}
