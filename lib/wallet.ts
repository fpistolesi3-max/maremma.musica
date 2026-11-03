import type { Biglietto } from './dati/pubblico';
import { limiteIngresso, qrMostrabile } from './regole';
import { luogoVisibile } from './luogo';
import { mostraCodice } from './qr-token';
import { dataCompleta, giornoSettLungo, orari, ora } from './formato';

// Colori del sito (vedi app/globals.css): notte, osso e arancio.
export const COLORI_PASS = { sfondo: '#0c0f14', testo: '#e1d7c9', accento: '#d55b23' };

const env = (nome: string) => (process.env[nome] ?? '').trim();

/** Apple Wallet è attivo solo se ci sono tutte le variabili: se ne manca una sola la route risponde 404 e il pulsante non c'è. */
export const APPLE_VARIABILI = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_BASE64', 'APPLE_PASS_KEY_BASE64', 'APPLE_PASS_KEY_PASSWORD', 'APPLE_WWDR_CERT_BASE64'] as const;
export const GOOGLE_VARIABILI = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_EMAIL', 'GOOGLE_WALLET_PRIVATE_KEY'] as const;

export const appleConfigurato = () => APPLE_VARIABILI.every((v) => env(v));
export const googleConfigurato = () => GOOGLE_VARIABILI.every((v) => env(v));
export const walletConfigurato = () => appleConfigurato() || googleConfigurato();

export type EsitoPass = { ok: true } | { ok: false; stato: 404 | 410; messaggio: string };

/**
 * Chi può avere il pass: gli stessi controlli del PDF. Niente per le prevendite non valide (non pagate, da restituire), per quelle annullate
 * o rimborsate (410), per le serate senza telefono (alla porta si mostra il documento) e per i biglietti già scaduti.
 * Il pass non sostituisce i controlli: alla porta il QR si verifica comunque sul server.
 */
export function esitoPass(b: Biglietto, adesso = new Date()): EsitoPass {
  const i = b.iscrizione;
  if (i.stato === 'rimborsato' || i.pagamentoOnline?.rimborso?.stato === 'fatto') return { ok: false, stato: 410, messaggio: 'Biglietto rimborsato: non è più valido' };
  if (i.stato === 'annullato') return { ok: false, stato: 410, messaggio: 'Biglietto annullato: non è più valido' };
  if (!qrMostrabile(i) || i.anonimizzata) return { ok: false, stato: 404, messaggio: 'Biglietto non trovato' };
  if (b.evento.senzaTelefono) return { ok: false, stato: 404, messaggio: 'Serata senza telefono: alla porta serve il documento' };
  if (adesso.getTime() >= Date.parse(scadenzaPass(b))) return { ok: false, stato: 410, messaggio: 'Biglietto scaduto' };
  return { ok: true };
}

/** Quando il pass risulta scaduto: l'orario limite della prevendita; per l'ingresso libero la fine della serata (o 6 ore dopo l'apertura, come nel calendario). */
export function scadenzaPass(b: Pick<Biglietto, 'evento'>): string {
  const e = b.evento;
  return new Date(limiteIngresso(e) ?? e.dataFine ?? Date.parse(e.data) + 6 * 3_600_000).toISOString();
}

/** Tutto quello che il pass mostra, uguale per Apple e Google. Funzione pura: si prova senza certificati. */
export interface CampiPass {
  id: string;                      // numero di serie (Apple) e parte dell'id dell'oggetto (Google): l'id dell'iscrizione
  eventoId: string;
  titolo: string;                  // nome della serata
  numero: string | null;           // es. "MM/025"
  inizio: string;                  // ISO
  fine: string | null;             // ISO
  giorno: string;                  // "Sabato 31.10.2026"
  orari: string;                   // "22:00 → 03:00"
  luogo: string | null;            // null finché la location è segreta (o non ancora scelta)
  testoLuogo: string;              // il luogo, oppure il motivo per cui non c'è: stesse parole della pagina del biglietto
  coordinate: { lat: number; lng: number } | null;
  titolare: string;
  tipo: string | null;             // tipo di prevendita (categoria), se c'è
  lista: string;
  validaFinoAlle: string | null;   // "01:00" (niente per l'ingresso libero)
  scadenza: string;                // ISO: da qui il pass risulta scaduto
  qr: string;                      // lo stesso identico token della pagina del biglietto
  codice: string;                  // "ABCD-1234", scritto sotto il QR
}

export function campiPass(b: Biglietto, adesso = new Date()): CampiPass {
  const { iscrizione: i, evento: e } = b;
  const visibile = luogoVisibile(e, adesso);
  const limite = limiteIngresso(e);
  const luogo = visibile ? [e.comune, e.location].filter(Boolean).join(' · ') || null : null;
  return {
    id: i.id,
    eventoId: e.id,
    titolo: e.nome,
    numero: e.numero == null ? null : `MM/${String(e.numero).padStart(3, '0')}`,
    inizio: e.data,
    fine: e.dataFine,
    giorno: `${giornoSettLungo(e.data)} ${dataCompleta(e.data)}`,
    orari: orari(e.data, e.dataFine),
    luogo,
    testoLuogo: luogo ?? (visibile ? 'Location in arrivo' : 'Location segreta: la scopri 48 ore prima della serata'),
    coordinate: visibile && e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : null,
    titolare: `${i.nome} ${i.cognome}`.trim(),
    tipo: i.categoria,
    lista: b.lista,
    validaFinoAlle: limite ? ora(limite) : null,
    scadenza: scadenzaPass(b),
    qr: i.tokenQr,
    codice: mostraCodice(i.codice),
  };
}
