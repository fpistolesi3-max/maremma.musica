import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Maremma Musica', template: '%s · Maremma Musica' },
  description: 'Techno in giro per la Maremma: campi sportivi, pinete, casali. Date, lista e QR.',
  applicationName: 'Maremma Musica',
  openGraph: { siteName: 'Maremma Musica', locale: 'it_IT', type: 'website' },
  formatDetection: { telephone: false },
  // "Aggiungi a Home" su iPhone: schermo intero con il nome giusto sotto l'icona (apple-icon.png).
  appleWebApp: { capable: true, title: 'Maremma Musica', statusBarStyle: 'black' },
};

export const viewport: Viewport = {
  themeColor: '#0c0f14',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-intro su <html> lo mette lo script dell'intro prima dell'idratazione (app/(sito)/layout.tsx)
    <html lang="it" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
