import type { Evento, Iscrizione, Lotto, PrenotazioneTavolo } from './dati/tipi';
import { anniCompiuti, dataIso, dataPunti, euro } from './formato';

// Regole di business pure (senza archivio): testate in lib/regole.test.ts.

export type StatoLista =
  | { tipo: 'aperta'; lotto: Lotto | null; prezzo: number }
  | { tipo: 'libero'; lotto: Lotto | null; prezzo: 0 }
  | { tipo: 'dal'; dal: string | null; lotto?: Lotto } // apre più avanti (dal = null: quando finisce il tipo precedente)
  | { tipo: 'piena' }
  | { tipo: 'chiusa' }
  | { tipo: 'passata' };

/** Iscrizioni con un QR valido: pagate online, gratis o già entrate. Quelle in attesa di pagamento non valgono ancora. */
export const ATTIVE: Iscrizione['stato'][] = ['in_lista', 'pagato', 'entrato'];
export const isAttiva = (i: Pick<Iscrizione, 'stato'>) => ATTIVE.includes(i.stato);

/** In attesa di pagamento col termine passato: il posto è tornato libero (anche se nessuno l'ha ancora segnata "scaduta"). */
export function iscrizioneScaduta(i: Pick<Iscrizione, 'stato' | 'scade'>, adesso = new Date()) {
  return i.stato === 'in_attesa' && (!i.scade || new Date(i.scade).getTime() <= adesso.getTime());
}

/** Occupa un posto del lotto: valida, oppure in attesa di pagamento e ancora nel termine. */
export function tienePosto(i: Pick<Iscrizione, 'stato' | 'scade'>, adesso = new Date()) {
  return isAttiva(i) || (i.stato === 'in_attesa' && !iscrizioneScaduta(i, adesso));
}

export function eventoPassato(e: Pick<Evento, 'data' | 'dataFine'>, adesso = new Date()) {
  const fine = e.dataFine ? new Date(e.dataFine) : new Date(new Date(e.data).getTime() + 8 * 3_600_000);
  return fine.getTime() < adesso.getTime();
}

/**
 * La serata in copertina nella home: quella scelta dall'admin se è pubblicata e non passata,
 * altrimenti la prossima data. Se per errore le scelte sono due, vince la più vicina.
 */
export function sceltaCopertina<T extends Pick<Evento, 'data' | 'dataFine' | 'pubblicato' | 'inCopertina'>>(eventi: readonly T[], adesso = new Date()): T | null {
  const prossimi = eventi.filter((e) => e.pubblicato && !eventoPassato(e, adesso)).sort((a, b) => a.data.localeCompare(b.data));
  return prossimi.find((e) => e.inCopertina) ?? prossimi[0] ?? null;
}

const GIORNO = 86_400_000;
const ORA = 3_600_000;

/** Finestra di vendita di un tipo: uscita/chiusura relative alla serata hanno la precedenza sulle date fisse. */
export function finestraLotto(l: Pick<Lotto, 'dataInizio' | 'dataFine' | 'uscitaGiorniPrima' | 'fineOrePrima'>, evento: Pick<Evento, 'data'>) {
  const apertura = new Date(evento.data).getTime();
  const inizio = l.uscitaGiorniPrima != null ? new Date(apertura - l.uscitaGiorniPrima * GIORNO) : l.dataInizio ? new Date(l.dataInizio) : null;
  const fine = l.fineOrePrima != null ? new Date(apertura - l.fineOrePrima * ORA) : l.dataFine ? new Date(l.dataFine) : null;
  return { inizio, fine };
}

/** Il tipo è venduto dal link di questo PR? (daPr senza prId: solo il controllo "visibile dai PR".) */
export function vendutoDaPr(l: Pick<Lotto, 'visibileDaPr' | 'prAbilitati'>, prId?: string | null) {
  return l.visibileDaPr && (!l.prAbilitati || !prId || l.prAbilitati.includes(prId));
}

export type StatoTipo = 'in_vendita' | 'presto' | 'dopo_precedente' | 'esaurito' | 'chiuso';
export interface TipoVista { lotto: Lotto; stato: StatoTipo; dal: Date | null; usati: number }

/**
 * Stato di ogni tipo di prevendita adesso, in ordine. Un tipo con "dopo il precedente" esce solo quando i posti
 * del tipo prima di lui sono finiti (e, se ha anche una data di uscita, quando quella è arrivata).
 */
export function tipiVista(
  evento: Evento, lotti: Lotto[], usati: Record<string, number>, opzioni: { adesso?: Date; daPr?: boolean; prId?: string | null } = {},
): TipoVista[] {
  const adesso = opzioni.adesso ?? new Date();
  const tutti = lotti.filter((l) => l.eventoId === evento.id).sort((a, b) => a.ordine - b.ordine);
  const finito = (l: Lotto) => l.quantita != null && (usati[l.id] ?? 0) >= l.quantita;
  return tutti
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !opzioni.daPr || vendutoDaPr(l, opzioni.prId))
    .map(({ l, i }): TipoVista => {
      const { inizio, fine } = finestraLotto(l, evento);
      const base = { lotto: l, dal: inizio, usati: usati[l.id] ?? 0 };
      if (finito(l)) return { ...base, stato: 'esaurito' };
      if (fine && fine < adesso) return { ...base, stato: 'chiuso' };
      if (inizio && inizio > adesso) return { ...base, stato: 'presto' };
      if (l.dopoPrecedente && i > 0 && !finito(tutti[i - 1])) return { ...base, stato: 'dopo_precedente' };
      return { ...base, stato: 'in_vendita' };
    });
}

/**
 * Quale tipo si prende adesso? Il primo (per ordine) già aperto, non scaduto e con posti: il cliente non sceglie.
 * Da link PR si saltano i tipi non venduti dai PR (o non da questo PR).
 */
export function statoLista(
  evento: Evento, lotti: Lotto[], usati: Record<string, number>, opzioni: { adesso?: Date; daPr?: boolean; prId?: string | null } = {},
): StatoLista {
  const adesso = opzioni.adesso ?? new Date();
  if (eventoPassato(evento, adesso)) return { tipo: 'passata' };
  const dellEvento = lotti.filter((l) => l.eventoId === evento.id);

  // Nessun lotto definito: vale il prezzo lista dell'evento, senza limite di posti.
  if (dellEvento.length === 0) {
    if (new Date(evento.data).getTime() < adesso.getTime()) return { tipo: 'chiusa' };
    return evento.tipoIngresso === 'libero' || evento.prezzoLista === 0
      ? { tipo: 'libero', lotto: null, prezzo: 0 }
      : { tipo: 'aperta', lotto: null, prezzo: evento.prezzoLista };
  }

  const suoi = tipiVista(evento, dellEvento, usati, { adesso, daPr: opzioni.daPr, prId: opzioni.prId });
  const aperto = suoi.find((t) => t.stato === 'in_vendita');
  if (aperto) {
    const l = aperto.lotto;
    return evento.tipoIngresso === 'libero' || l.prezzo === 0
      ? { tipo: 'libero', lotto: l, prezzo: 0 }
      : { tipo: 'aperta', lotto: l, prezzo: l.prezzo };
  }
  if (suoi.length === 0) return { tipo: 'chiusa' }; // nessun tipo vendibile da link PR
  const prossimo = suoi.filter((t) => t.stato === 'presto').sort((a, b) => a.dal!.getTime() - b.dal!.getTime())[0];
  if (prossimo) return { tipo: 'dal', dal: prossimo.dal!.toISOString(), lotto: prossimo.lotto };
  const attesa = suoi.find((t) => t.stato === 'dopo_precedente');
  if (attesa) return { tipo: 'dal', dal: null, lotto: attesa.lotto };
  return suoi.some((t) => t.stato === 'esaurito') ? { tipo: 'piena' } : { tipo: 'chiusa' };
}

/** Testo e classe del chip evento, sempre con la parola (mai solo colore). */
export function chipLista(s: StatoLista, breve = false): { testo: string; classe: string } {
  switch (s.tipo) {
    case 'aperta': return { testo: breve ? `Lista · ${euro(s.prezzo)}` : 'Lista aperta', classe: 'mm-chip mm-chip--lista' };
    case 'libero': return { testo: 'Ingresso libero', classe: 'mm-chip mm-chip--libero' };
    case 'dal': return { testo: s.dal ? `Lista dal ${dataPunti(s.dal)}` : 'Lista chiusa', classe: 'mm-chip mm-chip--pagato' };
    case 'piena': return { testo: 'Lista piena', classe: 'mm-chip mm-chip--esaurito' };
    case 'chiusa': return { testo: 'Lista chiusa', classe: 'mm-chip mm-chip--pagato' };
    case 'passata': return { testo: 'Serata passata', classe: 'mm-chip mm-chip--libero' };
  }
}

export function etaSufficiente(dataNascita: string, evento: Pick<Evento, 'data' | 'etaMinima'>) {
  return anniCompiuti(dataNascita, dataIso(evento.data)) >= evento.etaMinima;
}

/** Normalizza il cognome per il controllo doppioni: "D'Àngelo " e "d'angelo" sono la stessa persona. */
export function chiaveCognome(cognome: string) {
  return cognome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

export function giaIscritto(
  iscrizioni: Iscrizione[], eventoId: string, cognome: string, dataNascita: string,
) {
  const k = chiaveCognome(cognome);
  return iscrizioni.find((i) => i.eventoId === eventoId && isAttiva(i) && !i.anonimizzata && i.dataNascita === dataNascita && chiaveCognome(i.cognome) === k);
}

/** Valida giorno/mese/anno come data reale (niente 31 febbraio). */
export function componiData(giorno: string, mese: string, anno: string): string | null {
  const g = Number(giorno), m = Number(mese), a = Number(anno);
  if (!/^\d{1,2}$/.test(giorno.trim()) || !/^\d{1,2}$/.test(mese.trim()) || !/^\d{4}$/.test(anno.trim())) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== g) return null;
  if (a < 1900 || d.getTime() > Date.now()) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
}

/**
 * Pagamento online (tutti i pagamenti passano dal sito): il tavolo resta fermo solo mentre il cliente paga.
 * 30 minuti è il minimo che Stripe accetta per la scadenza della pagina di pagamento. Se la richiesta la
 * inserisce il PR (o la crew, per un tavolo venduto a voce), il cliente riceve il link per email e ha più tempo.
 */
export const MINUTI_PAGAMENTO_ONLINE = 30;
export const ORE_PAGAMENTO_ONLINE_PR = 24;
/** Il promemoria della richiesta inserita dal PR (o dalla crew) parte solo se il cliente ha avuto il link da almeno queste ore. */
export const ORE_MINIME_PROMEMORIA_PR = 3;

/** Termine del pagamento: pochi minuti (o qualche ora, se inserita dal PR o dalla crew), mai oltre l'apertura. */
export function scadenzaPagamentoOnline(richiesta: Date, evento: Pick<Evento, 'data'>, conLink = false) {
  const durata = conLink ? ORE_PAGAMENTO_ONLINE_PR * 3_600_000 : MINUTI_PAGAMENTO_ONLINE * 60_000;
  return new Date(Math.min(richiesta.getTime() + durata, new Date(evento.data).getTime())).toISOString();
}

/**
 * Pagamento online di una prevendita arrivato (anche in ritardo, dopo il termine). Vale se l'iscrizione aspettava
 * ancora il pagamento (o è scaduta da poco), la serata non è iniziata, nel lotto c'è ancora posto e la stessa persona
 * non ha già un altro QR valido. Altrimenti i soldi vanno restituiti.
 */
export function pagamentoIscrizioneValido(o: {
  iscrizione: Pick<Iscrizione, 'stato'>; evento: Pick<Evento, 'data'>; lotto: Pick<Lotto, 'quantita'> | null;
  altriNelLotto: number; doppione: boolean; adesso?: Date;
}) {
  const adesso = o.adesso ?? new Date();
  if (o.iscrizione.stato !== 'in_attesa' && o.iscrizione.stato !== 'scaduta') return false;
  if (new Date(o.evento.data).getTime() <= adesso.getTime()) return false;
  if (o.lotto?.quantita != null && o.altriNelLotto >= o.lotto.quantita) return false;
  return !o.doppione;
}

/** Le richieste dei tavoli si chiudono all'apertura: dopo, il termine per pagare sarebbe già passato. */
export function richiesteTavoliAperte(evento: Pick<Evento, 'data'>, adesso = new Date()) {
  return new Date(evento.data).getTime() > adesso.getTime();
}

/** Tiene occupato il tavolo: in attesa di pagamento o già pagata. */
export const prenotazioneAttiva = (p: Pick<PrenotazioneTavolo, 'stato'>) => p.stato === 'in_attesa' || p.stato === 'confermata';

export function prenotazioneScaduta(p: Pick<PrenotazioneTavolo, 'stato' | 'scade'>, adesso = new Date()) {
  return p.stato === 'in_attesa' && new Date(p.scade).getTime() <= adesso.getTime();
}

/**
 * Percorso interno del sito (per `?dopo=`): inizia con "/" ma non con "//" né "/\" (il browser legge "\" come "/"),
 * senza spazi né caratteri di controllo (tab e a capo vengono ignorati dal browser e "/<tab>/evil.com" diventerebbe "//evil.com").
 */
export const percorsoInterno = (p: string | null | undefined): p is string => typeof p === 'string' && /^\/(?![/\\])[^\s\x00-\x1f\\]*$/.test(p);

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
export const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ── Serata: prezzo dai tipi, bozza, "Cosa manca", tavoli in serie, coordinate da Google Maps ──

/** Prezzi dei tipi di prevendita di una serata: il prezzo si decide solo lì, il resto lo calcola da qui. */
export interface PrezzoTipi { primo: number; minimo: number; massimo: number }

/** `primo` è il prezzo del primo tipo (per ordine): è quello che precompila la cassa. Senza tipi: null. */
export function prezzoDaTipi(lotti: Pick<Lotto, 'prezzo' | 'ordine'>[]): PrezzoTipi | null {
  if (lotti.length === 0) return null;
  const prezzi = lotti.map((l) => l.prezzo);
  const primo = lotti.slice().sort((a, b) => a.ordine - b.ordine)[0].prezzo;
  return { primo, minimo: Math.min(...prezzi), massimo: Math.max(...prezzi) };
}

/**
 * Prezzi da mostrare nelle intestazioni: solo i tipi ancora vendibili (aperti, in arrivo o in coda dopo il precedente),
 * come la regola "il sito vende il primo tipo aperto con posti". Chiusi ed esauriti non contano, e a serata passata nulla
 * è vendibile. Se non resta nulla da vendere vale il prezzo dell'ultimo tipo, l'ultimo a cui si è venduto.
 * `primo` resta sempre il prezzo del primo tipo (precompila la cassa).
 */
export function prezzoVendibile(evento: Evento, lotti: Lotto[], usati: Record<string, number> = {}, adesso = new Date()): PrezzoTipi | null {
  const suoi = lotti.filter((l) => l.eventoId === evento.id).sort((a, b) => a.ordine - b.ordine);
  if (suoi.length === 0) return null;
  const vendibili = eventoPassato(evento, adesso) ? [] : tipiVista(evento, suoi, usati, { adesso })
    .filter((t) => t.stato === 'in_vendita' || t.stato === 'presto' || t.stato === 'dopo_precedente').map((t) => t.lotto);
  const prezzi = (vendibili.length > 0 ? vendibili : [suoi[suoi.length - 1]]).map((l) => l.prezzo);
  return { primo: suoi[0].prezzo, minimo: Math.min(...prezzi), massimo: Math.max(...prezzi) };
}

/** "8 €" se i tipi costano tutti uguale, "da 8 €" se i prezzi sono diversi. Senza tipi vale `daEvento` (serate vecchie). */
export function testoPrezzoTipi(p: PrezzoTipi | null, daEvento = 0) {
  if (!p) return euro(daEvento);
  return p.minimo === p.massimo ? euro(p.minimo) : `da ${euro(p.minimo)}`;
}

/** Il primo salvataggio di una serata nuova è sempre una bozza; poi vale il pulsante premuto (o lo stato di prima). */
export function pubblicatoDopoSalvataggio(o: { nuova: boolean; azione: string; eraPubblicata: boolean }) {
  if (o.nuova) return false;
  return o.azione === 'pubblica' ? true : o.azione === 'bozza' ? false : o.eraPubblicata;
}

export interface Manca { id: 'tipi' | 'locandina' | 'tavoli' | 'cassa'; testo: string; ancora: string }

/**
 * Cosa manca prima di pubblicare: tipi propri (non solo quello creato in automatico), locandina, tavoli se previsti,
 * prezzo della cassa se la cassa è attiva. Non blocca nulla: serve a pubblicare sapendolo.
 */
export function cosaManca(
  e: Pick<Evento, 'tipoIngresso' | 'locandinaUrl' | 'cassaAttiva' | 'prezzoCassa'>,
  lotti: (Pick<Lotto, 'nome' | 'prezzo'> & { automatico?: boolean })[], nTavoli: number,
): Manca[] {
  const manca: Manca[] = [];
  if (e.tipoIngresso !== 'libero') {
    if (lotti.length === 0) manca.push({ id: 'tipi', testo: 'Nessun tipo di prevendita: nessuno può iscriversi.', ancora: 'lotti' });
    else if (lotti.length === 1 && lotti[0].automatico) {
      manca.push({ id: 'tipi', testo: `Ci sono solo i tipi creati in automatico («${lotti[0].nome}», ${euro(lotti[0].prezzo)}): controllali o scegli un modello.`, ancora: 'lotti' });
    }
  }
  if (!e.locandinaUrl) manca.push({ id: 'locandina', testo: 'Manca la locandina.', ancora: 'copertina' });
  if (nTavoli === 0) manca.push({ id: 'tavoli', testo: 'Nessun tavolo (se la serata li prevede, aggiungili).', ancora: 'tavoli' });
  if (e.tipoIngresso !== 'libero' && e.cassaAttiva && e.prezzoCassa == null) manca.push({ id: 'cassa', testo: 'La cassa è attiva ma manca il prezzo in cassa.', ancora: 'porta' });
  return manca;
}

/**
 * Nomi di tavoli in serie da un nome di partenza: "T1" → T1, T2…; "T08" tiene gli zeri (T08, T09, T10);
 * senza numero finale ("Privé") parte da 1 ("Privé 1", "Privé 2"…).
 */
export function nomiInSerie(partenza: string, quanti: number): string[] {
  const nome = partenza.trim();
  const m = /^(.*?)(\d+)$/.exec(nome);
  const prefisso = m ? m[1] : `${nome} `;
  const cifre = m ? m[2] : '1';
  const primo = Number(cifre);
  const larghezza = cifre.length > 1 && cifre.startsWith('0') ? cifre.length : 0;
  return Array.from({ length: Math.max(0, quanti) }, (_, k) => `${prefisso}${String(primo + k).padStart(larghezza, '0')}`);
}

/** Latitudine e longitudine da un link lungo di Google Maps (@lat,lng · !3d…!4d… · q=lat,lng · ll=lat,lng). I link corti (goo.gl) no. */
export function coordinateDaLinkMaps(testo: string): { lat: number; lng: number } | null {
  const t = testo.trim();
  if (!t) return null;
  const coppia = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(t)
    ?? /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(t)
    ?? /[?&](?:q|ll|query|center)=(-?\d{1,3}(?:\.\d+)?)(?:,|%2C)(-?\d{1,3}(?:\.\d+)?)/i.exec(t);
  if (!coppia) return null;
  const lat = Number(coppia[1]);
  const lng = Number(coppia[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
