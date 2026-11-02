import { destinazionePer, sessioneCorrente } from '@/lib/sessione';
import { csvEvento } from '@/lib/dati/admin';
import { paginaAccessoNegato } from '@/lib/accesso-negato';

export const dynamic = 'force-dynamic';

function pagina(stato: number, titolo: string, testo: string, link: { href: string; testo: string }) {
  return new Response(paginaAccessoNegato(titolo, testo, link), {
    status: stato, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** CSV delle iscrizioni di una serata (solo admin). Senza permesso: una pagina che spiega cosa fare, non solo un testo. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessioneCorrente();
  if (!s) return pagina(401, 'Devi entrare', 'Per scaricare questo file serve entrare con il tuo accesso da admin.', { href: '/accedi?dopo=/admin', testo: 'Entra' });
  if (s.utente.ruolo !== 'admin') return pagina(403, 'Solo per l’admin', 'Questo file non è per il tuo accesso. Torna alla tua area.', { href: destinazionePer(s.utente, s.pr), testo: 'Vai alla tua area' });
  const csv = await csvEvento(s, (await params).id);
  if (!csv) return pagina(404, 'Serata non trovata', 'Questa serata non esiste più o l’indirizzo non è giusto.', { href: '/admin', testo: 'Torna alle serate' });
  return new Response(csv.testo, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${csv.nome}"`, 'Cache-Control': 'no-store' },
  });
}
