import { escapeHtmlBase } from './html';

/**
 * Pagina leggibile per chi apre un file riservato (es. il CSV) senza averne il permesso: dice cosa è successo
 * e dove andare, invece del solo testo "Accesso negato". Stessi colori del sito.
 */
export function paginaAccessoNegato(titolo: string, testo: string, link: { href: string; testo: string }) {
  const e = escapeHtmlBase;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(titolo)} · Maremma Musica</title></head>
<body style="margin:0;background:#050505;color:#e1d7c9;font-family:'Helvetica Neue',Arial,sans-serif;">
<main style="max-width:480px;margin:0 auto;padding:48px 16px;">
<p style="font:600 12px/16px Arial,sans-serif;letter-spacing:.24em;color:#a39e95;margin:0 0 24px;">MAREMMA MUSICA</p>
<h1 style="font:900 40px/1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:0 0 16px;">${e(titolo)}</h1>
<p style="font:400 17px/26px Arial,sans-serif;margin:0 0 32px;color:#a39e95;">${e(testo)}</p>
<a href="${e(link.href)}" style="display:inline-block;background:#d55b23;color:#050505;padding:16px 24px;border-radius:2px;font:600 15px/20px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;">${e(link.testo)}</a>
</main></body></html>`;
}
