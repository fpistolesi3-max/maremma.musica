import type { Lotto } from './dati/tipi';

// Modelli rapidi di tipi di prevendita: partono dal prezzo della serata, l'admin poi ritocca prezzi, posti e uscite.
// Le uscite sono relative alla serata, quindi seguono la data se la serata si sposta.

export type NomeModello = 'unico' | 'early-standard' | 'early-donne-standard';
export type TipoModello = Omit<Lotto, 'id' | 'eventoId' | 'ordine'>;

export const MODELLI: { id: NomeModello; nome: string; descrizione: string }[] = [
  { id: 'unico', nome: 'Un solo prezzo', descrizione: 'Un tipo "Standard" sempre in vendita.' },
  { id: 'early-standard', nome: 'Early bird + Standard', descrizione: 'Early bird da 21 giorni prima (100 posti), Standard da 7 giorni prima: l’Early bird chiude quando esce lo Standard.' },
  { id: 'early-donne-standard', nome: 'Early bird + Donne + Standard', descrizione: 'Early bird da 21 giorni prima, Donne da 14, Standard da 7: ognuno chiude quando esce il successivo.' },
];

const base: TipoModello = {
  nome: '', prezzo: 0, quantita: null, dataInizio: null, dataFine: null, visibileDaPr: true, categoria: null,
  confermaCategoria: false, uscitaGiorniPrima: null, fineOrePrima: null, dopoPrecedente: false, prAbilitati: null,
};

export function tipiDelModello(modello: NomeModello, prezzo: number): TipoModello[] {
  const meno = (n: number) => Math.max(0, prezzo - n);
  switch (modello) {
    case 'unico': return [{ ...base, nome: 'Standard', prezzo }];
    case 'early-standard': return [
      { ...base, nome: 'Early bird', prezzo: meno(2), quantita: 100, uscitaGiorniPrima: 21, fineOrePrima: 7 * 24 },
      { ...base, nome: 'Standard', prezzo, uscitaGiorniPrima: 7 },
    ];
    case 'early-donne-standard': return [
      { ...base, nome: 'Early bird', prezzo: meno(2), quantita: 100, uscitaGiorniPrima: 21, fineOrePrima: 14 * 24 },
      { ...base, nome: 'Donne', prezzo: meno(5), categoria: 'Donne', uscitaGiorniPrima: 14, fineOrePrima: 7 * 24 },
      { ...base, nome: 'Standard', prezzo, uscitaGiorniPrima: 7 },
    ];
  }
}
