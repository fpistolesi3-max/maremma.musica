import type {
  Accesso, Archivio, EmailInviata, Evento, Iscrizione, Lotto, PagamentoInPiu, PagamentoOnline, Pr, PrenotazioneTavolo, Rimborso, StatoPorta, StatoTavolo, Tavolo, Utente,
} from './tipi';

// Dalle tabelle all'oggetto `Archivio` che il resto del codice già conosce (e viceversa il confronto con la riga unica).
// Funzioni pure, senza accesso al database: `leggi_tutto()` (supabase/migrations/20261107000000_leggi_tutto.sql) dà le righe, qui si
// ricompongono. Vedi PIANO-SCHEMA.md, sezioni 3.2 e 4 (tappa 4).

/** Una riga di tabella, come la restituisce `to_jsonb()`: nomi di colonna in snake_case. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

/** Quello che restituisce la funzione SQL `leggi_tutto()`. */
export interface LeggiTutto {
  adesso: string;
  impostazioni: Record<string, string>;
  eventi: R[]; lotti: R[]; pr: R[]; utenti: R[]; accessi: R[]; porte: R[]; iscrizioni: R[]; pagamenti: R[];
  tavoli: R[]; prenotazioni: R[]; ingressi: R[]; posta: R[];
}

export type ModalitaArchivio = 'riga' | 'tabelle';

/** Da dove viene la scelta: la variabile `MM_ARCHIVIO`, il predefinito della produzione, il predefinito altrove o l'assenza di Supabase. */
export type OrigineArchivio = 'variabile' | 'produzione' | 'predefinito' | 'senza_supabase';

/**
 * L'unico punto in cui si decide dove sta l'archivio (nessun altro file legge `MM_ARCHIVIO` per conto suo).
 * - Senza Supabase (sviluppo locale, test): sempre il file/la riga, qualunque cosa dica la variabile.
 * - Se `MM_ARCHIVIO` è impostata vale lei: `tabelle` accende, qualunque altro valore (`riga`, o scritto male) spegne.
 *   Il sito non va mai in errore per una variabile sbagliata, e `MM_ARCHIVIO=riga` resta il modo per tornare indietro.
 * - Se NON è impostata: `tabelle` solo in produzione su Vercel (`VERCEL_ENV=production`); Preview, sviluppo e test restano sulla riga.
 */
export function interruttoreArchivio(env: Record<string, string | undefined> = process.env): { modalita: ModalitaArchivio; origine: OrigineArchivio } {
  if (!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) return { modalita: 'riga', origine: 'senza_supabase' };
  const valore = env.MM_ARCHIVIO?.trim().toLowerCase();
  if (valore) return { modalita: valore === 'tabelle' ? 'tabelle' : 'riga', origine: 'variabile' };
  return env.VERCEL_ENV === 'production' ? { modalita: 'tabelle', origine: 'produzione' } : { modalita: 'riga', origine: 'predefinito' };
}

export function modalitaArchivio(env: Record<string, string | undefined> = process.env): ModalitaArchivio {
  return interruttoreArchivio(env).modalita;
}

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());
const isoObbligatorio = (v: unknown): string => new Date(v as string).toISOString();
const numero = (v: unknown): number | null => (v == null ? null : Number(v));

// ------------------------------------------------------------------ stato dei tavoli

/** Lo stato di un tavolo, come la vista `tavoli_con_stato`: non in vendita, confermato, riservato (richiesta in attesa nel termine) o libero. */
export function statoDelTavolo(inVendita: boolean, prenotazioni: readonly Pick<PrenotazioneTavolo, 'stato' | 'scade'>[], adesso: Date): StatoTavolo {
  if (!inVendita) return 'non_in_vendita';
  if (prenotazioni.some((p) => p.stato === 'confermata')) return 'confermato';
  if (prenotazioni.some((p) => p.stato === 'in_attesa' && new Date(p.scade).getTime() > adesso.getTime())) return 'riservato';
  return 'libero';
}

// ------------------------------------------------------------------ compositore

function pagamentoOnline(attivo: boolean, sessione: unknown, pagamenti: R[]): PagamentoOnline | null {
  if (!attivo) return null;
  const principale = pagamenti.find((p) => p.ruolo === 'principale');
  const rimborso = (p: R): Rimborso | null => (p.rimborso_stato ? {
    stato: p.rimborso_stato, chiave: p.rimborso_chiave, avviatoAt: isoObbligatorio(p.rimborso_avviato_at), fattoAt: iso(p.rimborso_fatto_at), da: p.rimborso_da ?? null,
  } : null);
  const po: PagamentoOnline = { sessione: (sessione as string | null) ?? null, pagamento: principale?.id ?? null, daRimborsare: principale?.da_rimborsare ?? false };
  if (principale?.motivo) po.motivo = principale.motivo;
  const r = principale ? rimborso(principale) : null;
  if (r) po.rimborso = r;
  const inPiu = pagamenti.filter((p) => p.ruolo === 'in_piu').sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
  if (inPiu.length) {
    po.inPiu = inPiu.map((p): PagamentoInPiu => {
      const x: PagamentoInPiu = { pagamento: p.id, centesimi: p.centesimi, valuta: p.valuta, motivo: p.motivo, at: isoObbligatorio(p.at) };
      const rb = rimborso(p);
      if (rb) x.rimborso = rb;
      return x;
    });
  }
  return po;
}

/** Ricompone l'`Archivio` dalle tabelle. `adesso` serve solo per lo stato dei tavoli (una richiesta scaduta non lo tiene più). */
export function componiArchivio(raw: LeggiTutto, adesso: Date = new Date()): Archivio {
  const segreto = raw.impostazioni?.segreto;
  if (!segreto) throw new Error('Archivio: il segreto dei QR manca nelle tabelle (impostazioni). La copia dalla riga unica è stata fatta?');

  const perIscrizione = new Map<string, R[]>();
  const perPrenotazione = new Map<string, R[]>();
  for (const p of raw.pagamenti) {
    const mappa = p.iscrizione_id ? perIscrizione : perPrenotazione;
    const chiave = p.iscrizione_id ?? p.prenotazione_id;
    mappa.set(chiave, [...(mappa.get(chiave) ?? []), p]);
  }

  const eventi = raw.eventi.map((r): Evento => ({
    id: r.id, numero: r.numero ?? null, slug: r.slug, nome: r.nome, data: isoObbligatorio(r.data), dataFine: iso(r.data_fine),
    location: r.location ?? null, comune: r.comune ?? null, lat: r.lat ?? null, lng: r.lng ?? null, locationSegreta: r.location_segreta,
    tipoIngresso: r.tipo_ingresso, descrizione: r.descrizione ?? null, highlight: r.highlight ?? null, dressCode: r.dress_code ?? null,
    lineup: r.lineup ?? [], infoArrivo: r.info_arrivo ?? null, locandinaUrl: r.locandina_url ?? null, piantinaUrl: r.piantina_url ?? null,
    prezzoLista: Number(r.prezzo_lista), inCopertina: r.in_copertina, senzaTelefono: r.senza_telefono, prevenditaFinoAlle: iso(r.prevendita_fino_alle),
    capienza: r.capienza ?? null, etaMinima: r.eta_minima, pubblicato: r.pubblicato, prAbilitati: r.pr_abilitati ?? null,
    invioLinkPr: r.invio_link_pr ?? null, createdAt: isoObbligatorio(r.created_at), updatedAt: isoObbligatorio(r.updated_at),
  }));

  const lotti = raw.lotti.map((r): Lotto => ({
    id: r.id, eventoId: r.evento_id, nome: r.nome, prezzo: Number(r.prezzo), quantita: r.quantita ?? null, dataInizio: iso(r.data_inizio), dataFine: iso(r.data_fine),
    visibileDaPr: r.visibile_da_pr, ordine: r.ordine, categoria: r.categoria ?? null, confermaCategoria: r.conferma_categoria,
    uscitaGiorniPrima: r.uscita_giorni_prima ?? null, fineOrePrima: r.fine_ore_prima ?? null, dopoPrecedente: r.dopo_precedente,
    prAbilitati: r.pr_abilitati ?? null, automatico: r.automatico,
  }));

  const pr = raw.pr.map((r): Pr => ({ id: r.id, handle: r.handle, nomeDisplay: r.nome_display, stato: r.stato, createdAt: isoObbligatorio(r.created_at) }));
  const utenti = raw.utenti.map((r): Utente => ({ id: r.id, email: r.email, ruolo: r.ruolo, prId: r.pr_id ?? null, createdAt: isoObbligatorio(r.created_at) }));
  const accessi = raw.accessi.map((r): Accesso => ({
    id: r.id, utenteId: r.utente_id, tokenHash: r.token_hash, codiceHash: r.codice_hash, scade: isoObbligatorio(r.scade), usato: r.usato, tentativi: r.tentativi,
  }));

  const iscrizioni = raw.iscrizioni.map((r): Iscrizione => {
    const anon = Boolean(r.anonimizzata);
    return {
      id: r.id, eventoId: r.evento_id, lottoId: r.lotto_id ?? null, categoria: r.categoria ?? null, rifiutoIngresso: r.rifiuto_ingresso ?? null, prId: r.pr_id ?? null,
      // I dati cancellati dall'anonimizzazione sono null nelle tabelle e stringhe vuote nell'oggetto (come nella riga unica).
      nome: anon ? '' : r.nome, cognome: anon ? '' : r.cognome, dataNascita: anon ? '' : String(r.data_nascita).slice(0, 10), email: anon ? '' : r.email,
      tokenQr: r.token_qr, codice: r.codice, stato: r.stato, metodoPagamento: r.metodo_pagamento ?? null, importo: Number(r.importo),
      pagatoAt: iso(r.pagato_at), scade: iso(r.scade), pagamentoOnline: pagamentoOnline(r.pagamento_online, r.pagamento_sessione, perIscrizione.get(r.id) ?? []),
      oraCheckIn: iso(r.ora_check_in), porta: r.porta ?? null, consensoPrivacyAt: isoObbligatorio(r.consenso_privacy_at), consensoMarketing: r.consenso_marketing,
      annullatoAt: iso(r.annullato_at), createdAt: isoObbligatorio(r.created_at), canale: r.canale, consegnaId: null, origine: 'lista',
      anonimizzata: anon, etaAllaSerata: r.eta_alla_serata ?? null, anonimizzataAt: iso(r.anonimizzata_at),
    };
  });

  const ingressiDi = new Map<string, R[]>();
  for (const i of raw.ingressi) ingressiDi.set(i.prenotazione_id, [...(ingressiDi.get(i.prenotazione_id) ?? []), i]);
  const prenotazioni = raw.prenotazioni.map((r): PrenotazioneTavolo => {
    const anon = Boolean(r.anonimizzata);
    return {
      id: r.id, tavoloId: r.tavolo_id, eventoId: r.evento_id, prId: r.pr_id ?? null,
      nome: anon ? '' : r.nome, cognome: anon ? '' : r.cognome, email: anon ? '' : r.email, telefono: anon ? '' : r.telefono,
      persone: r.persone, spesaMinima: Number(r.spesa_minima), stato: r.stato, scade: isoObbligatorio(r.scade), tokenQr: r.token_qr, codice: r.codice,
      inseritaDa: r.inserita_da, consensoPrivacyAt: isoObbligatorio(r.consenso_privacy_at), createdAt: isoObbligatorio(r.created_at), pagatoAt: iso(r.pagato_at),
      metodoPagamento: r.metodo_pagamento ?? null, pagatoDa: r.pagato_da ?? null, chiusaAt: iso(r.chiusa_at), chiusaDa: r.chiusa_da ?? null,
      promemoriaAt: iso(r.promemoria_at), avvisoChiusuraAt: iso(r.avviso_chiusura_at),
      pagamentoOnline: pagamentoOnline(r.pagamento_online, r.pagamento_sessione, perPrenotazione.get(r.id) ?? []),
      ingressi: (ingressiDi.get(r.id) ?? []).sort((a, b) => String(a.ora).localeCompare(String(b.ora)) || String(a.rif).localeCompare(String(b.rif)))
        .map((i) => ({ rif: i.rif, ora: isoObbligatorio(i.ora), porta: i.porta })),
    };
  });

  const prenotazioniDelTavolo = new Map<string, PrenotazioneTavolo[]>();
  for (const p of prenotazioni) prenotazioniDelTavolo.set(p.tavoloId, [...(prenotazioniDelTavolo.get(p.tavoloId) ?? []), p]);
  const tavoli = raw.tavoli.map((r): Tavolo => ({
    id: r.id, eventoId: r.evento_id, nome: r.nome, zona: r.zona ?? null, posti: r.posti ?? null, spesaMinima: Number(r.spesa_minima),
    stato: statoDelTavolo(r.in_vendita, prenotazioniDelTavolo.get(r.id) ?? [], adesso), nota: r.nota ?? null, visibileDaPr: r.visibile_da_pr,
    prAbilitati: r.pr_abilitati ?? null, ordine: r.ordine, x: numero(r.x), y: numero(r.y),
  }));

  // Quante persone sono entrate da ogni porta: si calcola, non si salva.
  const porte = raw.porte.map((r): StatoPorta => ({
    nome: r.nome, eventoId: r.evento_id, ultimoSync: isoObbligatorio(r.ultimo_sync),
    ingressi: iscrizioni.filter((i) => i.eventoId === r.evento_id && i.porta === r.nome && i.stato === 'entrato').length
      + prenotazioni.filter((p) => p.eventoId === r.evento_id).reduce((n, p) => n + p.ingressi.filter((x) => x.porta === r.nome).length, 0),
  }));

  // Le più recenti per prime, come le tiene l'archivio (inviaEmail le mette in testa e taglia le vecchie).
  const posta = raw.posta.map((r): EmailInviata => ({ id: r.id, a: r.a, oggetto: r.oggetto, html: r.html, inviataAt: isoObbligatorio(r.inviata_at), via: r.via }))
    .sort((a, b) => b.inviataAt.localeCompare(a.inviataAt) || b.id.localeCompare(a.id));

  return { versione: 1, segreto, eventi, lotti, pr, iscrizioni, utenti, accessi, posta, porte, consegne: [], tavoli, prenotazioni };
}

// ------------------------------------------------------------------ confronto con la riga unica

type Chiavi = Record<string, (e: R) => string>;
const CHIAVE_ELEMENTO: Chiavi = {
  porte: (e) => `${e.eventoId}|${e.nome}`,
  inPiu: (e) => e.pagamento,
  ingressi: (e) => e.rif,
};

/** Campi della riga unica che le tabelle non portano o che si calcolano (cassa, consegne, ingressi per porta): non si confrontano. */
const IGNORATI: Record<string, readonly string[]> = {
  eventi: ['cassaAttiva', 'prezzoCassa'],
  iscrizioni: ['rifCassa', 'chiusaDaCassa', 'consegnaId'],
  porte: ['ingressi'],
};
const GRUPPI = ['eventi', 'lotti', 'pr', 'utenti', 'accessi', 'porte', 'iscrizioni', 'tavoli', 'prenotazioni'] as const;

const ISTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Valore in forma confrontabile: null e assente uguali, istanti come numeri (la riga e le tabelle scrivono le date in modi diversi), valuta in minuscolo. */
export function canonico(v: unknown, campo = ''): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return ISTANTE.test(v) && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : campo === 'valuta' ? v.toLowerCase() : v;
  if (Array.isArray(v)) return v.map((x) => canonico(x, campo));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v as R).filter(([, x]) => x !== undefined).map(([k, x]) => [k, canonico(x, k)]));
  return v;
}

/** La riga unica portata alla forma che le tabelle possono restituire: i valori di partenza dei campi facoltativi e lo stato dei tavoli calcolato. */
function preparaRiga(a: Archivio, adesso: Date): Archivio {
  const c = structuredClone(a);
  for (const e of c.eventi) { e.inCopertina ??= false; e.capienza ??= null; e.prevenditaFinoAlle ??= null; e.invioLinkPr ??= null; }
  for (const l of c.lotti) l.automatico ??= false;
  const utenti = new Set(c.utenti.map((u) => u.id));
  c.accessi = c.accessi.filter((x) => utenti.has(x.utenteId)); // gli accessi di utenti spariti non si portano
  const perTavolo = new Map<string, PrenotazioneTavolo[]>();
  for (const p of c.prenotazioni) perTavolo.set(p.tavoloId, [...(perTavolo.get(p.tavoloId) ?? []), p]);
  for (const t of c.tavoli) t.stato = statoDelTavolo(t.stato !== 'non_in_vendita', perTavolo.get(t.id) ?? [], adesso);
  return c;
}

function confrontaValori(a: unknown, b: unknown, percorso: string, differenze: string[], gruppo: string) {
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) { differenze.push(percorso); return; }
    if (Array.isArray(a) && Array.isArray(b)) {
      const chiave = CHIAVE_ELEMENTO[percorso.split('.').pop() ?? ''];
      if (chiave) {
        const ma = new Map(a.map((e) => [chiave(e as R), e])); const mb = new Map(b.map((e) => [chiave(e as R), e]));
        for (const k of new Set([...ma.keys(), ...mb.keys()])) {
          if (!ma.has(k) || !mb.has(k)) differenze.push(`${percorso}[${String(k).slice(0, 12)}]`);
          else confrontaValori(ma.get(k), mb.get(k), `${percorso}[${String(k).slice(0, 12)}]`, differenze, gruppo);
        }
        return;
      }
      if (a.length !== b.length) { differenze.push(percorso); return; }
      a.forEach((x, i) => confrontaValori(x, b[i], `${percorso}[${i}]`, differenze, gruppo));
      return;
    }
    const oa = a as R; const ob = b as R;
    for (const k of new Set([...Object.keys(oa), ...Object.keys(ob)])) confrontaValori(oa[k] ?? null, ob[k] ?? null, `${percorso}.${k}`, differenze, gruppo);
    return;
  }
  if (a !== b) differenze.push(percorso);
}

/**
 * Confronta la riga unica con quello che le tabelle restituiscono. Restituisce solo i *nomi* dei campi che differiscono
 * (`iscrizioni[3f9a1c2b].stato`), mai i valori: dentro ci sono dati personali. Lista vuota = uguali.
 * Non si confrontano: il registro delle email, le consegne, i campi della cassa, gli ingressi per porta (si calcolano).
 */
export function confrontaArchivi(riga: Archivio, tabelle: Archivio, adesso: Date = new Date()): string[] {
  const a = preparaRiga(riga, adesso);
  const differenze: string[] = [];
  if (a.segreto !== tabelle.segreto) differenze.push('segreto');
  for (const gruppo of GRUPPI) {
    const ignorati = IGNORATI[gruppo] ?? [];
    const pulisci = (e: R) => Object.fromEntries(Object.entries(e).filter(([k]) => !ignorati.includes(k)));
    const identifica = (e: R) => (gruppo === 'porte' ? `${e.eventoId}|${e.nome}` : e.id as string);
    const dalla = new Map((a[gruppo] as unknown as R[]).map((e) => [identifica(e), canonico(pulisci(e))]));
    const dalle = new Map((tabelle[gruppo] as unknown as R[]).map((e) => [identifica(e), canonico(pulisci(e))]));
    const mancanti = [...dalla.keys()].filter((k) => !dalle.has(k)).length;
    const inPiu = [...dalle.keys()].filter((k) => !dalla.has(k)).length;
    if (mancanti) differenze.push(`${gruppo}: ${mancanti} nella riga ma non nelle tabelle`);
    if (inPiu) differenze.push(`${gruppo}: ${inPiu} nelle tabelle ma non nella riga`);
    for (const [k, x] of dalla) if (dalle.has(k)) confrontaValori(x, dalle.get(k), `${gruppo}[${String(k).slice(0, 8)}]`, differenze, gruppo);
  }
  return differenze;
}
