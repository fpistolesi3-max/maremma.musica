import 'server-only';
import { leggi, modifica } from './archivio';
import type { Evento, Iscrizione, StatoIscrizione } from './tipi';
import type { Sessione } from '../sessione';
import { calcolaClassifica, type RigaClassifica } from './classifica';
import { eventoPassato, isAttiva } from '../regole';
import { dataIso } from '../formato';

// Area PR. Ogni funzione riceve la sessione e filtra SEMPRE per il PR della sessione:
// è l'equivalente della policy RLS "iscrizioni_pr" (pr_id = pr_corrente()).
// La UI non passa mai un pr_id: non c'è modo di chiedere i clienti di un altro.

export interface SerataPr {
  evento: Evento;
  mie: Pick<Iscrizione, 'id' | 'nome' | 'cognome' | 'stato' | 'createdAt' | 'importo' | 'metodoPagamento' | 'oraCheckIn' | 'consegnaId'>[];
  soldi: { daConsegnare: number; consegnato: number };
  oggi: number;
  perGiorno: { giorno: string; n: number }[]; // ultimi 7 giorni, oggi per ultimo
  classifica: RigaClassifica[];
  posizione: number | null;
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
        .filter((i) => i.eventoId === evento.id && i.prId === pr.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ id, nome, cognome, stato, createdAt, importo, metodoPagamento, oraCheckIn, consegnaId }) => ({ id, nome, cognome, stato, createdAt, importo, metodoPagamento, oraCheckIn, consegnaId }));
      const alPr = mie.filter((i) => isAttiva(i) && i.metodoPagamento === 'pr');
      const attive = mie.filter(isAttiva);
      const classifica = calcolaClassifica(d, evento.id, { admin: false, prId: pr.id });
      const pos = classifica.findIndex((r) => r.sonoIo);
      return {
        evento, mie,
        soldi: {
          daConsegnare: alPr.filter((i) => !i.consegnaId).reduce((t, i) => t + i.importo, 0),
          consegnato: alPr.filter((i) => i.consegnaId).reduce((t, i) => t + i.importo, 0),
        },
        oggi: attive.filter((i) => dataIso(i.createdAt) === oggi).length,
        perGiorno: giorni.map((g) => ({ giorno: g, n: attive.filter((i) => dataIso(i.createdAt) === g).length })),
        classifica,
        posizione: pos >= 0 ? pos + 1 : null,
      };
    });
}

/** Il PR conferma di aver già incassato da un suo cliente (o annulla la conferma). */
export async function prSegnaPagato(s: Sessione, iscrizioneId: string, pagato: boolean): Promise<StatoIscrizione> {
  const pr = soloPr(s);
  return modifica((d) => {
    const i = d.iscrizioni.find((x) => x.id === iscrizioneId);
    if (!i || i.prId !== pr.id) throw new Error('non_autorizzato');
    if (i.consegnaId) return i.stato; // soldi già consegnati alla crew: non si torna indietro
    if (pagato && i.stato === 'in_lista') {
      i.stato = 'pagato'; i.metodoPagamento = 'pr'; i.pagatoAt = new Date().toISOString();
    } else if (!pagato && i.stato === 'pagato' && i.metodoPagamento === 'pr') {
      i.stato = 'in_lista'; i.metodoPagamento = null; i.pagatoAt = null;
    }
    return i.stato;
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
