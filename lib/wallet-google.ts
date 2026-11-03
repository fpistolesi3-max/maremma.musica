import 'server-only';
import { createSign } from 'node:crypto';
import { COLORI_PASS, type CampiPass } from './wallet';

export interface ChiaviGoogle {
  issuerId: string;
  email: string;         // email del service account
  chiave: string;        // chiave privata PEM del service account
  sito: string;          // indirizzo pubblico del sito, senza barra finale (il logo deve essere raggiungibile da Google)
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');
const testo = (value: string) => ({ defaultValue: { language: 'it-IT', value } });
/** Gli id di Google ammettono solo lettere, cifre, punto, trattino e sottolineatura. */
const pulisciId = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');

/** Le chiavi dalle variabili d'ambiente. La chiave privata si può incollare con gli "a capo" scritti come \n. */
export function chiaviGoogleDaEnv(sito: string, env: Record<string, string | undefined> = process.env): ChiaviGoogle {
  return {
    issuerId: (env.GOOGLE_WALLET_ISSUER_ID ?? '').trim(),
    email: (env.GOOGLE_WALLET_EMAIL ?? '').trim(),
    chiave: (env.GOOGLE_WALLET_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim(),
    sito,
  };
}

/**
 * Classe (la serata, una per serata) e oggetto (il biglietto, uno per biglietto) di Google Wallet.
 * La classe non porta il luogo finché è segreto; l'oggetto vale fino all'orario limite.
 */
export function classeEOggetto(c: CampiPass, k: Pick<ChiaviGoogle, 'issuerId' | 'sito'>) {
  const idClasse = `${k.issuerId}.${pulisciId(`evento_${c.eventoId}`)}`;
  const idOggetto = `${k.issuerId}.${pulisciId(`biglietto_${c.id}`)}`;
  const classe = {
    id: idClasse,
    issuerName: 'Maremma Musica',
    reviewStatus: 'UNDER_REVIEW',
    eventName: testo(c.titolo),
    dateTime: { start: c.inizio, ...(c.fine ? { end: c.fine } : {}) },
    hexBackgroundColor: COLORI_PASS.sfondo,
    logo: { sourceUri: { uri: `${k.sito}/img/logo-maremma-musica.png` }, contentDescription: testo('Maremma Musica') },
    ...(c.luogo ? { venue: { name: testo(c.luogo), address: testo(c.luogo) } } : {}),
    ...(c.coordinate ? { locations: [{ latitude: c.coordinate.lat, longitude: c.coordinate.lng }] } : {}),
  };
  const oggetto = {
    id: idOggetto,
    classId: idClasse,
    state: 'ACTIVE',
    // Lo stesso identico token della pagina del biglietto, con il codice da dettare sotto.
    barcode: { type: 'QR_CODE', value: c.qr, alternateText: c.codice },
    ticketHolderName: c.titolare,
    ticketNumber: c.codice,
    ...(c.tipo ? { ticketType: testo(c.tipo) } : {}),
    validTimeInterval: { start: { date: c.validoDal }, end: { date: c.scadenza } },
    textModulesData: [
      { id: 'giorno', header: 'DATA', body: `${c.giorno} · ${c.orari}` },
      ...(c.validaFinoAlle ? [{ id: 'limite', header: 'VALIDA FINO ALLE', body: c.validaFinoAlle }] : []),
      { id: 'lista', header: 'LISTA', body: c.lista },
      { id: 'luogo', header: 'LUOGO', body: c.testoLuogo },
    ],
  };
  return { classe, oggetto };
}

/** Il link "Salva in Google Wallet": un JWT firmato (RS256) con la chiave del service account. */
export function linkSalvaGoogle(c: CampiPass, k: ChiaviGoogle, adesso = new Date()): string {
  const { classe, oggetto } = classeEOggetto(c, k);
  const intestazione = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iss: k.email,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(adesso.getTime() / 1000),
    origins: [k.sito],
    payload: { eventTicketClasses: [classe], eventTicketObjects: [oggetto] },
  }));
  const firma = createSign('RSA-SHA256').update(`${intestazione}.${corpo}`).sign(k.chiave).toString('base64url');
  return `https://pay.google.com/gp/v/save/${intestazione}.${corpo}.${firma}`;
}
