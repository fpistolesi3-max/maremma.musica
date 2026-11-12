/**
 * Sezioni del sito pubblico che si possono nascondere finché il materiale non è pronto.
 * Con `false` spariscono dal menu e dalla home, e la pagina risponde 404.
 * Per rimetterle visibili basta mettere `true`.
 */
export const SEZIONI_VISIBILI = {
  /** /merch: lo shop non è ancora pronto (prodotti, foto, prezzi). */
  merch: false,
  /** /chi-siamo (voce "Crew"): mancano la storia vera e i residenti. */
  crew: false,
};
