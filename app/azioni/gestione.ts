'use server';

import { revalidatePath } from 'next/cache';
import { sessioneCorrente } from '@/lib/sessione';
import { annullaConsegna, confermaConsegna } from '@/lib/dati/gestione-pr';

/** Staff o admin: "ho ricevuto dal PR i soldi dei clienti che gli hanno pagato prima". */
export async function confermaConsegnaAzione(prId: string, eventoId: string | null, importo: number) {
  const s = await sessioneCorrente();
  if (!s || (s.utente.ruolo !== 'staff' && s.utente.ruolo !== 'admin')) return { errore: 'Accesso scaduto: rientra.' };
  try {
    const c = await confermaConsegna(s, prId, eventoId, importo);
    revalidatePath('/gestione', 'layout');
    revalidatePath('/pr', 'layout');
    return { ok: `Registrati ${c.importo} € ricevuti da te.` };
  } catch (e) {
    return { errore: (e as Error).message };
  }
}

export async function annullaConsegnaAzione(consegnaId: string) {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'admin') return { errore: 'Solo l’admin può annullare una consegna.' };
  await annullaConsegna(s, consegnaId);
  revalidatePath('/gestione', 'layout');
  revalidatePath('/pr', 'layout');
  return { ok: 'Consegna annullata.' };
}
