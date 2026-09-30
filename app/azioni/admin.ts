'use server';

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sessioneCorrente, type Sessione } from '@/lib/sessione';
import {
  cambiaStatoIscrizione, cambiaStatoPr, creaPr, creaStaff, eliminaLotto, rimuoviStaff, salvaEvento, salvaLotto, type DatiEvento,
} from '@/lib/dati/admin';
import { CARTELLA_MEDIA } from '@/lib/dati/archivio';
import { slugDa } from '@/lib/formato';
import type { TipoIngresso } from '@/lib/dati/tipi';

async function admin(): Promise<Sessione> {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'admin') redirect('/accedi?dopo=/admin');
  return s;
}

export interface EsitoAzione { ok?: string; errore?: string; campi?: Record<string, string> }

const t = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.').replace(/[^\d.]/g, '')));

/** "2026-10-31" + "22:00" nel fuso di Roma → ISO. La chiusura dopo mezzanotte passa al giorno dopo. */
function isoRoma(giorno: string, orario: string) {
  const prova = new Date(`${giorno}T${orario}:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' })
    .formatToParts(prova).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+1';
  const [h, m = '0'] = offset.split(':');
  const segno = h.startsWith('-') ? '-' : '+';
  return new Date(`${giorno}T${orario}:00${segno}${String(Math.abs(Number(h))).padStart(2, '0')}:${m.padStart(2, '0')}`).toISOString();
}

async function salvaLocandina(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('La locandina deve essere JPG, PNG o WebP');
  if (file.size > 10 * 1024 * 1024) throw new Error('Locandina troppo pesante (massimo 10 MB)');
  const est = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const nome = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${est}`;
  await fs.mkdir(CARTELLA_MEDIA, { recursive: true });
  await fs.writeFile(path.join(CARTELLA_MEDIA, nome), Buffer.from(await file.arrayBuffer()));
  return `/media/${nome}`; // TODO: in produzione Supabase Storage (bucket "locandine")
}

export async function salvaSerata(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  const id = t(f, 'id') || null;
  const campi: Record<string, string> = {};
  const nome = t(f, 'nome');
  const giorno = t(f, 'giorno');
  const apertura = t(f, 'apertura') || '22:00';
  const chiusura = t(f, 'chiusura');
  if (!nome) campi.nome = 'Scrivi il titolo della serata';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) campi.giorno = 'Scegli la data';
  if (!/^\d{2}:\d{2}$/.test(apertura)) campi.apertura = 'Orario hh:mm';
  if (chiusura && !/^\d{2}:\d{2}$/.test(chiusura)) campi.chiusura = 'Orario hh:mm';
  const slug = slugDa(t(f, 'slug') || nome);
  if (!slug) campi.slug = 'Indirizzo non valido';
  const tipo = t(f, 'tipoIngresso') as TipoIngresso;
  if (tipo === 'prevendita_online') campi.tipoIngresso = 'La prevendita online arriverà con l’opzione C';
  const prezzo = num(t(f, 'prezzoLista')) ?? 0;
  const eta = num(t(f, 'etaMinima')) ?? 18;
  const prezzoCassa = num(t(f, 'prezzoCassa'));
  if (prezzoCassa != null && (Number.isNaN(prezzoCassa) || prezzoCassa < 0)) campi.prezzoCassa = 'Prezzo non valido';
  if (Number.isNaN(prezzo) || prezzo < 0) campi.prezzoLista = 'Prezzo non valido';
  if (Number.isNaN(eta) || eta < 0 || eta > 99) campi.etaMinima = 'Età non valida';
  if (Object.keys(campi).length) return { errore: 'Controlla i campi segnati.', campi };

  const data = isoRoma(giorno, apertura);
  let dataFine: string | null = null;
  if (chiusura) {
    dataFine = isoRoma(giorno, chiusura);
    if (dataFine <= data) dataFine = new Date(new Date(dataFine).getTime() + 86_400_000).toISOString();
  }
  let locandinaUrl: string | null;
  try {
    locandinaUrl = (await salvaLocandina(f.get('locandina') as File | null)) ?? (t(f, 'locandinaAttuale') || null);
  } catch (e) {
    return { errore: (e as Error).message, campi: { locandina: (e as Error).message } };
  }
  const prScelti = f.getAll('pr').map(String);
  const tuttiPr = f.get('prTutti') === '1';
  const dati: DatiEvento = {
    slug, nome, data, dataFine,
    numero: num(t(f, 'numero')),
    location: t(f, 'location') || null, comune: t(f, 'comune') || null,
    lat: num(t(f, 'lat')), lng: num(t(f, 'lng')),
    locationSegreta: f.get('locationSegreta') === 'on',
    tipoIngresso: tipo === 'libero' ? 'libero' : 'lista',
    descrizione: t(f, 'descrizione') || null, highlight: t(f, 'highlight') || null, dressCode: t(f, 'dressCode') || null,
    lineup: t(f, 'lineup').split(/\n|·/).map((x) => x.trim()).filter(Boolean),
    infoArrivo: t(f, 'infoArrivo') || null, locandinaUrl,
    prezzoLista: tipo === 'libero' ? 0 : prezzo, etaMinima: eta,
    prezzoCassa: tipo === 'libero' ? null : prezzoCassa,
    pubblicato: t(f, 'azione') === 'pubblica' ? true : t(f, 'azione') === 'bozza' ? false : f.get('pubblicato') === '1',
    prAbilitati: tuttiPr ? null : prScelti,
  };
  let salvato;
  try {
    salvato = await salvaEvento(s, id, dati);
  } catch (e) {
    return { errore: (e as Error).message, campi: { slug: (e as Error).message } };
  }
  revalidatePath('/', 'layout');
  redirect(`/admin/eventi/${salvato.id}/modifica?salvato=1`);
}

export async function salvaLottoAzione(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  const eventoId = t(f, 'eventoId');
  const nome = t(f, 'nome');
  const prezzo = num(t(f, 'prezzo'));
  if (!nome) return { errore: 'Dai un nome al lotto (es. "Primo lotto").' };
  if (prezzo == null || Number.isNaN(prezzo) || prezzo < 0) return { errore: 'Prezzo non valido.' };
  const quantita = num(t(f, 'quantita'));
  const inizio = t(f, 'dataInizio');
  const fine = t(f, 'dataFine');
  await salvaLotto(s, {
    id: t(f, 'id') || null, eventoId, nome, prezzo,
    quantita: quantita == null || Number.isNaN(quantita) ? null : Math.round(quantita),
    dataInizio: inizio ? isoRoma(inizio.slice(0, 10), inizio.slice(11, 16) || '00:00') : null,
    dataFine: fine ? isoRoma(fine.slice(0, 10), fine.slice(11, 16) || '23:59') : null,
    visibileDaPr: f.get('visibileDaPr') === 'on', ordine: Number(t(f, 'ordine') || 0),
  });
  revalidatePath('/', 'layout');
  return { ok: 'Lotto salvato.' };
}

export async function eliminaLottoAzione(id: string) {
  const s = await admin();
  try { await eliminaLotto(s, id); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: 'Lotto eliminato.' };
}

export async function azioneIscrizione(id: string, azione: 'annulla' | 'rimborsa' | 'ripristina') {
  const s = await admin();
  try { await cambiaStatoIscrizione(s, id, azione); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/admin', 'layout');
  return { ok: 'Fatto.' };
}

export async function creaPrAzione(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  const nome = t(f, 'nome');
  try {
    await creaPr(s, { nome, handle: t(f, 'handle') || slugDa(nome), email: t(f, 'email') });
  } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/admin/pr');
  return { ok: `${nome} è dentro: può entrare da /accedi con la sua email.` };
}

export async function statoPrAzione(prId: string, attivo: boolean) {
  const s = await admin();
  await cambiaStatoPr(s, prId, attivo);
  revalidatePath('/admin/pr');
}

export async function creaStaffAzione(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  try { await creaStaff(s, t(f, 'email'), t(f, 'ruolo') === 'admin' ? 'admin' : 'staff'); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/admin/staff');
  return { ok: 'Accesso creato: entra da /accedi con la sua email.' };
}

export async function rimuoviStaffAzione(id: string) {
  const s = await admin();
  try { await rimuoviStaff(s, id); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/admin/staff');
  return { ok: 'Accesso tolto.' };
}
