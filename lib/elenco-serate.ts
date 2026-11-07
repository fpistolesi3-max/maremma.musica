import { giorniTra } from './formato';

/** Quanto manca alla serata, a parole: "oggi", "domani", "tra 11 giorni". Dopo la mezzanotte della serata ancora in corso: "in corso". */
export function quantoManca(adessoIso: string, dataIso: string) {
  const g = giorniTra(adessoIso, dataIso);
  if (g < 0) return 'in corso';
  if (g === 0) return 'oggi';
  if (g === 1) return 'domani';
  return `tra ${g} giorni`;
}

/** Prima del giorno della serata gli entrati non hanno senso (sarebbe uno 0 che sembra un dato): si mostra "la sera". */
export const entratiDaMostrare = (adessoIso: string, dataIso: string) => giorniTra(adessoIso, dataIso) < 1;

/** Un solo stato per riga: passata vince su tutto, poi bozza, poi in vendita. */
export function statoSerata({ pubblicata, passata }: { pubblicata: boolean; passata: boolean }) {
  if (passata) return { testo: 'Passata', classe: 'mm-chip--libero' } as const;
  if (!pubblicata) return { testo: 'Bozza', classe: 'mm-chip--incassare' } as const;
  return { testo: 'In vendita', classe: 'mm-chip--entrato' } as const;
}

/** L'elenco arriva dalla più recente: in arrivo si riordina dalla più vicina, le passate restano dalla più recente. */
export function dividiSerate<T extends { passata: boolean; evento: { data: string } }>(serate: T[]) {
  const per = (a: T, b: T) => a.evento.data.localeCompare(b.evento.data);
  return {
    inArrivo: serate.filter((x) => !x.passata).sort(per),
    passate: serate.filter((x) => x.passata).sort((a, b) => per(b, a)),
  };
}

/** La serata a cui si apre una pagina senza scelta: la prossima (come "Prossima serata" nella home admin: tra quelle in arrivo vince la prima pubblicata), altrimenti l'ultima passata. */
export function serataIniziale<T extends { passata: boolean; evento: { data: string; pubblicato: boolean } }>(serate: T[]): T | null {
  const { inArrivo, passate } = dividiSerate(serate);
  return inArrivo.slice().sort((a, b) => Number(b.evento.pubblicato) - Number(a.evento.pubblicato))[0] ?? passate[0] ?? null;
}
