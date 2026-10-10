// Tipi del dominio. Ricalcano le tabelle di supabase/migrations/…_schema.sql,
// così il passaggio a Supabase cambierà solo lib/dati/archivio.ts.

export type Ruolo = 'admin' | 'staff' | 'pr';
export type TipoIngresso = 'libero' | 'lista' | 'prevendita_online';
export type StatoPr = 'attivo' | 'sospeso';
export type StatoIscrizione = 'in_lista' | 'pagato' | 'entrato' | 'annullato' | 'rimborsato';
export type MetodoPagamento = 'porta_contanti' | 'porta_pos' | 'pr';

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
  prezzoLista: number;
  prezzoCassa: number | null;     // ingresso pagato in cassa senza lista; null = come la lista
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
  visibileDaPr: boolean;
  ordine: number;
}

export interface Pr {
  id: string;
  handle: string;
  nomeDisplay: string;
  stato: StatoPr;
  createdAt: string;
}

export interface Iscrizione {
  id: string;
  eventoId: string;
  lottoId: string | null;
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
  oraCheckIn: string | null;
  porta: string | null;
  consensoPrivacyAt: string;
  consensoMarketing: boolean;
  annullatoAt: string | null;
  createdAt: string;
  canale: string;                 // da dove è arrivato: instagram, facebook, tiktok, whatsapp, google, diretto…
  consegnaId: string | null;      // soldi incassati dal PR già consegnati alla crew
  origine: 'lista' | 'cassa';     // cassa = registrato alla porta dallo staff, entra subito, senza QR
  rifCassa: string | null;        // id creato dal telefono della porta: evita doppioni se la sincronizzazione si ripete
}

/** Il PR consegna alla crew i soldi che i suoi clienti gli hanno dato prima della serata. */
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
}
