import 'server-only';
import { randomUUID } from 'node:crypto';
import { modifica } from './dati/archivio';

// Email transazionali. Finché il servizio vero non è configurato (TODO: cliente — es. Resend, Postmark,
// Brevo) le email restano in archivio e si leggono su /dev/posta. Se in .env.local ci sono SMTP_HOST,
// SMTP_PORT, SMTP_USER, SMTP_PASS partono davvero via SMTP.

export interface Messaggio {
  a: string;
  oggetto: string;
  html: string;
  /** Immagini inline: nel testo usa src="cid:<cid>". */
  immagini?: { cid: string; dataUrl: string }[];
}

const MITTENTE = process.env.EMAIL_MITTENTE || 'Maremma Musica <noreply@maremmamusica.it>'; // TODO: cliente

export async function inviaEmail(m: Messaggio) {
  const viaSmtp = Boolean(process.env.SMTP_HOST);
  // Nell'archivio le immagini restano come data URL, così /dev/posta le mostra.
  let htmlArchivio = m.html;
  for (const img of m.immagini ?? []) htmlArchivio = htmlArchivio.replaceAll(`cid:${img.cid}`, img.dataUrl);

  await modifica((d) => {
    d.posta.unshift({ id: randomUUID(), a: m.a, oggetto: m.oggetto, html: htmlArchivio, inviataAt: new Date().toISOString(), via: viaSmtp ? 'smtp' : 'archivio' });
    d.posta = d.posta.slice(0, 200);
  });

  if (!viaSmtp) {
    console.info(`[posta] → ${m.a} · ${m.oggetto} (leggila su /dev/posta)`);
    return;
  }
  const nodemailer = await import('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await t.sendMail({
    from: MITTENTE, to: m.a, subject: m.oggetto, html: m.html,
    attachments: (m.immagini ?? []).map((img) => ({ cid: img.cid, path: img.dataUrl, filename: `${img.cid}.png` })),
  });
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Guscio comune delle email, colori del Design System. */
export function guscioEmail(titolo: string, corpo: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#0c0f14;color:#e1d7c9;font-family:Barlow,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:32px 16px;">
<p style="font:600 12px/16px Arial,sans-serif;letter-spacing:.24em;color:#a39e95;margin:0 0 24px;">MAREMMA MUSICA</p>
<h1 style="font:900 40px/1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:0 0 16px;color:#e1d7c9;">${titolo}</h1>
${corpo}
<p style="font:400 12px/18px Arial,sans-serif;color:#77736c;margin:32px 0 0;">maremmamusica@gmail.com · @maremma.musica</p>
</div></body></html>`;
}

export function bottoneEmail(href: string, testo: string) {
  return `<p style="margin:0 0 24px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#d55b23;color:#050505;padding:16px 24px;border-radius:2px;font:600 15px/20px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;">${testo}</a></p>`;
}
