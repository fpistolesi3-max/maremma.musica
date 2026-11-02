/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Permette di aprire il dev server dal telefono in rete locale (test nel browser di Instagram).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
  experimental: {
    serverActions: { bodySizeLimit: '12mb' }, // upload locandina dall'admin
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '127.0.0.1', port: '54321' },
      { protocol: 'http', hostname: 'localhost', port: '54321' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // L'area PR dell'admin era sotto /gestione: i vecchi indirizzi portano alla nuova pagina (la serata scelta resta).
  async redirects() {
    return [
      { source: '/gestione', destination: '/admin/pr', permanent: false },
      { source: '/gestione/pr', destination: '/admin/pr', permanent: false },
      { source: '/gestione/pr/:handle', destination: '/admin/pr/:handle', permanent: false },
      { source: '/gestione/canali', destination: '/admin/pr/canali', permanent: false },
    ];
  },
  async headers() {
    return [
      // Il link di recupero contiene l'email: non passarla a siti terzi.
      { source: '/biglietto/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/tavolo/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
      // Istanza di test online: fuori da Google.
      ...(process.env.MM_MODALITA_PROVA === '1'
        ? [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
        : []),
    ];
  },
};

export default nextConfig;
