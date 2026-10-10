import 'server-only';
import QRCode from 'qrcode';
import type { Biglietto } from './dati/pubblico';
import type { PrenotazioneVista } from './dati/tavoli';
import { bottoneEmail, escapeHtml, guscioEmail, inviaEmail } from './posta';
import { dataPunti, euro, giornoSett, nascita, numeroEvento, orari } from './formato';
import { mostraCodice } from './qr-token';
import { luogoTesto } from './luogo';

export function linkBiglietto(origine: string, id: string, email: string) {
  return `${origine}/biglietto/${id}?email=${encodeURIComponent(email)}`;
}

/** QR come PNG: moduli vinile su fondo osso (il DS: un QR chiaro su scuro non tutti i lettori lo leggono). */
export function qrPng(token: string, larghezza = 480) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: larghezza, color: { dark: '#050505ff', light: '#e1d7c9ff' } });
}

export async function inviaBiglietto(b: Biglietto, origine: string) {
  const { iscrizione: i, evento: e } = b;
  const link = linkBiglietto(origine, i.id, i.email);
  const alPorta = i.importo > 0 ? `${euro(i.importo)} alla porta` : 'Ingresso libero';
  const corpo = `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Ci vediamo sotto cassa, ${escapeHtml(i.nome)}. Alla porta mostra questo QR con un documento.</p>
<div style="background:#050505;border:1px solid #2a303b;border-radius:2px;padding:24px;margin:0 0 24px;">
  <p style="font:400 11px/14px 'Courier New',monospace;color:#a39e95;margin:0 0 8px;">${numeroEvento(e.numero)} · LISTA</p>
  <p style="font:900 32px/1 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:0 0 8px;color:#e1d7c9;">${escapeHtml(e.nome)}</p>
  <p style="font:400 13px/18px 'Courier New',monospace;color:#a39e95;margin:0 0 20px;">${giornoSett(e.data)} ${dataPunti(e.data)} · ${orari(e.data, e.dataFine)} · ${escapeHtml(luogoTesto(e))}</p>
  <img src="cid:qr" width="280" height="280" alt="Il tuo QR" style="display:block;width:280px;height:280px;margin:0 auto 12px;border-radius:2px;">
  <p style="font:500 22px/26px 'Courier New',monospace;letter-spacing:.1em;text-align:center;margin:0 0 20px;color:#e1d7c9;">${mostraCodice(i.codice)}</p>
  <p style="font:400 14px/22px Arial,sans-serif;margin:0;color:#e1d7c9;">
    <span style="color:#a39e95;">Titolare</span> ${escapeHtml(`${i.nome} ${i.cognome}`)}<br>
    <span style="color:#a39e95;">Nato/a il</span> ${nascita(i.dataNascita)}<br>
    <span style="color:#a39e95;">Lista</span> ${escapeHtml(b.lista)}<br>
    <span style="color:#d55b23;">${alPorta}</span>
  </p>
</div>
${bottoneEmail(link, 'Apri il biglietto →')}
<p style="font:400 14px/20px Arial,sans-serif;color:#a39e95;margin:0;">Se il QR non si legge, alla porta basta dettare il codice ${mostraCodice(i.codice)}.</p>`;
  await inviaEmail({
    a: i.email,
    oggetto: `Sei in lista · ${e.nome} ${dataPunti(e.data)}`,
    html: guscioEmail('Sei in lista.', corpo),
    immagini: [{ cid: 'qr', dataUrl: await qrPng(i.tokenQr) }],
  });
}

export async function inviaRecupero(email: string, biglietti: Biglietto[], origine: string, tavoli: PrenotazioneVista[] = []) {
  const righe = biglietti.map((b) => `
<p style="margin:0 0 12px;font:400 15px/22px Arial,sans-serif;">
  <a href="${escapeHtml(linkBiglietto(origine, b.iscrizione.id, email))}" style="color:#e1d7c9;text-decoration-color:#d55b23;">${escapeHtml(b.evento.nome)} · ${dataPunti(b.evento.data)}</a>
  <span style="color:#a39e95;"> — ${escapeHtml(`${b.iscrizione.nome} ${b.iscrizione.cognome}`)}</span>
</p>`).join('') + tavoli.map((v) => `
<p style="margin:0 0 12px;font:400 15px/22px Arial,sans-serif;">
  <a href="${escapeHtml(`${origine}/tavolo/${v.prenotazione.id}?email=${encodeURIComponent(email)}`)}" style="color:#e1d7c9;text-decoration-color:#d55b23;">${escapeHtml(v.evento.nome)} · ${dataPunti(v.evento.data)} · tavolo ${escapeHtml(v.tavolo.nome)}</a>
  <span style="color:#a39e95;"> — ${v.prenotazione.stato === 'confermata' ? 'confermato' : 'in attesa di pagamento'}</span>
</p>`).join('');
  await inviaEmail({
    a: email,
    oggetto: 'I tuoi QR di Maremma Musica',
    html: guscioEmail('I tuoi QR', `<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Ecco i link ai tuoi biglietti e tavoli per le prossime serate:</p>${righe}`),
  });
}
