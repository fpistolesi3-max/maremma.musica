import 'server-only';
import { leggi, modifica } from './dati/archivio';
import type { Sessione } from './sessione';
import { bottoneEmail, escapeHtml, guscioEmail, inviaEmail, type Messaggio } from './posta';
import { destinatariLinkSerata, linkSerataPr, motivoNoInvioLink, quandoSerata, testoPerClienti } from './link-serata';

export interface EsitoInvioLink {
  inviate: number;
  nonPartite: number;
  /** PR che non hanno ricevuto l'email, col motivo (senza email, oppure l'invio è fallito). */
  nonRaggiunti: { nome: string; motivo: string }[];
}

/**
 * Manda a ogni PR attivo e abilitato per la serata un'email col SUO link personale, la serata, la data e un testo da girare ai clienti.
 * Se un'email non parte gli altri ricevono comunque la loro. Ricorda quando e a quanti è stato fatto (campo facoltativo sulla serata:
 * le serate salvate prima non ce l'hanno e va bene, niente migrazioni). `invia` si cambia solo nei test.
 */
export async function inviaLinkSerataAiPr(s: Sessione, eventoId: string, origine: string, invia: (m: Messaggio) => Promise<void> = inviaEmail, adesso = new Date()): Promise<EsitoInvioLink> {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
  const d = await leggi();
  const evento = d.eventi.find((e) => e.id === eventoId);
  if (!evento) throw new Error('Serata non trovata');
  const motivo = motivoNoInvioLink(evento, adesso);
  if (motivo) throw new Error(motivo);

  const esito: EsitoInvioLink = { inviate: 0, nonPartite: 0, nonRaggiunti: [] };
  for (const { pr, email } of destinatariLinkSerata(d, evento)) {
    if (!email) { esito.nonRaggiunti.push({ nome: pr.nomeDisplay, motivo: 'non ha un’email' }); continue; }
    const link = linkSerataPr(origine, evento, pr.handle);
    try {
      await invia({
        a: email,
        oggetto: `Il tuo link per ${evento.nome}`,
        html: guscioEmail('Il tuo link', `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 16px;">Ciao ${escapeHtml(pr.nomeDisplay)}, ecco il tuo link per <b>${escapeHtml(evento.nome)}</b> (${escapeHtml(quandoSerata(evento))}). Chi lo apre finisce nella tua lista.</p>
${bottoneEmail(link, 'Il tuo link →')}
<p style="font:400 14px/20px Arial,sans-serif;color:#a39e95;margin:0 0 8px;">Un testo pronto da girare ai tuoi clienti:</p>
<p style="font:400 15px/22px Arial,sans-serif;margin:0 0 24px;border-left:3px solid #d55b23;padding-left:12px;">${escapeHtml(testoPerClienti(evento, link))}</p>`),
      });
      esito.inviate += 1;
    } catch (e) {
      console.error('[pr] link serata non inviato a', email, e);
      esito.nonPartite += 1;
      esito.nonRaggiunti.push({ nome: pr.nomeDisplay, motivo: 'l’email non è partita' });
    }
  }
  await modifica((a) => {
    const e = a.eventi.find((x) => x.id === eventoId);
    if (e) e.invioLinkPr = { at: adesso.toISOString(), inviate: esito.inviate, nonPartite: esito.nonPartite };
  });
  return esito;
}
