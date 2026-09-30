import type { Config } from 'tailwindcss';

// Tema Maremma Musica: i valori vivono come variabili CSS in styles/tokens.css
// (copiati dal Design System), qui li esponiamo come utility Tailwind.
const v = (name: string) => `var(--${name})`;

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '521px', md: '768px', lg: '1024px', xl: '1280px' },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      notte: { DEFAULT: v('notte'), 2: v('notte-2'), 3: v('notte-3') },
      vinile: v('vinile'),
      velo: v('velo'),
      linea: { DEFAULT: v('linea'), forte: v('linea-forte') },
      osso: { DEFAULT: v('osso'), 2: v('osso-2'), 3: v('osso-3') },
      arancio: v('arancio'),
      'su-arancio': v('su-arancio'),
      ok: v('ok'),
      attesa: v('attesa'),
      stop: { DEFAULT: v('stop'), testo: v('stop-testo') },
      'su-stato': v('su-stato'),
      barra: '#434a57',
    },
    fontFamily: {
      display: v('font-display').split(','),
      sans: v('font-sans').split(','),
      mono: v('font-mono').split(','),
    },
    borderRadius: { none: '0', sm: v('radius-sm'), full: v('radius-round') },
    extend: {
      spacing: { 18: '4.5rem', 30: '7.5rem' },
      boxShadow: { pannello: v('ombra-pannello') },
      transitionDuration: { secca: '120ms', cambio: '200ms' },
      letterSpacing: { etichetta: '.14em', logo: '.24em', bottone: '.08em' },
    },
  },
  plugins: [],
} satisfies Config;
