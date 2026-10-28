'use server';

import { redirect } from 'next/navigation';
import { chiudiSessione, destinazionePer, entraConCodice, inviaAccesso, origineRichiesta } from '@/lib/sessione';
import { EMAIL_RE } from '@/lib/regole';

export interface StatoAccesso { passo: 'email' | 'codice'; email?: string; errore?: string; dopo?: string; linkSviluppo?: string }

export async function chiediAccesso(_p: StatoAccesso, f: FormData): Promise<StatoAccesso> {
  const email = String(f.get('email') ?? '').trim().toLowerCase();
  const dopo = String(f.get('dopo') ?? '') || undefined;
  if (!EMAIL_RE.test(email)) return { passo: 'email', email, dopo, errore: 'Scrivi un’email valida.' };
  const linkSviluppo = await inviaAccesso(email, await origineRichiesta(), dopo ?? null);
  return { passo: 'codice', email, dopo, linkSviluppo };
}

export async function verificaCodice(p: StatoAccesso, f: FormData): Promise<StatoAccesso> {
  const email = String(f.get('email') ?? '');
  const codice = String(f.get('codice') ?? '');
  const dopo = String(f.get('dopo') ?? '') || null;
  const s = await entraConCodice(email, codice);
  if (!s) return { ...p, passo: 'codice', email, errore: 'Codice sbagliato o scaduto. Controlla l’ultima email o chiedine uno nuovo.' };
  redirect(destinazionePer(s.utente, s.pr, dopo));
}

export async function esci() {
  await chiudiSessione();
  redirect('/accedi');
}
