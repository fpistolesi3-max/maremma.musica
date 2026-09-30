'use server';

import { revalidatePath } from 'next/cache';
import { sessioneCorrente } from '@/lib/sessione';
import { prSegnaPagato } from '@/lib/dati/area-pr';

/** Il PR segna (o toglie) "pagato" su un suo cliente. Il controllo di proprietà è in prSegnaPagato. */
export async function segnaPagato(iscrizioneId: string, pagato: boolean) {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'pr') return { errore: 'Sessione scaduta: rientra.' };
  try {
    const stato = await prSegnaPagato(s, iscrizioneId, pagato);
    revalidatePath(`/pr/${s.pr!.handle}`);
    return { stato };
  } catch {
    return { errore: 'Non puoi modificare questa iscrizione.' };
  }
}
