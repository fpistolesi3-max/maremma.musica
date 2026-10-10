/**
 * Strumenti di prova (account di test, "Entra subito", /dev/posta): attivi in sviluppo
 * e sull'istanza di test online con MM_MODALITA_PROVA=1. Il sito vero non imposta la variabile.
 */
export const modalitaProva = () => process.env.NODE_ENV !== 'production' || process.env.MM_MODALITA_PROVA === '1';
