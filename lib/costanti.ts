/** Cookie di attribuzione PR: vale 3 giorni, vince l'ultimo link PR visitato. */
export const COOKIE_PR = 'mm_pr';
export const DURATA_COOKIE_PR = 3 * 24 * 60 * 60;
/** Segmenti sotto /e/[slug]/ che non sono handle di PR. */
export const SEGMENTI_RISERVATI = ['prevendita'];
/** Percorso (con query) che il middleware segna sulla richiesta: serve a tornare alla pagina giusta dopo l'accesso. */
export const HEADER_PERCORSO = 'x-mm-percorso';
/** Se una pagina rimanda alla tua area perché quella aperta non è tua, aggiunge `?avviso=area`. */
export const PARAMETRO_AVVISO = 'avviso';
/** L'unico indirizzo email mostrato nel sito (contatti, assistenza, privacy, booking, foto). Le email automatiche partono da EMAIL_MITTENTE (noreply@) e le risposte arrivano qui. */
export const EMAIL_CONTATTI = 'info@maremmamusica.it';
