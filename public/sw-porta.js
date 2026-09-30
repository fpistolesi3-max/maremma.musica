// Service worker della porta: tiene in cache la pagina /door e i suoi file,
// così lo staff la riapre anche nelle location di campagna senza segnale.
// L'elenco e la coda degli ingressi stanno in localStorage (components/porta/store.ts).
const CACHE = 'mm-porta-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request('/door', { credentials: 'include' }))).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // i dati vivi passano sempre dalla rete

  // Pagina: prima la rete, senza rete l'ultima copia salvata.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put('/door', copia)); } return r; })
        .catch(() => caches.match('/door').then((r) => r || new Response('Offline', { status: 503 }))),
    );
    return;
  }

  // Script, stili, font, immagini: dalla cache, aggiornati in sottofondo.
  if (/^\/(_next\/static|fonts|img)\//.test(url.pathname) || url.pathname.endsWith('.svg')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const inCache = await c.match(req);
        const rete = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => inCache);
        return inCache || rete;
      }),
    );
  }
});
