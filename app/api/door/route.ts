import { NextResponse } from 'next/server';
import { sessioneCorrente } from '@/lib/sessione';
import { checkIn, elencoPorta, limitePorta, rifiutaIngresso, segnaPorta, serataDelBiglietto } from '@/lib/dati/porta';
import type { EsitoPorta } from '@/lib/porta-logica';

export const dynamic = 'force-dynamic';

async function staff() {
  const s = await sessioneCorrente();
  return s && (s.utente.ruolo === 'staff' || s.utente.ruolo === 'admin') ? s : null;
}

/** GET /api/door?evento=… → elenco per la cache del telefono. GET /api/door?biglietto=… → di quale serata è un QR che non è in elenco. */
export async function GET(req: Request) {
  const s = await staff();
  if (!s) return NextResponse.json({ errore: 'accesso' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const biglietto = params.get('biglietto');
  if (biglietto) return NextResponse.json({ serata: await serataDelBiglietto(s, biglietto) }, { headers: { 'Cache-Control': 'no-store' } });
  const eventoId = params.get('evento');
  if (!eventoId) return NextResponse.json({ errore: 'evento' }, { status: 400 });
  return NextResponse.json({ elenco: await elencoPorta(s, eventoId), limite: await limitePorta(s, eventoId), ora: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}

interface Movimento { idLocale: string; chiave: string; ora: string; conferma?: boolean; rifiuto?: boolean }

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
    const esito = m.rifiuto
      ? await rifiutaIngresso(s, corpo.eventoId, String(m.chiave), { porta, ora: m.ora })
      : await checkIn(s, corpo.eventoId, String(m.chiave), { porta, ora: m.ora, confermato: m.conferma === true }, String(m.idLocale));
    esiti.push({ idLocale: m.idLocale, esito });
  }
  await segnaPorta(porta, corpo.eventoId);
  return NextResponse.json({ esiti, elenco: await elencoPorta(s, corpo.eventoId), limite: await limitePorta(s, corpo.eventoId), ora: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
