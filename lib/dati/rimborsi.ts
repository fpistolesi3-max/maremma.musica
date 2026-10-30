import 'server-only';
import { randomUUID } from 'node:crypto';
import { leggi, modifica } from './archivio';
import type { Archivio, Iscrizione, MotivoRimborso, PagamentoInPiu, PagamentoOnline, PrenotazioneTavolo, Rimborso } from './tipi';
import type { Sessione } from '../sessione';
import { bigliettoDi, type Biglietto } from './pubblico';
import { vista, type PrenotazioneVista } from './tavoli';
import { inCentesimi, prenotazioneAttiva } from '../regole';

// Rimborsi dei pagamenti online di prevendite e tavoli. Qui si decide cosa va restituito e si tiene lo stato di ogni
// rimborso; la chiamata a Stripe sta in lib/rimborso.ts. Un rimborso passa da due scritture: "in corso" PRIMA di chiamare
// Stripe (con la chiave di idempotenza) e "fatto" dopo. Ogni pagamento si rimborsa una volta sola.

/** Un rimborso già avviato da meno di tanti secondi blocca un secondo clic o un altro admin; dopo si può riprovare (stessa chiave). */
export const SECONDI_RIMBORSO_IN_CORSO = 30;

function soloAdmin(s: Sessione) {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

export type TipoOrdine = 'prevendita' | 'tavolo';
/** Quale pagamento: senza `pagamento` è quello principale dell'ordine, altrimenti uno degli "in più". */
export interface Bersaglio { tipo: TipoOrdine; id: string; pagamento?: string | null }

type Ordine = Iscrizione | PrenotazioneTavolo;
interface Trovato { ordine: Ordine; po: PagamentoOnline; voce: PagamentoOnline | PagamentoInPiu; primario: boolean; pagamento: string | null }

function trova(d: Archivio, b: Bersaglio): Trovato | null {
  const ordine: Ordine | undefined = b.tipo === 'prevendita' ? d.iscrizioni.find((x) => x.id === b.id) : d.prenotazioni.find((x) => x.id === b.id);
  if (!ordine) return null;
  const po = (ordine.pagamentoOnline ??= { sessione: null, pagamento: null, daRimborsare: false });
  if (b.pagamento && b.pagamento !== po.pagamento) {
    const extra = po.inPiu?.find((x) => x.pagamento === b.pagamento);
    return extra ? { ordine, po, voce: extra, primario: false, pagamento: extra.pagamento } : null;
  }
  return { ordine, po, voce: po, primario: true, pagamento: po.pagamento };
}

function inCorsoRecente(r: Rimborso | null | undefined, adesso: Date) {
  return r?.stato === 'in_corso' && adesso.getTime() - new Date(r.avviatoAt).getTime() < SECONDI_RIMBORSO_IN_CORSO * 1000;
}

/** Cosa si può restituire sul pagamento principale: pagato davvero (anche in cassa, storico) oppure segnato come da rimborsare. */
function principaleRimborsabile(t: Trovato) {
  if (t.po.daRimborsare) return true;
  if ('stato' in t.ordine && 'lottoId' in t.ordine) {
    const i = t.ordine;
    return Boolean(i.metodoPagamento) && (i.stato === 'pagato' || i.stato === 'entrato' || i.stato === 'in_lista' || i.stato === 'annullato');
  }
  return (t.ordine as PrenotazioneTavolo).stato === 'confermata';
}

export type EsitoAvvio =
  | { esito: 'avviato'; chiave: string; pagamento: string; importo: number; primario: boolean }
  | { esito: 'manuale' }   // pagato fuori dal sito (storico, ingresso in cassa): non c'è niente da chiamare, si restituisce a mano
  | { esito: 'gia' };      // già rimborsato

/**
 * Prima fase: segna "rimborso in corso" e dà la chiave per Stripe. Solo admin. Se è già stato fatto non fa niente; se un altro
 * clic l'ha avviato da pochi secondi rifiuta. Dopo un errore di rete incerto riusa la chiave già scritta.
 */
export async function avviaRimborso(s: Sessione, b: Bersaglio, adesso = new Date()): Promise<EsitoAvvio> {
  soloAdmin(s);
  return modifica((d): EsitoAvvio => {
    const t = trova(d, b);
    if (!t) throw new Error('Pagamento non trovato');
    if (t.voce.rimborso?.stato === 'fatto') return { esito: 'gia' };
    if (t.primario && !principaleRimborsabile(t)) {
      if ('stato' in t.ordine && (t.ordine.stato === 'rimborsato' || t.ordine.stato === 'rimborsata')) return { esito: 'gia' };
      throw new Error('Questo ordine non ha niente da rimborsare');
    }
    if (!t.pagamento) return { esito: 'manuale' };
    if (inCorsoRecente(t.voce.rimborso, adesso)) throw new Error('Il rimborso è già in corso: aspetta qualche secondo e ricontrolla');
    const chiave = t.voce.rimborso?.chiave ?? `mm-rimborso-${randomUUID()}`;
    t.voce.rimborso = { stato: 'in_corso', chiave, avviatoAt: adesso.toISOString(), fattoAt: null, da: s.utente.email };
    const importo = t.primario ? ('importo' in t.ordine ? t.ordine.importo : t.ordine.spesaMinima) : (t.voce as PagamentoInPiu).centesimi / 100;
    return { esito: 'avviato', chiave, pagamento: t.pagamento, importo, primario: t.primario };
  });
}

/** Stripe ha rifiutato (non è partito niente): si toglie lo stato "in corso", il prossimo tentativo avrà una chiave nuova. */
export async function rimborsoRespinto(s: Sessione, b: Bersaglio): Promise<void> {
  soloAdmin(s);
  await modifica((d) => {
    const t = trova(d, b);
    if (t?.voce.rimborso?.stato === 'in_corso') t.voce.rimborso = null;
  });
}

export type Chiusura =
  | { tipo: 'prevendita'; biglietto: Biglietto }
  | { tipo: 'tavolo'; vista: PrenotazioneVista };

/** Segna fatto il rimborso e, se è il pagamento principale, chiude l'ordine (QR che smette di valere, tavolo libero). */
function segnaFatto(d: Archivio, t: Trovato, da: string, adesso: Date): Chiusura | null {
  const ora = adesso.toISOString();
  t.voce.rimborso = { stato: 'fatto', chiave: t.voce.rimborso?.chiave ?? `mm-rimborso-${randomUUID()}`, avviatoAt: t.voce.rimborso?.avviatoAt ?? ora, fattoAt: ora, da };
  if (!t.primario) return null;
  t.po.daRimborsare = false;
  const o = t.ordine;
  if ('lottoId' in o) {
    if (o.stato === 'rimborsato') return null;
    o.stato = 'rimborsato';
    o.annullatoAt = ora;
    return { tipo: 'prevendita', biglietto: bigliettoDi(d, o)! };
  }
  if (o.stato === 'rimborsata') return null;
  const teneva = prenotazioneAttiva(o);
  o.stato = 'rimborsata';
  o.chiusaAt = ora;
  o.chiusaDa = da;
  o.avvisoChiusuraAt = ora;   // l'email al cliente parte subito, dall'azione
  if (teneva) {
    const tavolo = d.tavoli.find((x) => x.id === o.tavoloId);
    if (tavolo && (tavolo.stato === 'riservato' || tavolo.stato === 'confermato')) tavolo.stato = 'libero';
  }
  return { tipo: 'tavolo', vista: vista(d, o)! };
}

/**
 * Seconda fase: Stripe ha confermato. Si scrive "fatto" e si chiude l'ordine. Chiamabile più volte: la seconda non fa niente.
 * Restituisce l'ordine chiuso (per l'email al cliente) solo la prima volta.
 */
export async function concludiRimborso(s: Sessione, b: Bersaglio, adesso = new Date()): Promise<Chiusura | null> {
  soloAdmin(s);
  return modifica((d) => {
    const t = trova(d, b);
    if (!t) throw new Error('Pagamento non trovato');
    if (t.voce.rimborso?.stato === 'fatto') return null;
    return segnaFatto(d, t, s.utente.email, adesso);
  });
}

export type EsitoRimborsoEsterno = { esito: 'registrato'; chiusura: Chiusura | null } | { esito: 'gia' } | { esito: 'sconosciuto' };

/**
 * Webhook `charge.refunded`: Stripe dice che questo pagamento è stato restituito (da noi o dalla Dashboard di Stripe).
 * Si registra una volta sola; se è il pagamento principale l'ordine si chiude. Non c'è una sessione admin: la firma del webhook garantisce Stripe.
 */
export async function registraRimborsoEsterno(pagamento: string, adesso = new Date()): Promise<EsitoRimborsoEsterno> {
  return modifica((d): EsitoRimborsoEsterno => {
    for (const tipo of ['prevendita', 'tavolo'] as const) {
      for (const o of tipo === 'prevendita' ? d.iscrizioni : d.prenotazioni) {
        if (o.pagamentoOnline?.pagamento !== pagamento && !o.pagamentoOnline?.inPiu?.some((x) => x.pagamento === pagamento)) continue;
        const t = trova(d, { tipo, id: o.id, pagamento })!;
        if (t.voce.rimborso?.stato === 'fatto') return { esito: 'gia' };
        return { esito: 'registrato', chiusura: segnaFatto(d, t, 'Stripe', adesso) };
      }
    }
    return { esito: 'sconosciuto' };
  });
}

// ------------------------------------------------------------------ elenco "Da rimborsare"

export interface VoceRimborso {
  chiave: string;              // unica nell'elenco
  bersaglio: { tipo: TipoOrdine; id: string; pagamento: string };
  eventoId: string; serata: string;
  persona: string; email: string | null;
  importo: number;
  motivo: MotivoRimborso | null;
  at: string;                  // quando è arrivato il pagamento
  stato: 'da_rimborsare' | 'in_corso' | 'rimborsato';
  fattoAt: string | null;
}

/** Tutti i pagamenti che hanno un rimborso da fare, in corso o fatto, letti dai dati. Funzione pura. */
export function vociRimborso(d: Readonly<Archivio>): VoceRimborso[] {
  const out: VoceRimborso[] = [];
  const serata = (id: string) => d.eventi.find((e) => e.id === id)?.nome ?? '';
  const stato = (r: Rimborso | null | undefined): VoceRimborso['stato'] => (r?.stato === 'fatto' ? 'rimborsato' : r?.stato === 'in_corso' ? 'in_corso' : 'da_rimborsare');
  const aggiungi = (tipo: TipoOrdine, o: Ordine, eventoId: string, persona: string, email: string | null, importo: number) => {
    const po = o.pagamentoOnline;
    if (!po) return;
    if (po.pagamento && (po.daRimborsare || po.rimborso)) {
      out.push({
        chiave: `${tipo}:${o.id}:${po.pagamento}`, bersaglio: { tipo, id: o.id, pagamento: po.pagamento }, eventoId, serata: serata(eventoId), persona, email,
        importo, motivo: po.motivo ?? null, at: o.pagatoAt ?? o.createdAt, stato: stato(po.rimborso), fattoAt: po.rimborso?.fattoAt ?? null,
      });
    }
    for (const x of po.inPiu ?? []) {
      out.push({
        chiave: `${tipo}:${o.id}:${x.pagamento}`, bersaglio: { tipo, id: o.id, pagamento: x.pagamento }, eventoId, serata: serata(eventoId), persona, email,
        importo: x.centesimi / 100, motivo: x.motivo, at: x.at, stato: stato(x.rimborso), fattoAt: x.rimborso?.fattoAt ?? null,
      });
    }
  };
  for (const i of d.iscrizioni) aggiungi('prevendita', i, i.eventoId, i.anonimizzata ? 'Dati cancellati' : `${i.nome} ${i.cognome}`, i.anonimizzata ? null : i.email, i.importo);
  for (const p of d.prenotazioni) aggiungi('tavolo', p, p.eventoId, `${p.nome} ${p.cognome} · tavolo ${d.tavoli.find((t) => t.id === p.tavoloId)?.nome ?? ''}`.trim(), p.email, p.spesaMinima);
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Solo admin. `eventoId`/`motivo` restringono l'elenco. `daFare`: da rimborsare e in corso; `fatti`: già restituiti, gli ultimi 50. */
export async function rimborsiAdmin(s: Sessione, filtro: { eventoId?: string; motivo?: string } = {}) {
  soloAdmin(s);
  const tutte = vociRimborso(await leggi()).filter((v) => (!filtro.eventoId || v.eventoId === filtro.eventoId) && (!filtro.motivo || v.motivo === filtro.motivo));
  return {
    daFare: tutte.filter((v) => v.stato !== 'rimborsato'),
    fatti: tutte.filter((v) => v.stato === 'rimborsato').sort((a, b) => (b.fattoAt ?? '').localeCompare(a.fattoAt ?? '')).slice(0, 50),
  };
}

// ------------------------------------------------------------------ soldi della serata

export interface SoldiSerata {
  lordo: number; rimborsato: number; netto: number;
  /** Pagamenti arrivati e non ancora restituiti che vanno restituiti: sono dentro il netto finché non partono. */
  daRestituire: number;
  prevendite: number; tavoli: number; porta: number;
}

/**
 * Incassato lordo, rimborsato e netto di una serata, dai dati esistenti. Lordo = tutti i pagamenti ricevuti (prevendite online,
 * tavoli, pagamenti in più, ingressi in cassa storici); rimborsato = quelli restituiti. Calcolo in centesimi interi. Funzione pura.
 */
export function soldiSerata(d: Readonly<Archivio>, eventoId: string): SoldiSerata {
  const c = { prevendite: 0, tavoli: 0, porta: 0, rimborsato: 0, daRestituire: 0 };
  const conta = (parte: 'prevendite' | 'tavoli' | 'porta', cent: number, restituito: boolean, daRestituire: boolean) => {
    c[parte] += cent;
    if (restituito) c.rimborsato += cent; else if (daRestituire) c.daRestituire += cent;
  };
  for (const i of d.iscrizioni) {
    if (i.eventoId !== eventoId) continue;
    const po = i.pagamentoOnline;
    if (i.metodoPagamento) {
      const restituito = i.stato === 'rimborsato' || po?.rimborso?.stato === 'fatto';
      conta(i.origine === 'cassa' ? 'porta' : 'prevendite', inCentesimi(i.importo), restituito, Boolean(po?.daRimborsare));
    }
    for (const x of po?.inPiu ?? []) conta('prevendite', x.centesimi, x.rimborso?.stato === 'fatto', true);
  }
  for (const p of d.prenotazioni) {
    if (p.eventoId !== eventoId) continue;
    const po = p.pagamentoOnline;
    if (p.pagatoAt && p.metodoPagamento) {
      conta('tavoli', inCentesimi(p.spesaMinima), p.stato === 'rimborsata' || po?.rimborso?.stato === 'fatto', Boolean(po?.daRimborsare));
    }
    for (const x of po?.inPiu ?? []) conta('tavoli', x.centesimi, x.rimborso?.stato === 'fatto', true);
  }
  const lordo = c.prevendite + c.tavoli + c.porta;
  return {
    lordo: lordo / 100, rimborsato: c.rimborsato / 100, netto: (lordo - c.rimborsato) / 100, daRestituire: c.daRestituire / 100,
    prevendite: c.prevendite / 100, tavoli: c.tavoli / 100, porta: c.porta / 100,
  };
}
