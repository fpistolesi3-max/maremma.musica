// «Solo alcuni PR» senza nessun PR spuntato non vuol dire niente: prima il salvataggio lo trasformava in «tutti i PR»,
// adesso si ferma con un messaggio. Usato dal modulo (accanto al campo) e dalle azioni del server (tipi e tavoli).

export type CosaScelta = 'tipo' | 'tavolo';

/** Il messaggio da mostrare, oppure null se la scelta va bene. `modo`: "tutti" | "alcuni" | "nessuno". */
export function erroreScelta(modo: string, scelti: readonly string[], cosa: CosaScelta): string | null {
  if (modo !== 'alcuni' || scelti.length > 0) return null;
  return cosa === 'tipo'
    ? 'Hai scelto «Solo dai link di alcuni PR» ma non hai spuntato nessun PR. Spunta almeno un PR, oppure scegli «Venduto anche dai link di tutti i PR».'
    : 'Hai scelto «Solo alcuni PR» ma non hai spuntato nessun PR. Spunta almeno un PR, oppure scegli «Tutti i PR».';
}
