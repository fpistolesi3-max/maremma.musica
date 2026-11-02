// Invito a un PR appena aggiunto: stesso testo per il messaggio WhatsApp e per l'email di benvenuto.
// Niente di segreto qui dentro: l'indirizzo di /accedi e l'email con cui entrare.

/** Indirizzo completo della pagina di accesso (l'origine è quella del sito, senza barra finale). */
export const indirizzoAccesso = (origine: string) => `${origine.replace(/\/+$/, '')}/accedi`;

const primoNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

/** Messaggio pronto da mandare al PR su WhatsApp. */
export function testoInvitoPr(nome: string, email: string, origine: string) {
  return `Ciao ${primoNome(nome)}! Ti ho dato l'accesso alla tua area PR di Maremma Musica. `
    + `Entra da qui: ${indirizzoAccesso(origine)} e scrivi questa email: ${email}. `
    + `Ti arriva un link per entrare, niente password.`;
}

/** Apre WhatsApp con il testo già scritto (la persona sceglie a chi mandarlo). */
export const linkWhatsApp = (testo: string) => `https://wa.me/?text=${encodeURIComponent(testo)}`;
