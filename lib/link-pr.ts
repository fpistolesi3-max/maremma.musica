import type { Evento, Pr } from './dati/tipi';

// Il link di un PR per una serata (/e/<serata>/<handle>, oppure il cookie che lo ricorda per 3 giorni):
// vale solo se il PR esiste, è attivo ed è abilitato per quella serata. Altrimenti il cliente lo deve sapere
// prima di inserire i dati, invece di finire in silenzio in un'altra lista.

export type MotivoLinkNonValido = 'non_abilitato' | 'sospeso' | 'inesistente';

export type LinkPr =
  | { tipo: 'nessuno' }                                    // nessun link: Lista Maremma Musica
  | { tipo: 'valido'; pr: Pr }                             // Lista del PR, bloccata
  | { tipo: 'non_valido'; motivo: MotivoLinkNonValido; nome: string | null; da: 'link' | 'cookie' };

/** Il PR dice di sì per questa serata: attivo e (serata aperta a tutti i PR, oppure abilitato proprio lui). */
export const prAbilitato = (pr: Pr, evento: Pick<Evento, 'prAbilitati'>) =>
  pr.stato === 'attivo' && (!evento.prAbilitati || evento.prAbilitati.includes(pr.id));

function esamina(prs: readonly Pr[], evento: Pick<Evento, 'prAbilitati'>, handle: string, da: 'link' | 'cookie'): LinkPr {
  const pr = prs.find((p) => p.handle === handle.trim().toLowerCase());
  if (!pr) return { tipo: 'non_valido', motivo: 'inesistente', nome: null, da };
  if (pr.stato !== 'attivo') return { tipo: 'non_valido', motivo: 'sospeso', nome: pr.nomeDisplay, da };
  if (!prAbilitato(pr, evento)) return { tipo: 'non_valido', motivo: 'non_abilitato', nome: pr.nomeDisplay, da };
  return { tipo: 'valido', pr };
}

/**
 * Come si presenta la prevendita. Il link nell'indirizzo vince sul cookie; se il link non vale non si ripiega sul cookie.
 * `senzaPr`: il cliente ha scelto "Continua nella Lista Maremma Musica": si ignora tutto.
 */
export function valutaLinkPr(prs: readonly Pr[], evento: Pick<Evento, 'prAbilitati'>, handleUrl: string | null | undefined, handleCookie: string | null | undefined, senzaPr = false): LinkPr {
  if (senzaPr) return { tipo: 'nessuno' };
  if (handleUrl) return esamina(prs, evento, handleUrl, 'link');
  if (handleCookie) return esamina(prs, evento, handleCookie, 'cookie');
  return { tipo: 'nessuno' };
}

/** La riga di avviso in cima alla pagina. */
export function avvisoLinkPr(l: Extract<LinkPr, { tipo: 'non_valido' }>): string {
  const di = l.nome ? `Il link di ${l.nome}` : 'Questo link';
  if (l.motivo === 'non_abilitato') return `${di} non vale per questa serata.`;
  if (l.motivo === 'sospeso') return `${di} non è più attivo.`;
  return 'Questo link non è valido.';
}
