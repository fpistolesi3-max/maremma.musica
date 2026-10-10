import type { MetadataRoute } from 'next';

// Manifest del sito intero ("Aggiungi a Home"). La porta ha il suo, in /porta.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Maremma Musica',
    short_name: 'Maremma Musica',
    description: 'Techno in giro per la Maremma. Date, lista e QR.',
    lang: 'it',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0c0f14',
    theme_color: '#0c0f14',
    icons: [
      { src: '/img/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/img/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
