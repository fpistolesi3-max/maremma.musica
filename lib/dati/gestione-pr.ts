import 'server-only';
import { leggi } from './archivio';
import type { Archivio, Evento, Iscrizione, Pr, StatoIscrizione } from './tipi';
import type { Sessione } from '../sessione';
import { eventoPassato, isAttiva } from '../regole';
import { dataIso } from '../formato';
import { etichettaCanale } from '../canali';

// Gestionale dell'attività dei PR: solo admin. Lo staff della porta vede solo la porta (la lista di un PR
// la trova già con "Cerca per nome"), quindi niente numeri, incassi o classifiche dei PR.
// L'admin vede anche i contatti e può sospendere un PR (da /admin/pr).
// I soldi non passano dai PR: la prevendita si paga online, qui si vede solo quanto è stato incassato sul sito.
// Le prevendite non pagate (in attesa o scadute) non contano.
// Equivale alla funzione attivita_pr() nello schema Supabase.

function soloAdmin(s: Sessione) {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

export interface NumeriPr {
  inLista: number;
  nuovi24h: number;
  entrati: number;
  resa: number | null;          // entrati / in lista, solo se la serata è passata o in corso
  incassatoOnline: number;      // € di prevendita pagati sul sito
  annullati: number;
  ultimaAttivita: string | null;
}

export interface RigaAttivitaPr extends NumeriPr {
  pr: Pick<Pr, 'id' | 'handle' | 'nomeDisplay' | 'stato'>;
  email: string | null;         // solo admin
}

export type TipoAttivita = 'iscrizione' | 'entrato' | 'annullato' | 'rimborsato';
export interface Attivita { tipo: TipoAttivita; quando: string; nome: string; evento: string; importo: number; porta: string | null }

const ora24 = () => Date.now() - 24 * 3_600_000;

/** Conta per i numeri dei PR: tutto tranne le prevendite mai pagate. */
const conta = (i: Iscrizione) => i.stato !== 'in_attesa' && i.stato !== 'scaduta';

function numeri(tutte: Iscrizione[], conResa: boolean): NumeriPr {
  const iscr = tutte.filter(conta);
  const attive = iscr.filter(isAttiva);
  const entrati = iscr.filter((i) => i.stato === 'entrato').length;
  const date = iscr.flatMap((i) => [i.createdAt, i.pagatoAt, i.oraCheckIn, i.annullatoAt]).filter((x): x is string => Boolean(x));
  return {
    inLista: attive.length,
    nuovi24h: attive.filter((i) => new Date(i.createdAt).getTime() > ora24()).length,
    entrati,
    resa: conResa && attive.length ? Math.round((entrati / attive.length) * 100) : null,
    incassatoOnline: attive.filter((i) => i.metodoPagamento === 'online').reduce((t, i) => t + i.importo, 0),
    annullati: iscr.filter((i) => i.stato === 'annullato' || i.stato === 'rimborsato').length,
    ultimaAttivita: date.sort().at(-1) ?? null,
  };
}

/** La resa ha senso solo quando la porta è aperta o la serata è finita. */
const portaAperta = (e: Evento) => new Date(e.data).getTime() - 2 * 3_600_000 < Date.now();

/** Serata proposta di default: quella in corso o la prossima, altrimenti l'ultima passata. */
function serataDefault(d: Readonly<Archivio>) {
  const ordinate = d.eventi.slice().sort((a, b) => a.data.localeCompare(b.data));
  return ordinate.find((e) => !eventoPassato(e)) ?? ordinate.at(-1) ?? null;
}

export async function panoramicaPr(s: Sessione, eventoId: string | 'tutte' | null) {
  soloAdmin(s);
  const d = await leggi();
  const admin = s.utente.ruolo === 'admin';
  const evento = eventoId === 'tutte' ? null : d.eventi.find((e) => e.id === eventoId) ?? serataDefault(d);
  const iscr = d.iscrizioni.filter((i) => !evento || i.eventoId === evento.id);
  const conResa = evento ? portaAperta(evento) : true;

  const righe: RigaAttivitaPr[] = d.pr.map((p) => ({
    pr: { id: p.id, handle: p.handle, nomeDisplay: p.nomeDisplay, stato: p.stato },
    email: admin ? d.utenti.find((u) => u.prId === p.id)?.email ?? null : null,
    ...numeri(iscr.filter((i) => i.prId === p.id), conResa),
  })).sort((a, b) => b.inLista - a.inLista || b.entrati - a.entrati || a.pr.nomeDisplay.localeCompare(b.pr.nomeDisplay));

  const viaPr = iscr.filter((i) => i.prId);
  return {
    admin,
    evento,
    eventi: d.eventi.slice().sort((a, b) => b.data.localeCompare(a.data)).map((e) => ({ id: e.id, nome: e.nome, data: e.data })),
    righe,
    totali: numeri(viaPr, conResa),
    diretta: numeri(iscr.filter((i) => !i.prId && i.origine !== 'cassa'), conResa), // Lista Maremma Musica, senza PR
    cassa: numeri(iscr.filter((i) => i.origine === 'cassa'), true),
    prAttivi: d.pr.filter((p) => p.stato === 'attivo').length,
  };
}

function attivitaDa(d: Readonly<Archivio>, iscr: Iscrizione[]): Attivita[] {
  const nomeEvento = (id: string) => d.eventi.find((e) => e.id === id)?.nome ?? '';
  const out: Attivita[] = [];
  for (const i of iscr.filter(conta)) {
    const base = { nome: `${i.nome} ${i.cognome}`, evento: nomeEvento(i.eventoId), importo: i.importo, porta: null };
    // In lista da quando ha pagato (la prevendita gratis vale da subito).
    out.push({ ...base, tipo: 'iscrizione', quando: (i.metodoPagamento === 'online' && i.pagatoAt) || i.createdAt });
    if (i.oraCheckIn) out.push({ ...base, tipo: 'entrato', quando: i.oraCheckIn, porta: i.porta });
    if (i.annullatoAt) out.push({ ...base, tipo: i.stato === 'rimborsato' ? 'rimborsato' : 'annullato', quando: i.annullatoAt });
  }
  return out.sort((a, b) => b.quando.localeCompare(a.quando));
}

export async function dettaglioPr(s: Sessione, handle: string, eventoId: string | 'tutte' | null) {
  soloAdmin(s);
  const d = await leggi();
  const pr = d.pr.find((p) => p.handle === handle);
  if (!pr) return null;
  const admin = s.utente.ruolo === 'admin';
  const sue = d.iscrizioni.filter((i) => i.prId === pr.id && conta(i));

  const serate = d.eventi
    .filter((e) => sue.some((i) => i.eventoId === e.id) || !eventoPassato(e))
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((e) => ({ evento: e, ...numeri(sue.filter((i) => i.eventoId === e.id), portaAperta(e)) }));

  const evento = eventoId === 'tutte' ? null : d.eventi.find((e) => e.id === eventoId) ?? serataDefault(d);
  const filtrate = sue.filter((i) => !evento || i.eventoId === evento.id);

  const giorni = Array.from({ length: 14 }, (_, k) => dataIso(new Date(Date.now() - (13 - k) * 86_400_000).toISOString()));
  const perGiorno = giorni.map((g) => ({ giorno: g, n: filtrate.filter((i) => dataIso(i.createdAt) === g).length }));

  return {
    admin,
    pr: { id: pr.id, handle: pr.handle, nomeDisplay: pr.nomeDisplay, stato: pr.stato, createdAt: pr.createdAt },
    email: admin ? d.utenti.find((u) => u.prId === pr.id)?.email ?? null : null,
    evento,
    eventi: d.eventi.slice().sort((a, b) => b.data.localeCompare(a.data)).map((e) => ({ id: e.id, nome: e.nome, data: e.data })),
    numeri: numeri(filtrate, evento ? portaAperta(evento) : true),
    serate,
    perGiorno,
    iscrizioni: filtrate
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((i) => ({ id: i.id, nome: `${i.nome} ${i.cognome}`, stato: i.stato as StatoIscrizione, createdAt: i.createdAt, importo: i.importo, metodoPagamento: i.metodoPagamento, oraCheckIn: i.oraCheckIn, canale: i.canale })),
    attivita: attivitaDa(d, filtrate).slice(0, 60),
  };
}

export interface RigaCanale { canale: string; etichetta: string; inLista: number; nuovi24h: number; entrati: number; resa: number | null; quota: number }

function perCanale(iscr: Iscrizione[], conResa: boolean): RigaCanale[] {
  const gruppi = new Map<string, Iscrizione[]>();
  for (const i of iscr) { const k = i.canale || 'diretto'; gruppi.set(k, [...(gruppi.get(k) ?? []), i]); }
  const totale = iscr.filter(isAttiva).length;
  return [...gruppi.entries()].map(([canale, lista]) => {
    const n = numeri(lista, conResa);
    return { canale, etichetta: etichettaCanale(canale), inLista: n.inLista, nuovi24h: n.nuovi24h, entrati: n.entrati, resa: n.resa, quota: totale ? Math.round((n.inLista / totale) * 100) : 0 };
  }).sort((a, b) => b.inLista - a.inLista || a.etichetta.localeCompare(b.etichetta));
}

/**
 * Da dove arriva chi si mette in lista. "Senza PR" è la gente arrivata da sola (social della crew,
 * locandina, passaparola): nessun PR l'ha portata, quindi si segue a parte.
 */
export async function canaliSerata(s: Sessione, eventoId: string | 'tutte' | null) {
  soloAdmin(s);
  const d = await leggi();
  const evento = eventoId === 'tutte' ? null : d.eventi.find((e) => e.id === eventoId) ?? serataDefault(d);
  const iscr = d.iscrizioni.filter((i) => (!evento || i.eventoId === evento.id) && conta(i));
  const conResa = evento ? portaAperta(evento) : true;
  const senzaPr = iscr.filter((i) => !i.prId && i.origine !== 'cassa');
  const cassa = iscr.filter((i) => i.origine === 'cassa' && isAttiva(i));
  const conPr = iscr.filter((i) => i.prId);
  return {
    admin: s.utente.ruolo === 'admin',
    evento,
    eventi: d.eventi.slice().sort((a, b) => b.data.localeCompare(a.data)).map((e) => ({ id: e.id, nome: e.nome, data: e.data, slug: e.slug })),
    senzaPr: { numeri: numeri(senzaPr, conResa), canali: perCanale(senzaPr, conResa) },
    conPr: { numeri: numeri(conPr, conResa), canali: perCanale(conPr, conResa) },
    cassa: { ingressi: cassa.length, incassato: cassa.reduce((t, i) => t + i.importo, 0) },
  };
}
