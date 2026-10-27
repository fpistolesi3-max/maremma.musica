import { bigliettoPubblico } from '@/lib/dati/pubblico';
import { isAttiva } from '@/lib/regole';
import { luogoTesto } from '@/lib/luogo';
import { origineRichiesta } from '@/lib/sessione';
import { linkBiglietto } from '@/lib/biglietto-email';

export const dynamic = 'force-dynamic';

const ics = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Evento .ics per "Aggiungi al calendario", con il link al QR nella descrizione. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const email = new URL(req.url).searchParams.get('email');
  const b = await bigliettoPubblico(id, email);
  // Il QR c'è solo per le iscrizioni valide: una prevendita non ancora pagata non ha biglietto.
  if (!b || (!isAttiva(b.iscrizione) && !b.iscrizione.metodoPagamento)) return new Response('Biglietto non trovato', { status: 404 });
  const e = b.evento;
  const fine = e.dataFine ?? new Date(new Date(e.data).getTime() + 6 * 3_600_000).toISOString();
  const testo = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Maremma Musica//Lista//IT', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.iscrizione.id}@maremmamusica`,
    `DTSTAMP:${ics(new Date().toISOString())}`,
    `DTSTART:${ics(e.data)}`, `DTEND:${ics(fine)}`,
    `SUMMARY:${esc(`${e.nome} · Maremma Musica`)}`,
    `LOCATION:${esc(luogoTesto(e))}`,
    `DESCRIPTION:${esc(`${b.evento.senzaTelefono ? 'Il tuo biglietto (porta un documento)' : 'Il tuo QR'}: ${linkBiglietto(await origineRichiesta(), b.iscrizione.id, b.iscrizione.email)}`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return new Response(testo, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${e.slug}.ics"`, 'Cache-Control': 'private, no-store' },
  });
}
