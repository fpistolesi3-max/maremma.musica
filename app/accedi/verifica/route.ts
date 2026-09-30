import { NextResponse } from 'next/server';
import { destinazionePer, entraConToken, origineRichiesta } from '@/lib/sessione';

export const dynamic = 'force-dynamic';

/** Link magico dall'email: apre la sessione e porta alla propria area. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // L'origine vera viene dall'header Host: req.url può dire 0.0.0.0 quando il server ascolta su tutte le interfacce.
  const origine = await origineRichiesta();
  const token = url.searchParams.get('t') ?? '';
  const s = token ? await entraConToken(token) : null;
  if (!s) return NextResponse.redirect(`${origine}/accedi?errore=link`);
  return NextResponse.redirect(`${origine}${destinazionePer(s.utente, s.pr, url.searchParams.get('dopo'))}`);
}
