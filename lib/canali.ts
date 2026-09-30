// Da dove arriva chi si mette in lista. Funziona anche nel middleware (niente dipendenze Node).
//
// Priorità: 1) link etichettato ?da=instagram (o utm_source=…), 2) pagina di provenienza (referer),
// 3) browser interno del social (Instagram, Facebook, TikTok lo dichiarano nello user agent), 4) diretto.
// Come per i PR vince l'ultimo arrivo etichettato, ricordato 3 giorni nel cookie mm_canale.

export const COOKIE_CANALE = 'mm_canale';

export const CANALI: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  google: 'Google',
  x: 'X / Twitter',
  locandina: 'QR sulla locandina',
  sito: 'Sito',
  diretto: 'Diretto',
};

/** Canali per cui l'admin può copiare un link etichettato. */
export const CANALI_CONDIVISIBILI = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'telegram', 'locandina'];

const SINONIMI: Record<string, string> = {
  ig: 'instagram', insta: 'instagram', instagram: 'instagram', 'instagram.com': 'instagram',
  fb: 'facebook', facebook: 'facebook', meta: 'facebook',
  tt: 'tiktok', tiktok: 'tiktok',
  wa: 'whatsapp', whatsapp: 'whatsapp',
  tg: 'telegram', telegram: 'telegram',
  google: 'google', twitter: 'x', x: 'x',
  qr: 'locandina', locandina: 'locandina', flyer: 'locandina', poster: 'locandina',
  sito: 'sito', web: 'sito', diretto: 'diretto',
};

/** "IG" → "instagram"; valori sconosciuti restano leggibili ma ripuliti (massimo 24 caratteri). */
export function normalizzaCanale(valore: string | null | undefined): string | null {
  if (!valore) return null;
  const v = valore.trim().toLowerCase().replace(/[^a-z0-9.\-_]/g, '').slice(0, 24);
  if (!v) return null;
  return SINONIMI[v] ?? v;
}

export function canaleDaReferer(referer: string | null, hostProprio: string | null): string | null {
  if (!referer) return null;
  let host: string;
  try { host = new URL(referer).hostname.toLowerCase(); } catch { return null; }
  if (hostProprio && host === hostProprio.split(':')[0].toLowerCase()) return null; // navigazione interna
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return 'facebook';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return 'whatsapp';
  if (/(^|\.)(t\.me|telegram\.org)$/.test(host)) return 'telegram';
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
  if (/(^|\.)(t\.co|x\.com|twitter\.com)$/.test(host)) return 'x';
  return null;
}

export function canaleDaUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  return null;
}

export function etichettaCanale(canale: string) {
  return CANALI[canale] ?? canale.charAt(0).toUpperCase() + canale.slice(1);
}
