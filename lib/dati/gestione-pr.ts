import 'server-only';
import { randomUUID } from 'node:crypto';
import { leggi, modifica } from './archivio';
import type { Archivio, Consegna, Evento, Iscrizione, Pr, StatoIscrizione } from './tipi';
import type { Sessione } from '../sessione';
import { eventoPassato, isAttiva } from '../regole';
import { dataIso } from '../formato';
import { etichettaCanale } from '../canali';

// Gestionale dell'attività dei PR: solo admin e staff.
// Lo staff vede numeri, attività e nomi in lista (li vede già alla porta), ma non le email dei PR
// e non può cambiare nulla. L'admin vede anche i contatti e può sospendere un PR (da /admin/pr).
// Equivale alla funzione attivita_pr() nello schema Supabase.

function soloStaffOAdmin(s: Sessione) {
  if (s.utente.ruolo !== 'staff' && s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

export interface NumeriPr {
  inLista: number;
  nuovi24h: number;
  entrati: number;
  resa: number | null;          // entrati / in lista, solo se la serata è passata o in corso
  pagatiAlPr: number;           // clienti che hanno pagato al PR prima della serata
  daRitirare: number;           // € incassati dal PR e non ancora consegnati alla crew
  consegnato: number;           // € già consegnati (conferma di staff o admin)
  annullati: number;
  ultimaAttivita: string | null;
}

export interface RigaAttivitaPr extends NumeriPr {
  pr: Pick<Pr, 'id' | 'handle' | 'nomeDisplay' | 'stato'>;
  email: string | null;         // solo admin
}

export type TipoAttivita = 'iscrizione' | 'pagato_al_pr' | 'entrato' | 'annullato' | 'rimborsato' | 'consegna';
export interface Attivita { tipo: TipoAttivita; quando: string; nome: string; evento: string; importo: number; porta: string | null }

const ora24 = () => Date.now() - 24 * 3_600_000;

function numeri(iscr: Iscrizione[], conResa: boolean): NumeriPr {
  const attive = iscr.filter(isAttiva);
  const pagatiPr = attive.filter((i) => i.metodoPagamento === 'pr');
  const daConsegnare = pagatiPr.filter((i) => !i.consegnaId);
  const entrati = iscr.filter((i) => i.stato === 'entrato').length;
  const date = iscr.flatMap((i) => [i.createdAt, i.pagatoAt, i.oraCheckIn, i.annullatoAt]).filter((x): x is string => Boolean(x));
  return {
    inLista: attive.length,
    nuovi24h: attive.filter((i) => new Date(i.createdAt).getTime() > ora24()).length,
    entrati,
    resa: conResa && attive.length ? Math.round((entrati / attive.length) * 100) : null,
    pagatiAlPr: pagatiPr.length,
    daRitirare: daConsegnare.reduce((t, i) => t + i.importo, 0),
    consegnato: pagatiPr.filter((i) => i.consegnaId).reduce((t, i) => t + i.importo, 0),
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
  soloStaffOAdmin(s);
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

function attivitaDa(d: Readonly<Archivio>, iscr: Iscrizione[], consegne: Consegna[] = []): Attivita[] {
  const nomeEvento = (id: string) => d.eventi.find((e) => e.id === id)?.nome ?? '';
  const out: Attivita[] = [];
  for (const i of iscr) {
    const base = { nome: `${i.nome} ${i.cognome}`, evento: nomeEvento(i.eventoId), importo: i.importo, porta: null };
    out.push({ ...base, tipo: 'iscrizione', quando: i.createdAt });
    if (i.pagatoAt && i.metodoPagamento === 'pr') out.push({ ...base, tipo: 'pagato_al_pr', quando: i.pagatoAt });
    if (i.oraCheckIn) out.push({ ...base, tipo: 'entrato', quando: i.oraCheckIn, porta: i.porta });
    if (i.annullatoAt) out.push({ ...base, tipo: i.stato === 'rimborsato' ? 'rimborsato' : 'annullato', quando: i.annullatoAt });
  }
  for (const c of consegne) {
    if (c.annullataAt) continue;
    out.push({ tipo: 'consegna', quando: c.confermataAt, nome: `Ricevuti da ${c.confermataDa}`, evento: c.eventoId ? nomeEvento(c.eventoId) : 'Tutte le serate', importo: c.importo, porta: null });
  }
  return out.sort((a, b) => b.quando.localeCompare(a.quando));
}

export async function dettaglioPr(s: Sessione, handle: string, eventoId: string | 'tutte' | null) {
  soloStaffOAdmin(s);
  const d = await leggi();
  const pr = d.pr.find((p) => p.handle === handle);
  if (!pr) return null;
  const admin = s.utente.ruolo === 'admin';
  const sue = d.iscrizioni.filter((i) => i.prId === pr.id);

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
      .map((i) => ({ id: i.id, nome: `${i.nome} ${i.cognome}`, stato: i.stato as StatoIscrizione, createdAt: i.createdAt, importo: i.importo, metodoPagamento: i.metodoPagamento, oraCheckIn: i.oraCheckIn, consegnaId: i.consegnaId, canale: i.canale })),
    attivita: attivitaDa(d, filtrate, d.consegne.filter((c) => c.prId === pr.id && (!evento || c.eventoId === evento.id || c.eventoId === null))).slice(0, 60),
    consegne: d.consegne
      .filter((c) => c.prId === pr.id)
      .sort((a, b) => b.confermataAt.localeCompare(a.confermataAt))
      .map((c) => ({ ...c, evento: c.eventoId ? d.eventi.find((e) => e.id === c.eventoId)?.nome ?? '' : 'Tutte le serate' })),
  };
}

/**
 * Staff o admin confermano di aver ricevuto dal PR i soldi dei clienti che gli hanno pagato prima.
 * Si registrano importo, clienti, chi ha ricevuto e quando; quei pagamenti non contano più "da ritirare".
 */
export async function confermaConsegna(s: Sessione, prId: string, eventoId: string | null, importoAtteso: number) {
  soloStaffOAdmin(s);
  return modifica((d) => {
    const pr = d.pr.find((p) => p.id === prId);
    if (!pr) throw new Error('PR non trovato');
    const daConsegnare = d.iscrizioni.filter((i) => i.prId === prId && i.metodoPagamento === 'pr' && isAttiva(i) && !i.consegnaId && (!eventoId || i.eventoId === eventoId));
    const importo = daConsegnare.reduce((t, i) => t + i.importo, 0);
    if (!daConsegnare.length) throw new Error('Non c\u2019è niente da ritirare da questo PR');
    // Se nel frattempo il PR ha segnato altri pagati la cifra cambia: meglio fermarsi e ricontare.
    if (Math.abs(importo - importoAtteso) > 0.001) throw new Error(`La cifra è cambiata: ora sono ${importo} €. Ricontrolla e conferma di nuovo.`);
    const c: Consegna = {
      id: randomUUID(), prId, eventoId, importo, iscrizioni: daConsegnare.map((i) => i.id),
      confermataDa: s.utente.email, confermataAt: new Date().toISOString(), annullataAt: null, annullataDa: null,
    };
    d.consegne.push(c);
    for (const i of daConsegnare) i.consegnaId = c.id;
    return c;
  });
}

/** Solo l'admin può annullare una consegna registrata per errore. */
export async function annullaConsegna(s: Sessione, consegnaId: string) {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
  await modifica((d) => {
    const c = d.consegne.find((x) => x.id === consegnaId);
    if (!c || c.annullataAt) return;
    c.annullataAt = new Date().toISOString();
    c.annullataDa = s.utente.email;
    for (const i of d.iscrizioni) if (i.consegnaId === c.id) i.consegnaId = null;
  });
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
  soloStaffOAdmin(s);
  const d = await leggi();
  const evento = eventoId === 'tutte' ? null : d.eventi.find((e) => e.id === eventoId) ?? serataDefault(d);
  const iscr = d.iscrizioni.filter((i) => !evento || i.eventoId === evento.id);
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
