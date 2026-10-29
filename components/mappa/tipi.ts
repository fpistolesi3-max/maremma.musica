/** Cosa serve alle mappe di "Come arrivare": il posto e il testo dell'etichetta (già pronto, scritto dal server). */
export type DatiMappa = {
  lat: number;
  lng: number;
  location: string | null;
  comune: string | null;
  /** Prima riga dell'etichetta: il nome della serata. */
  titolo: string;
  /** Seconda riga: data e luogo. */
  sotto: string;
};
