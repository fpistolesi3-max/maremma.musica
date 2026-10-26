import 'server-only';
import { randomUUID } from 'node:crypto';
import { leggi, modifica, segreto } from './archivio';
import type { Archivio, Evento, MetodoTavolo, Pr, PrenotazioneTavolo, Tavolo } from './tipi';
import type { Sessione } from '../sessione';
import { creaCodice, creaTokenQr } from '../qr-token';
import { EMAIL_RE, ORE_MINIME_PROMEMORIA_PR, eventoPassato, prenotazioneAttiva, prenotazioneScaduta, richiesteTavoliAperte, scadenzaPagamento, scadenzaPagamentoOnline } from '../regole';

// Prenotazione dei tavoli. Il cliente (o il PR per lui) chiede un tavolo libero: resta bloccato in attesa
// del pagamento anticipato della spesa minima. L'admin segna il pagamento e la prenotazione è confermata;
// se il termine passa senza pagamento la prenotazione decade e il tavolo torna libero.
// Come nel resto di lib/dati, ogni funzione controlla il ruolo di chi chiede.

/** Il PR può proporre questo tavolo? Lo decide l'admin: a tutti, a nessuno o solo ad alcuni. */
export function prPuoProporre(t: Pick<Tavolo, 'visibileDaPr' | 'prAbilitati'>, prId: string) {
  return t.visibileDaPr && (!t.prAbilitati || t.prAbilitati.includes(prId));
}

/** Fa decadere le prenotazioni non pagate in tempo e libera i tavoli. Restituisce true se ha cambiato qualcosa. */
function faiDecadere(d: Archivio, adesso = new Date()) {
  let cambiato = false;
  for (const p of d.prenotazioni) {
    if (!prenotazioneScaduta(p, adesso)) continue;
    p.stato = 'scaduta';
    p.chiusaAt = adesso.toISOString();
    const t = d.tavoli.find((x) => x.id === p.tavoloId);
    if (t && t.stato === 'riservato') t.stato = 'libero';
    cambiato = true;
  }
  return cambiato;
}

/** Da chiamare prima di leggere i tavoli: non c'è un orologio che gira, le scadenze si applicano alla lettura. */
export async function applicaScadenze() {
  const d = await leggi();
  if (d.prenotazioni.some((p) => prenotazioneScaduta(p))) await modifica((a) => { faiDecadere(a); });
}

function prAttivoPerEvento(d: Readonly<Archivio>, handle: string | null | undefined, evento: Evento): Pr | null {
  if (!handle) return null;
  const pr = d.pr.find((p) => p.handle === handle.toLowerCase() && p.stato === 'attivo');
  if (!pr || (evento.prAbilitati && !evento.prAbilitati.includes(pr.id))) return null;
  return pr;
}

// ------------------------------------------------------------------ pubblico

/** Quello che un visitatore può sapere di un tavolo: niente nota, niente dati di chi l'ha preso. */
export interface TavoloPubblico {
  id: string; nome: string; zona: string | null; posti: number | null; spesaMinima: number;
  x: number | null; y: number | null; libero: boolean;
}

export interface TavoliSerata {
  evento: Evento;
  tavoli: TavoloPubblico[];
  pr: Pr | null;            // PR del link, se valido per la serata
  aperte: boolean;          // false = la serata è iniziata: niente più richieste online
}

/** Tavoli in vendita di una serata pubblicata e non passata. `soloDelPr`: solo quelli affidati a quel PR. */
export async function tavoliPubblici(slug: string, handlePr?: string | null, soloDelPr = false): Promise<TavoliSerata | null> {
  await applicaScadenze();
  const d = await leggi();
  const evento = d.eventi.find((e) => e.slug === slug && e.pubblicato);
  if (!evento || eventoPassato(evento)) return null;
  const pr = prAttivoPerEvento(d, handlePr, evento);
  const tavoli = d.tavoli
    .filter((t) => t.eventoId === evento.id && t.stato !== 'non_in_vendita')
    .filter((t) => !soloDelPr || (pr && prPuoProporre(t, pr.id)))
    .sort((a, b) => a.ordine - b.ordine)
    .map((t) => ({ id: t.id, nome: t.nome, zona: t.zona, posti: t.posti, spesaMinima: t.spesaMinima, x: t.x, y: t.y, libero: t.stato === 'libero' }));
  return { evento, tavoli, pr, aperte: richiesteTavoliAperte(evento) };
}

export interface DatiPrenotazione {
  tavoloId: string; nome: string; cognome: string; email: string; telefono: string; persone: number;
}

export type EsitoPrenotazione =
  | { ok: true; prenotazione: PrenotazioneTavolo }
  | { ok: false; campo?: 'nome' | 'cognome' | 'email' | 'telefono' | 'persone' | 'tavolo'; errore: string };

function valida(i: DatiPrenotazione): EsitoPrenotazione | null {
  if (!i.nome.trim() || i.nome.trim().length > 80) return { ok: false, campo: 'nome', errore: 'Scrivi il nome di chi prenota.' };
  if (!i.cognome.trim() || i.cognome.trim().length > 80) return { ok: false, campo: 'cognome', errore: 'Scrivi il cognome di chi prenota.' };
  if (!EMAIL_RE.test(i.email.trim())) return { ok: false, campo: 'email', errore: 'Serve un’email valida: ti scriviamo lì.' };
  if (!/^\+?[\d\s./-]{6,20}$/.test(i.telefono.trim())) return { ok: false, campo: 'telefono', errore: 'Scrivi un numero di telefono: serve per il pagamento.' };
  if (!Number.isInteger(i.persone) || i.persone < 1 || i.persone > 99) return { ok: false, campo: 'persone', errore: 'In quanti siete?' };
  return null;
}

/** Controlli e scrittura nello stesso passaggio: due richieste insieme non prendono lo stesso tavolo. */
/** `online`: si paga sul sito, quindi il tavolo resta fermo solo per il tempo del pagamento. */
async function crea(i: DatiPrenotazione, opzioni: { prId: (d: Archivio, t: Tavolo, e: Evento) => string | null; inseritaDa: 'cliente' | 'pr'; soloDelPr?: string; online?: boolean }): Promise<EsitoPrenotazione> {
  const errore = valida(i);
  if (errore) return errore;
  const chiave = await segreto();
  return modifica((d): EsitoPrenotazione => {
    faiDecadere(d);
    const t = d.tavoli.find((x) => x.id === i.tavoloId);
    const evento = t && d.eventi.find((e) => e.id === t.eventoId);
    if (!t || !evento || !evento.pubblicato || eventoPassato(evento)) return { ok: false, campo: 'tavolo', errore: 'Questo tavolo non è più disponibile.' };
    if (!richiesteTavoliAperte(evento)) return { ok: false, campo: 'tavolo', errore: 'La serata è già iniziata: i tavoli non si chiedono più dal sito.' };
    if (opzioni.soloDelPr && (!prPuoProporre(t, opzioni.soloDelPr) || (evento.prAbilitati && !evento.prAbilitati.includes(opzioni.soloDelPr)))) return { ok: false, campo: 'tavolo', errore: 'Questo tavolo non è tra quelli affidati a te.' };
    const email = i.email.trim().toLowerCase();
    const cifre = (tel: string) => tel.replace(/\D/g, '').slice(-9);
    // Pagamento online lasciato a metà con la stessa email o lo stesso numero: si libera e si riparte da capo,
    // altrimenti chi chiude la pagina di pagamento resterebbe bloccato fino alla scadenza.
    if (opzioni.inseritaDa === 'cliente') {
      for (const p of d.prenotazioni) {
        if (p.eventoId !== evento.id || p.stato !== 'in_attesa' || !p.pagamentoOnline || p.inseritaDa !== 'cliente') continue;
        if (p.email !== email && cifre(p.telefono) !== cifre(i.telefono)) continue;
        p.stato = 'annullata';
        p.chiusaAt = new Date().toISOString();
        p.avvisoChiusuraAt = p.chiusaAt;
        const vecchio = d.tavoli.find((x) => x.id === p.tavoloId);
        if (vecchio && vecchio.stato === 'riservato') vecchio.stato = 'libero';
      }
    }
    if (t.stato !== 'libero') return { ok: false, campo: 'tavolo', errore: 'Qualcuno ha appena preso questo tavolo: scegline un altro.' };
    if (t.posti != null && i.persone > t.posti) return { ok: false, campo: 'persone', errore: `Questo tavolo è per ${t.posti} persone al massimo.` };
    // Un cliente tiene fermo un solo tavolo per serata; il PR può inserirne più d'uno per clienti diversi.
    if (opzioni.inseritaDa === 'cliente' && d.prenotazioni.some((p) => p.eventoId === evento.id && p.email === email && prenotazioneAttiva(p))) {
      return { ok: false, campo: 'email', errore: 'Con questa email hai già un tavolo per questa serata.' };
    }
    // Stesso limite sul telefono: cambiare email non basta a tenere fermi più tavoli senza pagare.
    if (opzioni.inseritaDa === 'cliente' && d.prenotazioni.some((p) => p.eventoId === evento.id && prenotazioneAttiva(p) && cifre(p.telefono) === cifre(i.telefono))) {
      return { ok: false, campo: 'telefono', errore: 'Con questo numero c’è già un tavolo per questa serata.' };
    }
    const id = randomUUID();
    const adesso = new Date();
    const p: PrenotazioneTavolo = {
      id, tavoloId: t.id, eventoId: evento.id, prId: opzioni.prId(d, t, evento),
      nome: i.nome.trim(), cognome: i.cognome.trim(), email, telefono: i.telefono.trim(), persone: i.persone,
      spesaMinima: t.spesaMinima, stato: 'in_attesa',
      scade: opzioni.online ? scadenzaPagamentoOnline(adesso, evento, opzioni.inseritaDa === 'pr') : scadenzaPagamento(adesso, evento),
      tokenQr: creaTokenQr(chiave, id, evento.id, adesso), codice: creaCodice(chiave, id),
      inseritaDa: opzioni.inseritaDa, consensoPrivacyAt: adesso.toISOString(), createdAt: adesso.toISOString(), pagatoAt: null, metodoPagamento: null, pagatoDa: null, chiusaAt: null, chiusaDa: null, promemoriaAt: null, avvisoChiusuraAt: null, ingressi: [],
      pagamentoOnline: opzioni.online ? { sessione: null, pagamento: null, daRimborsare: false } : null,
    };
    d.prenotazioni.push(p);
    t.stato = 'riservato';
    return { ok: true, prenotazione: p };
  });
}

/**
 * Richiesta dal sito. Se arriva dal link di un PR (attivo e abilitato per la serata) la prenotazione è sua,
 * qualunque tavolo scelga il cliente: "affidato" vale solo per i tavoli che il PR prenota lui per un cliente.
 */
export function prenotaTavolo(i: DatiPrenotazione, handlePr: string | null, online = false): Promise<EsitoPrenotazione> {
  return crea(i, {
    inseritaDa: 'cliente', online,
    prId: (d, _t, e) => prAttivoPerEvento(d, handlePr, e)?.id ?? null,
  });
}

export interface PrenotazioneVista {
  prenotazione: PrenotazioneTavolo;
  tavolo: Pick<Tavolo, 'id' | 'nome' | 'zona' | 'posti'>;
  evento: Evento;
  lista: string;
}

function vista(d: Readonly<Archivio>, p: PrenotazioneTavolo): PrenotazioneVista | null {
  const evento = d.eventi.find((e) => e.id === p.eventoId);
  if (!evento) return null;
  const t = d.tavoli.find((x) => x.id === p.tavoloId);
  const pr = p.prId ? d.pr.find((x) => x.id === p.prId) : null;
  return {
    prenotazione: p, evento, lista: pr?.nomeDisplay ?? 'Maremma Musica',
    tavolo: t ? { id: t.id, nome: t.nome, zona: t.zona, posti: t.posti } : { id: p.tavoloId, nome: 'Tavolo', zona: null, posti: null },
  };
}

/** La prenotazione si vede solo con id + email giusti, come il biglietto. */
export async function prenotazionePubblica(id: string, email: string | null | undefined): Promise<PrenotazioneVista | null> {
  if (!email) return null;
  await applicaScadenze();
  const d = await leggi();
  const p = d.prenotazioni.find((x) => x.id === id);
  if (!p || p.email !== email.trim().toLowerCase()) return null;
  return vista(d, p);
}

// ------------------------------------------------------------------ admin

export async function prenotazioniAdmin(s: Sessione, eventoId: string): Promise<PrenotazioneVista[]> {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
  await applicaScadenze();
  const d = await leggi();
  return d.prenotazioni
    .filter((p) => p.eventoId === eventoId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => vista(d, p))
    .filter((v): v is PrenotazioneVista => v !== null);
}

export const METODI_TAVOLO: MetodoTavolo[] = ['bonifico', 'satispay', 'contanti', 'pos'];

/**
 * L'admin ha ricevuto il pagamento anticipato: la prenotazione è confermata e il QR diventa valido.
 * Si segna come è arrivato e chi l'ha ricevuto. Vale anche per una prenotazione appena scaduta, se il
 * pagamento è arrivato in ritardo e il tavolo è ancora libero (nessun altro l'ha preso) e la serata non è passata.
 */
export async function confermaPrenotazione(s: Sessione, id: string, metodo: MetodoTavolo): Promise<PrenotazioneVista> {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
  if (!METODI_TAVOLO.includes(metodo)) throw new Error('Scegli come è arrivato il pagamento');
  return modifica((d) => {
    faiDecadere(d);
    const p = d.prenotazioni.find((x) => x.id === id);
    if (!p) throw new Error('Prenotazione non trovata');
    const t = d.tavoli.find((x) => x.id === p.tavoloId);
    if (p.stato === 'scaduta') {
      const evento = d.eventi.find((e) => e.id === p.eventoId);
      if (!evento || eventoPassato(evento)) throw new Error('La serata è passata: la prenotazione non si riattiva più');
      const preso = !t || t.stato !== 'libero' || d.prenotazioni.some((x) => x.tavoloId === p.tavoloId && x.id !== p.id && prenotazioneAttiva(x));
      if (preso) throw new Error('Il termine è passato e nel frattempo il tavolo è stato preso o tolto dalla vendita: serve un altro tavolo');
      p.chiusaAt = null;
      p.avvisoChiusuraAt = null;   // se l'email "chiusa" non è ancora partita, non parte più
    } else if (p.stato !== 'in_attesa') {
      throw new Error('Questa prenotazione non è più in attesa');
    }
    p.stato = 'confermata';
    p.pagatoAt = new Date().toISOString();
    p.metodoPagamento = metodo;
    p.pagatoDa = s.utente.email;
    if (t) t.stato = 'confermato';
    return vista(d, p)!;
  });
}

/**
 * Annulla e libera il tavolo. L'admin sempre; il PR solo le proprie e solo finché non sono pagate.
 * `rimborso`: solo l'admin e solo su una pagata, i soldi sono stati restituiti (stato "rimborsata").
 * Restituisce la prenotazione chiusa (per l'email al cliente) o null se era già chiusa.
 */
export async function annullaPrenotazione(s: Sessione, id: string, rimborso = false): Promise<PrenotazioneVista | null> {
  return modifica((d) => {
    const p = d.prenotazioni.find((x) => x.id === id);
    if (!p) throw new Error('Prenotazione non trovata');
    const admin = s.utente.ruolo === 'admin';
    const suaInAttesa = s.utente.ruolo === 'pr' && s.pr && p.prId === s.pr.id && p.stato === 'in_attesa';
    if (!admin && !suaInAttesa) throw new Error('non_autorizzato');
    if (!prenotazioneAttiva(p)) return null;
    if (rimborso && p.stato !== 'confermata') throw new Error('Si rimborsa solo una prenotazione pagata');
    p.stato = rimborso ? 'rimborsata' : 'annullata';
    p.chiusaAt = new Date().toISOString();
    p.chiusaDa = s.utente.email;
    p.avvisoChiusuraAt = p.chiusaAt;   // l'email parte subito, dall'azione
    const t = d.tavoli.find((x) => x.id === p.tavoloId);
    if (t && (t.stato === 'riservato' || t.stato === 'confermato')) t.stato = 'libero';
    return vista(d, p);
  });
}

// ------------------------------------------------------------------ PR

function soloPr(s: Sessione) {
  if (s.utente.ruolo !== 'pr' || !s.pr) throw new Error('non_autorizzato');
  return s.pr;
}

/** Area PR: quanti tavoli può ancora proporre e le prenotazioni che gli sono attribuite (mai quelle degli altri). */
export async function tavoliDelPr(s: Sessione, eventoId: string) {
  const pr = soloPr(s);
  await applicaScadenze();
  const d = await leggi();
  const affidati = d.tavoli.filter((t) => t.eventoId === eventoId && t.stato !== 'non_in_vendita' && prPuoProporre(t, pr.id));
  const evento = d.eventi.find((e) => e.id === eventoId);
  return {
    aperte: Boolean(evento && richiesteTavoliAperte(evento)),
    affidati: affidati.length,
    liberi: affidati.filter((t) => t.stato === 'libero').length,
    mie: d.prenotazioni
      .filter((p) => p.eventoId === eventoId && p.prId === pr.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => vista(d, p))
      .filter((v): v is PrenotazioneVista => v !== null),
  };
}

/** Il PR inserisce la richiesta a nome di un cliente: solo sui tavoli che gli sono affidati. */
export function prPrenotaTavolo(s: Sessione, i: DatiPrenotazione, online = false): Promise<EsitoPrenotazione> {
  const pr = soloPr(s);
  return crea(i, { inseritaDa: 'pr', soloDelPr: pr.id, prId: () => pr.id, online });
}

// ------------------------------------------------------------------ recupero e promemoria

/** Per "Il mio QR": le prenotazioni ancora valide di un'email, per le serate non passate. */
export async function prenotazioniPerEmail(email: string): Promise<PrenotazioneVista[]> {
  await applicaScadenze();
  const d = await leggi();
  const e = email.trim().toLowerCase();
  return d.prenotazioni
    .filter((p) => p.email === e && prenotazioneAttiva(p))
    .map((p) => vista(d, p))
    .filter((v): v is PrenotazioneVista => v !== null && !eventoPassato(v.evento));
}

/**
 * Prenotazioni decadute da sole (termine passato) il cui cliente non sa ancora niente, per serate non passate:
 * le segna come avvisate e le restituisce, così l'email parte una volta sola.
 */
export async function chiuseDaAvvisare(adesso = new Date()): Promise<PrenotazioneVista[]> {
  return modifica((d) => {
    faiDecadere(d, adesso);
    // Una pagina di pagamento online lasciata a metà non è una prenotazione persa: il cliente lo sa già.
    const da = d.prenotazioni.filter((p) => p.stato === 'scaduta' && !p.avvisoChiusuraAt && !p.pagamentoOnline);
    for (const p of da) p.avvisoChiusuraAt = adesso.toISOString();
    return da.map((p) => vista(d, p)).filter((v): v is PrenotazioneVista => v !== null && !eventoPassato(v.evento, adesso));
  });
}

/** Email degli admin: ricevono l'avviso quando arriva una richiesta. */
export async function emailAdmin(): Promise<string[]> {
  return (await leggi()).utenti.filter((u) => u.ruolo === 'admin').map((u) => u.email);
}

/**
 * Prenotazioni in attesa il cui termine cade entro `ore`: le segna come avvisate e le restituisce,
 * così il promemoria parte una volta sola anche se il controllo gira più volte.
 * 36 ore e non 24: il controllo gira una volta al giorno, così il promemoria arriva sempre il giorno prima
 * del termine (con 24 ore poteva partire anche solo un'ora prima).
 */
export async function promemoriaDaMandare(ore = 36, adesso = new Date()): Promise<PrenotazioneVista[]> {
  const limite = adesso.getTime() + ore * 3_600_000;
  return modifica((d) => {
    faiDecadere(d, adesso);
    // Il pagamento online scade in pochi minuti (o in un giorno, se inserito dal PR): niente promemoria.
    const daAvvisare = d.prenotazioni.filter((p) => p.stato === 'in_attesa' && !p.pagamentoOnline && !p.promemoriaAt && new Date(p.scade).getTime() <= limite);
    for (const p of daAvvisare) p.promemoriaAt = adesso.toISOString();
    return daAvvisare.map((p) => vista(d, p)).filter((v): v is PrenotazioneVista => v !== null);
  });
}

/**
 * Richieste inserite dal PR con il pagamento online, ancora da pagare: il controllo del mattino ricorda al cliente
 * di pagare e avvisa il PR, che può scrivergli. Solo se il cliente ha il link da almeno qualche ora (chi l'ha appena
 * ricevuto non va disturbato) e una volta sola. `emailPr`: null se il PR non ha un accesso.
 */
export async function promemoriaRichiestePr(adesso = new Date()): Promise<{ vista: PrenotazioneVista; emailPr: string | null }[]> {
  const minimo = ORE_MINIME_PROMEMORIA_PR * 3_600_000;
  return modifica((d) => {
    faiDecadere(d, adesso);
    const da = d.prenotazioni.filter((p) => p.stato === 'in_attesa' && p.pagamentoOnline && p.inseritaDa === 'pr' && !p.promemoriaAt
      && adesso.getTime() - new Date(p.createdAt).getTime() >= minimo && new Date(p.scade).getTime() > adesso.getTime());
    for (const p of da) p.promemoriaAt = adesso.toISOString();
    return da.flatMap((p) => {
      const v = vista(d, p);
      return v ? [{ vista: v, emailPr: d.utenti.find((u) => u.ruolo === 'pr' && u.prId === p.prId)?.email ?? null }] : [];
    });
  });
}

// ------------------------------------------------------------------ pagamento online

/** La prenotazione da pagare online, vista dal cliente (id + email giusti), ancora in attesa. */
export async function daPagareOnline(id: string, email: string | null | undefined): Promise<PrenotazioneVista | null> {
  const v = await prenotazionePubblica(id, email);
  if (!v || v.prenotazione.stato !== 'in_attesa' || !v.prenotazione.pagamentoOnline) return null;
  return v;
}

/** Ricorda l'ultima pagina di pagamento aperta: al ritorno del cliente si controlla quella. */
export async function salvaSessionePagamento(id: string, sessione: string) {
  await modifica((d) => {
    const p = d.prenotazioni.find((x) => x.id === id);
    if (p?.pagamentoOnline && p.stato === 'in_attesa') p.pagamentoOnline.sessione = sessione;
  });
}

export type EsitoPagamentoOnline =
  | { esito: 'confermata'; vista: PrenotazioneVista }    // appena confermata: parte l'email con il QR
  | { esito: 'gia' }                                     // già registrato (webhook ripetuto, ritorno del cliente)
  | { esito: 'da_rimborsare'; vista: PrenotazioneVista } // pagata quando il tavolo era già di un altro
  | { esito: 'sconosciuta' };

/**
 * Pagamento online riuscito (dal webhook di Stripe, dal ritorno del cliente o dalla pagina di prova).
 * Si può chiamare più volte per lo stesso pagamento. Se la prenotazione è scaduta da poco e il tavolo è ancora
 * libero vale lo stesso; se nel frattempo il tavolo è di un altro (o la prenotazione è stata annullata) il pagamento
 * si registra come da rimborsare e lo vede l'admin.
 */
export async function confermaPagamentoOnline(prenotazioneId: string, pagamento: string, adesso = new Date()): Promise<EsitoPagamentoOnline> {
  return modifica((d): EsitoPagamentoOnline => {
    const p = d.prenotazioni.find((x) => x.id === prenotazioneId);
    if (!p) return { esito: 'sconosciuta' };
    p.pagamentoOnline ??= { sessione: null, pagamento: null, daRimborsare: false };
    if (p.pagamentoOnline.pagamento === pagamento) return { esito: 'gia' };
    const t = d.tavoli.find((x) => x.id === p.tavoloId);
    const altri = d.prenotazioni.some((x) => x.tavoloId === p.tavoloId && x.id !== p.id && prenotazioneAttiva(x));
    // In attesa (anche col termine appena passato) tiene ancora il tavolo; scaduta lo riprende solo se è rimasto libero.
    const valida = Boolean(t) && !altri && (p.stato === 'in_attesa' || (p.stato === 'scaduta' && t!.stato === 'libero'));
    p.pagatoAt = adesso.toISOString();
    p.metodoPagamento = 'online';
    p.pagatoDa = 'pagamento online';
    p.pagamentoOnline.pagamento = pagamento;
    if (!valida) {
      p.pagamentoOnline.daRimborsare = true;
      return { esito: 'da_rimborsare', vista: vista(d, p)! };
    }
    p.stato = 'confermata';
    p.chiusaAt = null;
    p.avvisoChiusuraAt = null;
    t!.stato = 'confermato';
    return { esito: 'confermata', vista: vista(d, p)! };
  });
}

/**
 * Pagine di pagamento aperte senza un pagamento registrato, degli ultimi `giorni` (Stripe le tiene valide al
 * massimo 24 ore): il controllo giornaliero chiede a Stripe se sono state pagate, nel caso il webhook non sia arrivato.
 */
export async function pagamentiDaVerificare(giorni = 3, adesso = new Date()): Promise<{ id: string; sessione: string }[]> {
  const da = adesso.getTime() - giorni * 86_400_000;
  return (await leggi()).prenotazioni
    .filter((p) => p.pagamentoOnline?.sessione && !p.pagamentoOnline.pagamento && (p.stato === 'in_attesa' || p.stato === 'scaduta')
      && new Date(p.createdAt).getTime() >= da)
    .map((p) => ({ id: p.id, sessione: p.pagamentoOnline!.sessione! }));
}

/** Il cliente lascia il tavolo prima di pagare (dalla sua pagina): si libera subito per gli altri. */
export async function lasciaTavolo(id: string, email: string): Promise<PrenotazioneVista | null> {
  return modifica((d) => {
    const p = d.prenotazioni.find((x) => x.id === id);
    if (!p || p.email !== email.trim().toLowerCase() || p.stato !== 'in_attesa') return null;
    p.stato = 'annullata';
    p.chiusaAt = new Date().toISOString();
    p.chiusaDa = p.email;
    p.avvisoChiusuraAt = p.chiusaAt;
    const t = d.tavoli.find((x) => x.id === p.tavoloId);
    if (t && t.stato === 'riservato') t.stato = 'libero';
    return vista(d, p);
  });
}

/** Per il rimborso (solo admin): l'id del pagamento da restituire, se la prenotazione è stata pagata online. */
export async function pagamentoOnlineDi(s: Sessione, id: string): Promise<string | null> {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
  const p = (await leggi()).prenotazioni.find((x) => x.id === id);
  return p?.metodoPagamento === 'online' ? p.pagamentoOnline?.pagamento ?? null : null;
}

/** Pagamento arrivato quando la prenotazione era già chiusa: i soldi sono stati restituiti (stato "rimborsata"). */
export async function chiudiRimborsoDovuto(s: Sessione, id: string): Promise<PrenotazioneVista | null> {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
  return modifica((d) => {
    const p = d.prenotazioni.find((x) => x.id === id);
    if (!p?.pagamentoOnline?.daRimborsare) return null;
    p.pagamentoOnline.daRimborsare = false;
    p.stato = 'rimborsata';
    p.chiusaAt = new Date().toISOString();
    p.chiusaDa = s.utente.email;
    p.avvisoChiusuraAt = p.chiusaAt;
    return vista(d, p);
  });
}
