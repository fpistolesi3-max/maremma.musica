import 'server-only';
import { randomUUID } from 'node:crypto';
import { MAX_POSTA, modifica } from './dati/archivio';
import { escapeHtmlBase } from './html';
import type { ViaEmail } from './avviso-email';
import { EMAIL_CONTATTI, RIGA_TITOLARE } from '@/lib/costanti';
import { modalitaProva } from './prova';

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

const SITO = (process.env.SITO_URL || 'https://maremmamusica.it').replace(/\/$/, '');
const MITTENTE = process.env.EMAIL_MITTENTE || 'Maremma Musica <noreply@maremmamusica.it>'; // TODO: cliente

/** Le email vere partono solo con SMTP_HOST; senza, restano nell'archivio di prova (e l'admin non deve credere che siano arrivate). */
export const emailVereAttive = () => Boolean(process.env.SMTP_HOST);

/** Dice com'è andata: `smtp` = partita davvero, `archivio` = rimasta solo nell'archivio di prova. */
export async function inviaEmail(m: Messaggio): Promise<ViaEmail> {
  const viaSmtp = emailVereAttive();
  // Nell'archivio le immagini restano come data URL, così /dev/posta le mostra.
  let htmlArchivio = m.html;
  for (const img of m.immagini ?? []) htmlArchivio = htmlArchivio.replaceAll(`cid:${img.cid}`, img.dataUrl);

  // Privacy: sul sito vero, con le email che partono davvero, il testo (nome, email, link, QR) NON resta nel database.
  // L'archivio serve solo a leggere la posta in prova (/dev/posta) e, senza SMTP, a non perdere i messaggi.
  if (!viaSmtp || modalitaProva()) {
    await modifica((d) => {
      d.posta.unshift({ id: randomUUID(), a: m.a, oggetto: m.oggetto, html: htmlArchivio, inviataAt: new Date().toISOString(), via: viaSmtp ? 'smtp' : 'archivio' });
      d.posta = d.posta.slice(0, MAX_POSTA);
    });
  }

  if (!viaSmtp) {
    console.info(`[posta] → ${m.a} · ${m.oggetto} (leggila su /dev/posta)`);
    return 'archivio';
  }
  const nodemailer = await import('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await t.sendMail({
    from: MITTENTE, replyTo: EMAIL_CONTATTI, to: m.a, subject: m.oggetto, html: m.html,
    attachments: (m.immagini ?? []).map((img) => ({ cid: img.cid, path: img.dataUrl, filename: `${img.cid}.png` })),
  });
  return 'smtp';
}

export const escapeHtml = escapeHtmlBase;

/** Guscio comune delle email, colori del Design System. */
export function guscioEmail(titolo: string, corpo: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#0c0f14;color:#e1d7c9;font-family:Barlow,'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:32px 16px;">
<p style="font:600 12px/16px Arial,sans-serif;letter-spacing:.24em;color:#a39e95;margin:0 0 24px;">MAREMMA MUSICA</p>
<h1 style="font:900 40px/1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:0 0 16px;color:#e1d7c9;">${titolo}</h1>
${corpo}
<p style="font:400 12px/18px Arial,sans-serif;color:#77736c;margin:32px 0 0;">${EMAIL_CONTATTI} · @maremma.musica<br>${RIGA_TITOLARE}<br><a href="${SITO}/condizioni" style="color:#77736c;">Termini e condizioni</a> · <a href="${SITO}/privacy" style="color:#77736c;">Privacy</a></p>
</div></body></html>`;
}

/**
 * Nota delle email di conferma (supporto durevole, art. 51 Codice del consumo): recesso escluso e rinvio ai termini.
 * Solo per ciò che si è pagato: le serate gratis non hanno recesso da escludere.
 */
export function notaCondizioniEmail() {
  return `<p style="font:400 13px/19px Arial,sans-serif;color:#a39e95;margin:24px 0 0;">Per le serate con data fissa non c'è diritto di recesso (art. 59, comma 1, lettera n, Codice del consumo): non si rimborsa, salvo annullamento della serata. Le regole di vendita sono nei <a href="${SITO}/condizioni" style="color:#a39e95;">termini e condizioni</a>; come trattiamo i tuoi dati, nella <a href="${SITO}/privacy" style="color:#a39e95;">privacy</a>.</p>`;
}

export function bottoneEmail(href: string, testo: string) {
  return `<p style="margin:0 0 24px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#d55b23;color:#050505;padding:16px 24px;border-radius:2px;font:600 15px/20px Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;">${testo}</a></p>`;
}
