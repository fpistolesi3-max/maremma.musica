import { sessioneCorrente } from '@/lib/sessione';
import { csvTavoli } from '@/lib/dati/admin';

export const dynamic = 'force-dynamic';

/** CSV delle prenotazioni dei tavoli di una serata, comprese quelle scadute e annullate (solo admin). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'admin') return new Response('Accesso negato', { status: 401 });
  const csv = await csvTavoli(s, (await params).id);
  if (!csv) return new Response('Serata non trovata', { status: 404 });
  return new Response(csv.testo, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${csv.nome}"`, 'Cache-Control': 'no-store' },
  });
}
