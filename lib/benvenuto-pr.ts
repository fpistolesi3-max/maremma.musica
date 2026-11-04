import 'server-only';
import { bottoneEmail, escapeHtml, guscioEmail, inviaEmail } from './posta';
import type { ViaEmail } from './avviso-email';
import { indirizzoAccesso } from './inviti';

/** Email di benvenuto per un PR appena aggiunto: dove entrare e con quale email. Usa lo stesso invio delle altre email. */
export async function inviaBenvenutoPr(pr: { nome: string; email: string }, origine: string): Promise<ViaEmail> {
  return inviaEmail({
    a: pr.email,
    oggetto: 'Benvenuto tra i PR di Maremma Musica',
    html: guscioEmail('Benvenuto', `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 16px;">Ciao ${escapeHtml(pr.nome)}, ti abbiamo dato l'accesso alla tua area PR: lì trovi il tuo link da condividere, la tua lista e la tua posizione.</p>
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Per entrare apri la pagina di accesso e scrivi questa email: <b>${escapeHtml(pr.email)}</b>. Ti arriva un link per entrare, niente password.</p>
${bottoneEmail(indirizzoAccesso(origine), 'Vai all’accesso →')}
<p style="font:400 12px/18px Arial,sans-serif;color:#77736c;margin:0;">Non ti aspettavi questa email? Ignorala.</p>`),
  });
}
