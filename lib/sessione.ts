import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { leggi, modifica, segreto } from './dati/archivio';
import type { Pr, Ruolo, Utente } from './dati/tipi';
import { bottoneEmail, escapeHtml, guscioEmail, inviaEmail } from './posta';
import { modalitaProva } from './prova';
import { percorsoInterno } from './regole';

// Accesso senza password per PR, staff porta e admin: link magico o codice a 6 cifre via email.
// La sessione è un cookie firmato HMAC (httpOnly). Nessuna password viene mai salvata.

const COOKIE = 'mm_sessione';
const DURATA_SESSIONE_GIORNI = 30;
const DURATA_ACCESSO_MIN = 60;

export interface Sessione {
  utente: Utente;
  pr: Pr | null;
}

const hash = (s: string) => createHash('sha256').update(s).digest('base64url');

async function firma(valore: string) {
  return createHmac('sha256', await segreto()).update(`sessione|${valore}`).digest('base64url');
}

export async function sessioneCorrente(): Promise<Sessione | null> {
  const valore = (await cookies()).get(COOKIE)?.value;
  if (!valore) return null;
  const [uid, scade, sig] = valore.split('.');
  if (!uid || !scade || !sig) return null;
  const atteso = Buffer.from(await firma(`${uid}.${scade}`));
  const ricevuto = Buffer.from(sig);
  if (atteso.length !== ricevuto.length || !timingSafeEqual(atteso, ricevuto)) return null;
  if (parseInt(scade, 36) < Date.now()) return null;
  const d = await leggi();
  const utente = d.utenti.find((u) => u.id === uid);
  if (!utente) return null;
  const pr = utente.prId ? d.pr.find((p) => p.id === utente.prId) ?? null : null;
  if (utente.ruolo === 'pr' && (!pr || pr.stato !== 'attivo')) return null; // PR sospeso: fuori
  return { utente, pr };
}

/** Per le pagine protette: senza sessione del ruolo giusto rimanda all'accesso. */
export async function richiedi(ruoli: Ruolo[], dopo: string): Promise<Sessione> {
  const s = await sessioneCorrente();
  if (!s || !ruoli.includes(s.utente.ruolo)) redirect(`/accedi?dopo=${encodeURIComponent(dopo)}`);
  return s;
}

async function apriSessione(utenteId: string) {
  const scade = (Date.now() + DURATA_SESSIONE_GIORNI * 86_400_000).toString(36);
  const valore = `${utenteId}.${scade}`;
  const h = await headers();
  const https = (h.get('x-forwarded-proto') ?? '').includes('https') || process.env.NODE_ENV === 'production';
  (await cookies()).set(COOKIE, `${valore}.${await firma(valore)}`, {
    httpOnly: true, sameSite: 'lax', secure: https, path: '/', maxAge: DURATA_SESSIONE_GIORNI * 86_400,
  });
}

export async function chiudiSessione() {
  (await cookies()).delete(COOKIE);
}

/** Quali aree può aprire un ruolo (evita i giri tra /accedi e una pagina vietata). */
export function puoAprire(ruolo: Ruolo, percorso: string) {
  if (ruolo === 'admin') return true;
  if (percorso.startsWith('/admin')) return false;
  if (percorso.startsWith('/door')) return ruolo === 'staff';
  if (percorso.startsWith('/gestione')) return ruolo === 'staff';
  if (percorso === '/pr' || percorso.startsWith('/pr/')) return ruolo === 'pr';
  return true;
}

export function destinazionePer(utente: Utente, pr: Pr | null, dopo?: string | null) {
  if (percorsoInterno(dopo) && dopo !== '/pr' && puoAprire(utente.ruolo, dopo)) return dopo;
  if (utente.ruolo === 'admin') return '/admin';
  if (utente.ruolo === 'staff') return '/door';
  return pr ? `/pr/${pr.handle}` : '/';
}

/** Manda il link. Risponde sempre allo stesso modo, così non si scopre chi è registrato. */
export async function inviaAccesso(email: string, origine: string, dopo: string | null): Promise<string | undefined> {
  const d = await leggi();
  const utente = d.utenti.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!utente) return;
  if (utente.ruolo === 'pr') {
    const pr = d.pr.find((p) => p.id === utente.prId);
    if (!pr || pr.stato !== 'attivo') return;
  }
  const token = randomBytes(24).toString('base64url');
  const codice = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await modifica((a) => {
    a.accessi = a.accessi.filter((x) => new Date(x.scade) > new Date() && !x.usato && x.utenteId !== utente.id);
    a.accessi.push({
      id: randomUUID(), utenteId: utente.id, tokenHash: hash(token), codiceHash: hash(`${utente.id}|${codice}`),
      scade: new Date(Date.now() + DURATA_ACCESSO_MIN * 60_000).toISOString(), usato: false, tentativi: 0,
    });
  });
  const link = `${origine}/accedi/verifica?t=${token}${dopo ? `&dopo=${encodeURIComponent(dopo)}` : ''}`;
  await inviaEmail({
    a: utente.email,
    oggetto: 'Il tuo accesso a Maremma Musica',
    html: guscioEmail('Entra nella tua area', `
<p style="font:400 16px/24px Arial,sans-serif;margin:0 0 24px;">Tocca il pulsante per entrare. Il link vale un'ora e funziona una volta sola.</p>
${bottoneEmail(link, 'Entra →')}
<p style="font:400 14px/20px Arial,sans-serif;color:#a39e95;margin:0 0 8px;">Oppure scrivi questo codice nella pagina di accesso:</p>
<p style="font:500 28px/32px 'Courier New',monospace;letter-spacing:.2em;margin:0 0 24px;">${escapeHtml(codice)}</p>
<p style="font:400 12px/18px Arial,sans-serif;color:#77736c;margin:0;">Non hai chiesto tu l'accesso? Ignora questa email.</p>`),
  });
  // Solo in sviluppo: il link torna alla pagina, così si provano gli account senza aprire la posta.
  return modalitaProva() ? link : undefined;
}

export async function entraConToken(token: string): Promise<Sessione | null> {
  const h = hash(token);
  const utenteId = await modifica((a) => {
    const x = a.accessi.find((q) => q.tokenHash === h);
    if (!x || x.usato || new Date(x.scade) < new Date()) return null;
    x.usato = true;
    return x.utenteId;
  });
  if (!utenteId) return null;
  await apriSessione(utenteId);
  return sessioneDaId(utenteId);
}

export async function entraConCodice(email: string, codice: string): Promise<Sessione | null> {
  const d = await leggi();
  const utente = d.utenti.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!utente) return null;
  const h = hash(`${utente.id}|${codice.replace(/\D/g, '')}`);
  const ok = await modifica((a) => {
    const x = a.accessi.find((q) => q.utenteId === utente.id && !q.usato && new Date(q.scade) > new Date());
    if (!x) return false;
    x.tentativi += 1;
    if (x.tentativi > 5) { x.usato = true; return false; } // troppi tentativi: serve un nuovo codice
    if (x.codiceHash !== h) return false;
    x.usato = true;
    return true;
  });
  if (!ok) return null;
  await apriSessione(utente.id);
  return sessioneDaId(utente.id);
}

async function sessioneDaId(id: string): Promise<Sessione | null> {
  const d = await leggi();
  const utente = d.utenti.find((u) => u.id === id);
  if (!utente) return null;
  return { utente, pr: utente.prId ? d.pr.find((p) => p.id === utente.prId) ?? null : null };
}

/** Origine vista dal browser (serve per i link nelle email aperti dal telefono in rete locale). */
export async function origineRichiesta() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || /^\d/.test(host) ? 'http' : 'https');
  return process.env.SITO_URL || `${proto}://${host}`;
}
