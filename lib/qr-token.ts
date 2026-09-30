import { createHmac, timingSafeEqual } from 'node:crypto';

// Token del QR: MM1.<id>.<timestamp>.<firma>
//   id        = uuid dell'iscrizione in base64url (22 caratteri): casuale, mai progressivo
//   timestamp = momento dell'emissione in base36
//   firma     = HMAC-SHA256(segreto, id|evento|timestamp), 16 byte in base64url
// Chi non ha il segreto non può fabbricare un QR valido, e cambiare anche un solo carattere lo invalida.

const PREFISSO = 'MM1';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function uuidInBase64(uuid: string) {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');
}

function base64InUuid(b64: string) {
  const hex = Buffer.from(b64, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function firma(segreto: string, id: string, eventoId: string, ts: string) {
  return createHmac('sha256', segreto).update(`qr|${id}|${eventoId}|${ts}`).digest().subarray(0, 16).toString('base64url');
}

export function creaTokenQr(segreto: string, id: string, eventoId: string, quando = new Date()) {
  const ts = quando.getTime().toString(36);
  return `${PREFISSO}.${uuidInBase64(id)}.${ts}.${firma(segreto, id, eventoId, ts)}`;
}

/** Legge il token senza verificarlo: serve a trovare l'iscrizione. */
export function leggiTokenQr(token: string): { id: string; emessoIl: Date } | null {
  const parti = token.trim().split('.');
  if (parti.length !== 4 || parti[0] !== PREFISSO) return null;
  const id = base64InUuid(parti[1]);
  const ms = parseInt(parti[2], 36);
  if (!id || !Number.isFinite(ms)) return null;
  return { id, emessoIl: new Date(ms) };
}

export function verificaTokenQr(segreto: string, token: string, eventoId: string): boolean {
  const parti = token.trim().split('.');
  if (parti.length !== 4) return false;
  const letto = leggiTokenQr(token);
  if (!letto) return false;
  const atteso = Buffer.from(firma(segreto, letto.id, eventoId, parti[2]));
  const ricevuto = Buffer.from(parti[3]);
  return atteso.length === ricevuto.length && timingSafeEqual(atteso, ricevuto);
}

/** Codice di 8 caratteri (alfabeto Crockford, niente I L O U) da dettare se il QR non si legge. */
export function creaCodice(segreto: string, id: string) {
  const byte = createHmac('sha256', segreto).update(`codice|${id}`).digest();
  let out = '';
  for (let i = 0; i < 8; i++) out += CROCKFORD[byte[i] % 32];
  return out;
}

export function normalizzaCodice(input: string) {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

export function mostraCodice(codice: string) {
  return `${codice.slice(0, 4)}-${codice.slice(4)}`;
}
