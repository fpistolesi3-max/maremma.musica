// Tipi del dominio. Ricalcano le tabelle di supabase/migrations/…_schema.sql,
// così il passaggio a Supabase cambierà solo lib/dati/archivio.ts.

export type Ruolo = 'admin' | 'staff' | 'pr';
export type TipoIngresso = 'libero' | 'lista' | 'prevendita_online';
export type StatoPr = 'attivo' | 'sospeso';
/**
 * in_attesa = prevendita appena chiesta: il posto è tenuto finché il cliente paga online (entro `scade`), poi scaduta.
 * pagato = prevendita pagata online, QR valido. in_lista = serata gratis (lotto a 0 € o ingresso libero), QR valido.
 */
export type StatoIscrizione = 'in_attesa' | 'scaduta' | 'in_lista' | 'pagato' | 'entrato' | 'annullato' | 'rimborsato';
/** online = prevendita pagata sul sito; porta_* = ingresso in cassa pagato alla porta. */
export type MetodoPagamento = 'online' | 'porta_contanti' | 'porta_pos';

export interface Evento {
  id: string;
  numero: number | null;          // MM/025
  slug: string;
  nome: string;
  data: string;                   // ISO, apertura porte
  dataFine: string | null;        // ISO, chiusura
  location: string | null;
  comune: string | null;
  lat: number | null;
  lng: number | null;
  locationSegreta: boolean;       // il posto si vede solo 48 ore prima
  tipoIngresso: TipoIngresso;
  descrizione: string | null;
  highlight: string | null;       // es. "Premio 500 € alla maschera migliore"
  dressCode: string | null;
  lineup: string[];
  infoArrivo: string | null;
  locandinaUrl: string | null;
  piantinaUrl: string | null;     // foto o disegno della sala, sfondo della mappa dei tavoli
  prezzoLista: number;
  cassaAttiva: boolean;           // false = ingresso solo in prevendita: alla porta niente cassa
  inCopertina?: boolean;          // serata scelta dall'admin per la copertina della home; una sola alla volta
  senzaTelefono: boolean;         // serata dove il telefono non entra: alla porta si controlla il documento, non il QR
  prezzoCassa: number | null;     // ingresso pagato in cassa senza prevendita; null = come la lista
  etaMinima: number;
  pubblicato: boolean;
  prAbilitati: string[] | null;   // null = tutti i PR attivi
  createdAt: string;
  updatedAt: string;
}

export interface Lotto {
  id: string;
  eventoId: string;
  nome: string;
  prezzo: number;
  quantita: number | null;        // null = senza limite
  dataInizio: string | null;
  dataFine: string | null;
  visibileDaPr: boolean;
  ordine: number;
  // Tipo di prevendita: categoria (Donne, Early bird…), uscita/chiusura relative alla serata, vincoli.
  categoria: string | null;       // controllata alla porta; null = ingresso normale
  confermaCategoria: boolean;     // il cliente dichiara di rientrare nella categoria (casella nel modulo)
  uscitaGiorniPrima: number | null; // esce N giorni prima della serata (vale al posto di dataInizio)
  fineOrePrima: number | null;    // si chiude N ore prima della serata (vale al posto di dataFine)
  dopoPrecedente: boolean;        // esce solo quando i posti del tipo precedente sono finiti
  prAbilitati: string[] | null;   // dai link di quali PR si vende; null = tutti (se visibileDaPr)
  automatico?: boolean;           // creato in automatico con la serata e mai ritoccato (assente nelle serate vecchie = false)
}

export type StatoTavolo = 'libero' | 'riservato' | 'confermato' | 'non_in_vendita';

/** Tavolo di una serata: si prende con una spesa minima, non a persona. */
export interface Tavolo {
  id: string;
  eventoId: string;
  nome: string;                   // T4, Privé 2…
  zona: string | null;            // Pista, Privé, Terrazza…
  posti: number | null;           // quante persone ci stanno; null = non indicato
  spesaMinima: number;
  stato: StatoTavolo;
  nota: string | null;            // solo admin: es. a chi è riservato
  visibileDaPr: boolean;          // false = nessun PR lo può proporre
  prAbilitati: string[] | null;   // a quali PR è affidato; null = tutti (se visibileDaPr)
  ordine: number;
  x: number | null;               // posizione sulla mappa, in % della piantina (0–100); null = non sulla mappa
  y: number | null;
}

/** rimborsata = era pagata, annullata e restituiti i soldi; annullata = chiusa senza rimborso. */
export type StatoPrenotazione = 'in_attesa' | 'confermata' | 'annullata' | 'rimborsata' | 'scaduta';

/**
 * Come è arrivato l'anticipo del tavolo. Tutti i pagamenti passano dal sito: online (carta, Apple Pay, Google Pay).
 * Gli altri valori restano solo per le prenotazioni segnate a mano prima di questa regola.
 */
export type MetodoTavolo = 'bonifico' | 'satispay' | 'contanti' | 'pos' | 'online';

/**
 * Pagamento online di una prenotazione. `sessione`: l'ultima pagina di pagamento aperta (Stripe o di prova);
 * `pagamento`: l'id del pagamento riuscito, serve per il rimborso; `daRimborsare`: il pagamento è arrivato quando
 * la prenotazione era già chiusa e il tavolo di un altro, quindi i soldi vanno restituiti.
 */
export interface PagamentoOnline { sessione: string | null; pagamento: string | null; daRimborsare: boolean }

/**
 * Richiesta di un tavolo. Nasce "in attesa": il tavolo è fermo ma la spesa minima va pagata in anticipo
 * entro `scade` sul sito, altrimenti decade. A pagamento riuscito diventa "confermata" e il QR vale.
 */
export interface PrenotazioneTavolo {
  id: string;
  tavoloId: string;
  eventoId: string;
  prId: string | null;            // null = Maremma Musica
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  persone: number;
  spesaMinima: number;            // quella del tavolo al momento della richiesta
  stato: StatoPrenotazione;
  scade: string;                  // termine per pagare
  tokenQr: string;                // un solo QR per tutto il tavolo
  codice: string;
  inseritaDa: 'cliente' | 'pr' | 'crew';  // crew = l'admin, per un tavolo venduto a voce: il cliente paga dal link
  consensoPrivacyAt: string;
  createdAt: string;
  pagatoAt: string | null;
  metodoPagamento: MetodoTavolo | null;
  pagatoDa: string | null;        // email di chi ha segnato il pagamento
  chiusaAt: string | null;        // annullata, rimborsata o scaduta
  chiusaDa: string | null;        // email di chi l'ha annullata o rimborsata; null = scaduta da sola
  promemoriaAt: string | null;    // promemoria del termine già mandato
  avvisoChiusuraAt: string | null; // email "prenotazione chiusa" già mandata al cliente
  pagamentoOnline: PagamentoOnline | null; // null solo per le prenotazioni segnate a mano prima che tutto passasse dal sito
  /** Persone del tavolo già entrate. `rif` è l'id creato dal telefono della porta: una sincronizzazione ripetuta non conta due volte. */
  ingressi: { rif: string; ora: string; porta: string }[];
}

export interface Pr {
  id: string;
  handle: string;
  nomeDisplay: string;
  stato: StatoPr;
  createdAt: string;
}

/** Lo staff ha controllato la categoria alla porta e la persona non rientra: chi, quando, da quale porta. */
export interface RifiutoIngresso { ora: string; porta: string; da: string }

export interface Iscrizione {
  id: string;
  eventoId: string;
  lottoId: string | null;
  categoria: string | null;       // categoria del tipo di prevendita all'iscrizione (si controlla alla porta)
  rifiutoIngresso?: RifiutoIngresso | null; // ultimo "Non rientra" dello staff alla porta; l'iscrizione resta valida
  prId: string | null;            // null = Lista Maremma Musica
  nome: string;
  cognome: string;
  dataNascita: string;            // YYYY-MM-DD
  email: string;                  // vuota per chi entra in cassa (niente QR, niente email)
  tokenQr: string;                // firmato HMAC, mai progressivo
  codice: string;                 // 8 caratteri da dettare alla porta
  stato: StatoIscrizione;
  metodoPagamento: MetodoPagamento | null;
  importo: number;                // prezzo del lotto al momento dell'iscrizione
  pagatoAt: string | null;
  scade: string | null;           // in attesa: termine per pagare online
  pagamentoOnline: PagamentoOnline | null; // prevendita pagata (o da pagare) sul sito; null per gratis e cassa
  oraCheckIn: string | null;
  porta: string | null;
  consensoPrivacyAt: string;
  consensoMarketing: boolean;
  annullatoAt: string | null;
  createdAt: string;
  canale: string;                 // da dove è arrivato: instagram, facebook, tiktok, whatsapp, google, diretto…
  consegnaId: string | null;      // solo storico: soldi incassati dal PR e consegnati, prima che tutto passasse dal sito
  origine: 'lista' | 'cassa';     // cassa = registrato alla porta dallo staff, entra subito, senza QR
  rifCassa: string | null;
  /**
   * Dopo `GIORNI_ANONIMIZZAZIONE` giorni dalla serata nome, cognome, email e data di nascita si cancellano (restano come stringa
   * vuota; nel database relazionale diventano null). La riga resta per le analisi: età alla serata, tipo di prevendita, importo,
   * PR o sito, data d'acquisto, ingresso. Il consenso marketing non si tocca.
   */
  anonimizzata?: boolean;
  etaAllaSerata?: number | null;  // calcolata prima di cancellare la data di nascita
  anonimizzataAt?: string | null;        // id creato dal telefono della porta: evita doppioni se la sincronizzazione si ripete
}

/** Solo storico: il PR consegnava alla crew i soldi dei clienti. Ora la prevendita si paga solo online. */
export interface Consegna {
  id: string;
  prId: string;
  eventoId: string | null;        // null = tutte le serate
  importo: number;
  iscrizioni: string[];
  confermataDa: string;           // email di chi ha ricevuto i soldi (staff o admin)
  confermataAt: string;
  annullataAt: string | null;
  annullataDa: string | null;
}

export interface Utente {
  id: string;
  email: string;
  ruolo: Ruolo;
  prId: string | null;
  createdAt: string;
}

/** Link magico / codice a 6 cifre per entrare senza password. Salviamo solo gli hash. */
export interface Accesso {
  id: string;
  utenteId: string;
  tokenHash: string;
  codiceHash: string;
  scade: string;
  usato: boolean;
  tentativi: number;
}

export interface EmailInviata {
  id: string;
  a: string;
  oggetto: string;
  html: string;
  inviataAt: string;
  via: 'archivio' | 'smtp';
}

export interface StatoPorta {
  nome: string;                   // P1, P2…
  eventoId: string;
  ultimoSync: string;
  ingressi: number;
}

export interface Archivio {
  versione: 1;
  segreto: string;                // chiave HMAC generata al primo avvio (sovrascrivibile da MM_SEGRETO)
  eventi: Evento[];
  lotti: Lotto[];
  pr: Pr[];
  iscrizioni: Iscrizione[];
  utenti: Utente[];
  accessi: Accesso[];
  posta: EmailInviata[];
  porte: StatoPorta[];
  consegne: Consegna[];
  tavoli: Tavolo[];
  prenotazioni: PrenotazioneTavolo[];
}
