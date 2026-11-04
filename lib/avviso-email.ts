// Testi per l'admin quando le email vere non sono attive. Puro, senza dipendenze dal server: lo usano azioni, pagine e test.

/** Com'è andato un invio: `smtp` = partita davvero, `archivio` = rimasta solo nell'archivio interno di prova. */
export type ViaEmail = 'smtp' | 'archivio';

/** "Benvenuto" dopo "Aggiungi PR": `errore` se l'invio è fallito. Con `archivio` non si dice che l'email è partita. */
export function esitoBenvenutoPr(nome: string, email: string, via: ViaEmail | 'errore'): { ok: string; avviso?: string } {
  if (via === 'smtp') return { ok: `${nome} è dentro. Gli è partita l’email di benvenuto.` };
  if (via === 'archivio') {
    return { ok: `${nome} è dentro.`, avviso: 'L’email di benvenuto non è partita: le email vere non sono ancora attive. Mandagli l’invito su WhatsApp.' };
  }
  return { ok: `${nome} è dentro.`, avviso: `L’email di benvenuto a ${email} non è partita. Il PR è stato aggiunto lo stesso: mandagli l’invito su WhatsApp.` };
}

/** Esito di "Manda a tutti il link della serata" sotto il pulsante: titolo e, se serve, la spiegazione. */
export function titoloEsitoInvioLink(e: { inviate: number; nonPartite: number; inArchivio?: number }) {
  const archivio = e.inArchivio ?? 0;
  if (archivio > 0 && e.inviate === 0) {
    return {
      titolo: `Nessuna email inviata · ${archivio} rimast${archivio === 1 ? 'a' : 'e'} nell’archivio di prova${e.nonPartite ? ` · ${e.nonPartite} non partite` : ''}`,
      nota: 'Le email vere non sono ancora attive, quindi i PR non hanno ricevuto niente. Mandagli il link su WhatsApp dalla riga di ognuno.',
    };
  }
  return { titolo: `Inviate ${e.inviate} email · ${e.nonPartite} non partite${archivio ? ` · ${archivio} rimaste nell’archivio di prova` : ''}`, nota: null };
}

/** Domanda di conferma di "Manda a tutti il link della serata". */
export function domandaInvioLink(nomeSerata: string, destinatari: number, ultimo: string | null, emailVere: boolean) {
  if (!emailVere) {
    return `Le email vere non sono ancora attive: le ${destinatari} email di ${nomeSerata} resteranno nell’archivio di prova e i PR non riceveranno niente.${ultimo ? `\n\n${ultimo}.` : ''}\n\nVuoi provare lo stesso?`;
  }
  return ultimo
    ? `Il link di ${nomeSerata} è già stato mandato. ${ultimo}.\n\nVuoi mandarlo di nuovo a ${destinatari} PR? Riceveranno un'altra email.`
    : `Mando il link di ${nomeSerata} a ${destinatari} PR?`;
}

/** Nelle conferme di annullamento: dice se al cliente arriva l'email. Senza email vere deve avvisarlo l'admin. */
export const fraseEmailCliente = (emailVere: boolean) => (emailVere
  ? 'al cliente arriva un’email'
  : 'al cliente non arriva nessuna email (le email vere non sono ancora attive): avvisalo tu');
