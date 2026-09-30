import { redirect } from 'next/navigation';
import { sessioneCorrente } from '@/lib/sessione';

export const dynamic = 'force-dynamic';

/** /pr → la propria area se si è entrati come PR, altrimenti l'accesso. */
export default async function Pr() {
  const s = await sessioneCorrente();
  if (s?.utente.ruolo === 'pr' && s.pr) redirect(`/pr/${s.pr.handle}`);
  redirect('/accedi?dopo=/pr');
}
