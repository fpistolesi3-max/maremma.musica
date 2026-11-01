'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sessioneCorrente, type Sessione } from '@/lib/sessione';
import {
  annullaFoto, confermaFoto, eliminaFoto, eliminaFotoSerata, impostaFoto, preparaFoto, salvaCreditoFoto, spostaFotoAdmin, type Destinazione,
} from '@/lib/dati/foto';

// Azioni della sezione "Foto" della serata. Tutte solo per l'admin (la regola vera sta in lib/dati/foto.ts).

async function admin(): Promise<Sessione> {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'admin') redirect('/accedi?dopo=/admin');
  return s;
}

export interface EsitoFoto { ok?: boolean; errore?: string }
const aggiorna = () => revalidatePath('/', 'layout');

/** Prima di caricare una foto: il server dice dove mandare il file grande e la miniatura. */
export async function preparaFotoAzione(eventoId: string): Promise<EsitoFoto & { id?: string; grande?: Destinazione; mini?: Destinazione }> {
  const s = await admin();
  try { return { ok: true, ...(await preparaFoto(s, eventoId)) }; } catch (e) { return { errore: (e as Error).message }; }
}

export async function confermaFotoAzione(id: string, larghezza: number, altezza: number): Promise<EsitoFoto> {
  const s = await admin();
  try { await confermaFoto(s, id, larghezza, altezza); } catch (e) { return { errore: (e as Error).message }; }
  aggiorna();
  return { ok: true };
}

export async function annullaFotoAzione(id: string): Promise<EsitoFoto> {
  const s = await admin();
  try { await annullaFoto(s, id); } catch (e) { return { errore: (e as Error).message }; }
  return { ok: true };
}

export async function impostaFotoAzione(id: string, cambio: { inEvidenza?: boolean; nascosta?: boolean }): Promise<EsitoFoto> {
  const s = await admin();
  try { await impostaFoto(s, id, cambio); } catch (e) { return { errore: (e as Error).message }; }
  aggiorna();
  return { ok: true };
}

export async function spostaFotoAzione(id: string, verso: 'prima' | 'dopo'): Promise<EsitoFoto> {
  const s = await admin();
  try { await spostaFotoAdmin(s, id, verso); } catch (e) { return { errore: (e as Error).message }; }
  aggiorna();
  return { ok: true };
}

export async function eliminaFotoAzione(id: string): Promise<EsitoFoto> {
  const s = await admin();
  try { await eliminaFoto(s, id); } catch (e) { return { errore: (e as Error).message }; }
  aggiorna();
  return { ok: true };
}

export async function eliminaTutteLeFotoAzione(eventoId: string): Promise<EsitoFoto> {
  const s = await admin();
  try { await eliminaFotoSerata(s, eventoId); } catch (e) { return { errore: (e as Error).message }; }
  aggiorna();
  return { ok: true };
}

export async function salvaCreditoAzione(eventoId: string, testo: string): Promise<EsitoFoto> {
  const s = await admin();
  try { await salvaCreditoFoto(s, eventoId, testo); } catch (e) { return { errore: (e as Error).message }; }
  aggiorna();
  return { ok: true };
}
