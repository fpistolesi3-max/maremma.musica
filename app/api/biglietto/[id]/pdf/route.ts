import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { bigliettoPubblico } from '@/lib/dati/pubblico';
import { isAttiva } from '@/lib/regole';
import { qrPng } from '@/lib/biglietto-email';
import { euro, giornoSett, dataPunti, nascita, numeroEvento, orari, parti } from '@/lib/formato';
import { mostraCodice } from '@/lib/qr-token';
import { luogoTesto } from '@/lib/luogo';

export const dynamic = 'force-dynamic';

const esa = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const NOTTE = esa('#0c0f14'), VINILE = esa('#050505'), OSSO = esa('#e1d7c9'), OSSO2 = esa('#a39e95'), ARANCIO = esa('#d55b23'), LINEA = esa('#2a303b');

// I font standard del PDF usano WinAnsi: togliamo i caratteri che non sa scrivere.
const pulito = (s: string) => s.replace(/→/g, '-').replace(/[^\x20-\x7E -ÿ€]/g, '');

/** Biglietto in PDF (A6 verticale), aperto in linea: nel browser di Instagram i download diretti spesso falliscono. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = new URL(req.url).searchParams.get('email');
  const b = await bigliettoPubblico(id, email);
  // Il QR c'è solo per le iscrizioni valide: una prevendita non ancora pagata non ha biglietto.
  if (!b || (!isAttiva(b.iscrizione) && !b.iscrizione.metodoPagamento)) return new Response('Biglietto non trovato', { status: 404 });
  // Serata senza telefono: niente QR, quindi niente PDF col QR.
  if (b.evento.senzaTelefono) return new Response('Serata senza telefono: alla porta serve il documento', { status: 404 });
  const { iscrizione: i, evento: e } = b;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${e.nome} - QR ${i.nome} ${i.cognome}`);
  pdf.setAuthor('Maremma Musica');
  const W = 298, H = 420;
  const p = pdf.addPage([W, H]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NOTTE });
  p.drawRectangle({ x: 16, y: 16, width: W - 32, height: H - 32, color: VINILE, borderColor: LINEA, borderWidth: 1 });

  let y = H - 40;
  p.drawText(pulito(`${numeroEvento(e.numero)} · LISTA`), { x: 30, y, size: 7, font: mono, color: OSSO2 });
  y -= 24;
  let size = 22;
  const nome = pulito(e.nome.toUpperCase());
  while (bold.widthOfTextAtSize(nome, size) > W - 60 && size > 12) size -= 1;
  p.drawText(nome, { x: 30, y, size, font: bold, color: OSSO });
  y -= 14;
  p.drawText(pulito(`${giornoSett(e.data)} ${dataPunti(e.data)}.${parti(e.data).anno} · ${orari(e.data, e.dataFine)}`), { x: 30, y, size: 7, font: mono, color: OSSO2 });
  y -= 10;
  p.drawText(pulito(luogoTesto(e)).slice(0, 60), { x: 30, y, size: 7, font: mono, color: OSSO2 });

  // strappo tratteggiato
  y -= 12;
  p.drawLine({ start: { x: 30, y }, end: { x: W - 30, y }, thickness: 0.8, color: esa('#6a7280'), dashArray: [3, 3] });

  const qr = await pdf.embedPng(await qrPng(i.tokenQr, 600));
  const lato = 150;
  y -= lato + 14;
  p.drawImage(qr, { x: (W - lato) / 2, y, width: lato, height: lato });
  y -= 18;
  const cod = mostraCodice(i.codice);
  p.drawText(cod, { x: (W - mono.widthOfTextAtSize(cod, 14)) / 2, y, size: 14, font: mono, color: OSSO });

  y -= 26;
  p.drawText('TITOLARE', { x: 30, y, size: 6.5, font: bold, color: OSSO2 });
  y -= 12;
  p.drawText(pulito(`${i.nome} ${i.cognome}`).slice(0, 40), { x: 30, y, size: 11, font: reg, color: OSSO });
  y -= 18;
  p.drawText('NASCITA', { x: 30, y, size: 6.5, font: bold, color: OSSO2 });
  p.drawText('LISTA', { x: 150, y, size: 6.5, font: bold, color: OSSO2 });
  y -= 12;
  p.drawText(nascita(i.dataNascita), { x: 30, y, size: 10, font: reg, color: OSSO });
  p.drawText(pulito(b.lista).slice(0, 22), { x: 150, y, size: 10, font: reg, color: OSSO });

  const piede = i.stato === 'annullato' || i.stato === 'rimborsato' ? 'NON VALIDO'
    : i.importo > 0 ? `${euro(i.importo)} PAGATI ONLINE` : 'INGRESSO LIBERO';
  p.drawLine({ start: { x: 16, y: 58 }, end: { x: W - 16, y: 58 }, thickness: 0.8, color: LINEA });
  p.drawText(pulito(piede), { x: 30, y: 32, size: 14, font: bold, color: ARANCIO });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="qr-${e.slug}-${i.codice}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
