import 'server-only';
import { leggi } from './archivio';
import type { Evento, Iscrizione } from './tipi';
import type { Sessione } from '../sessione';
import { posizionePr, type PosizionePr } from './classifica';
import { eventoPassato, isAttiva, iscrizioneScaduta, prezzoVendibile, type PrezzoTipi } from '../regole';
import { usatiPerLotto } from './pubblico';
import { dataIso } from '../formato';

// Area PR. Ogni funzione riceve la sessione e filtra SEMPRE per il PR della sessione:
// è l'equivalente della policy RLS "iscrizioni_pr" (pr_id = pr_corrente()).
// La UI non passa mai un pr_id: non c'è modo di chiedere i clienti di un altro.
// I soldi non passano dal PR: la prevendita si paga solo online. Il PR vede chi ha pagato ed è in lista; di chi ha
// iniziato senza pagare vede soltanto quanti sono (nessun nome, email, telefono o data).
// Degli altri PR e di "Maremma Musica" non vede niente: solo la propria posizione in classifica.

export interface SerataPr {
  evento: Evento;
  prezzoTipi: PrezzoTipi | null; // calcolato dai tipi di prevendita
  mie: Pick<Iscrizione, 'id' | 'nome' | 'cognome' | 'stato' | 'createdAt' | 'importo' | 'oraCheckIn'>[];
  oggi: number;
  perGiorno: { giorno: string; n: number }[]; // ultimi 7 giorni, oggi per ultimo
  nonPagati: number;              // prevendite iniziate e non ancora pagate (ancora nel termine): solo il numero
  classifica: PosizionePr;        // la sua posizione e basta
}

function soloPr(s: Sessione) {
  if (s.utente.ruolo !== 'pr' || !s.pr) throw new Error('non_autorizzato');
  return s.pr;
}

export async function serateDelPr(s: Sessione): Promise<SerataPr[]> {
  const pr = soloPr(s);
  const d = await leggi();
  const oggi = dataIso(new Date().toISOString());
  const giorni = Array.from({ length: 7 }, (_, k) => dataIso(new Date(Date.now() - (6 - k) * 86_400_000).toISOString()));

  return d.eventi
    .filter((e) => e.pubblicato && !eventoPassato(e) && (!e.prAbilitati || e.prAbilitati.includes(pr.id)))
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((evento) => {
      const mie = d.iscrizioni
        .filter((i) => i.eventoId === evento.id && i.prId === pr.id && i.stato !== 'in_attesa' && i.stato !== 'scaduta')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ id, nome, cognome, stato, createdAt, importo, oraCheckIn }) => ({ id, nome, cognome, stato, createdAt, importo, oraCheckIn }));
      const attive = mie.filter(isAttiva);
      const adesso = new Date();
      const nonPagati = d.iscrizioni.filter((i) => i.eventoId === evento.id && i.prId === pr.id && i.stato === 'in_attesa' && !iscrizioneScaduta(i, adesso)).length;
      return {
        evento, mie, prezzoTipi: prezzoVendibile(evento, d.lotti, usatiPerLotto(d, evento.id)),
        oggi: attive.filter((i) => dataIso(i.createdAt) === oggi).length,
        perGiorno: giorni.map((g) => ({ giorno: g, n: attive.filter((i) => dataIso(i.createdAt) === g).length })),
        nonPagati,
        classifica: posizionePr(d, evento.id, pr.id),
      };
    });
}

/** Totali di tutte le serate del PR (anche passate). */
export async function totaliPr(s: Sessione) {
  const pr = soloPr(s);
  const d = await leggi();
  const mie = d.iscrizioni.filter((i) => i.prId === pr.id);
  return {
    iscritti: mie.filter(isAttiva).length,
    entrati: mie.filter((i) => i.stato === 'entrato').length,
    serate: new Set(mie.map((i) => i.eventoId)).size,
  };
}
