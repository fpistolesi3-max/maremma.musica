import { NextResponse } from 'next/server';
import { sessioneCorrente } from '@/lib/sessione';
import { checkIn, elencoPorta, registraCassa, segnaPorta } from '@/lib/dati/porta';
import type { MetodoPagamento } from '@/lib/dati/tipi';
import type { DatiCassa, EsitoPorta } from '@/lib/porta-logica';

export const dynamic = 'force-dynamic';

async function staff() {
  const s = await sessioneCorrente();
  return s && (s.utente.ruolo === 'staff' || s.utente.ruolo === 'admin') ? s : null;
}

/** GET /api/door?evento=… → elenco per la cache del telefono. */
export async function GET(req: Request) {
  const s = await staff();
  if (!s) return NextResponse.json({ errore: 'accesso' }, { status: 401 });
  const eventoId = new URL(req.url).searchParams.get('evento');
  if (!eventoId) return NextResponse.json({ errore: 'evento' }, { status: 400 });
  return NextResponse.json({ elenco: await elencoPorta(s, eventoId), ora: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}

interface Movimento { idLocale: string; chiave: string; incassa: boolean; metodo: MetodoPagamento; ora: string; cassa?: DatiCassa }

/**
 * POST /api/door → applica gli ingressi registrati sul telefono (anche offline, con l'orario vero)
 * e restituisce l'elenco aggiornato con gli ingressi delle altre porte.
 */
export async function POST(req: Request) {
  const s = await staff();
  if (!s) return NextResponse.json({ errore: 'accesso' }, { status: 401 });
  const corpo = (await req.json().catch(() => null)) as { eventoId?: string; porta?: string; movimenti?: Movimento[] } | null;
  if (!corpo?.eventoId || !Array.isArray(corpo.movimenti)) return NextResponse.json({ errore: 'richiesta' }, { status: 400 });
  const porta = String(corpo.porta ?? 'P1').slice(0, 8);
  const esiti: { idLocale: string; esito: EsitoPorta }[] = [];
  for (const m of corpo.movimenti.slice(0, 500)) {
    const metodo: MetodoPagamento = m.metodo === 'porta_pos' ? 'porta_pos' : 'porta_contanti';
    const esito = m.cassa
      ? await registraCassa(s, corpo.eventoId, String(m.idLocale), m.cassa, { metodo, porta, ora: m.ora })
      : await checkIn(s, corpo.eventoId, String(m.chiave), { incassa: Boolean(m.incassa), metodo, porta, ora: m.ora });
    esiti.push({ idLocale: m.idLocale, esito });
  }
  await segnaPorta(porta, corpo.eventoId);
  return NextResponse.json({ esiti, elenco: await elencoPorta(s, corpo.eventoId), ora: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
