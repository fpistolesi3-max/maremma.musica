'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sessioneCorrente, type Sessione } from '@/lib/sessione';
import type { NomeModello } from '@/lib/tipi-modelli';
import {
  applicaModelloTipi, cambiaNominativo, cambiaStatoIscrizione, cambiaStatoPr, copiaTipi, copiaTavoli, creaPr, creaStaff, creaTavoliInSerie, duplicaSerata, eliminaLotto, eliminaTavolo, posizionaTavolo, rimuoviStaff, salvaEvento, salvaLotto, salvaPiantina, salvaTavolo, type DatiEvento,
} from '@/lib/dati/admin';
import { salvaMedia } from '@/lib/dati/media';
import { chiudiRimborsoIscrizione, pagamentoIscrizioneDi } from '@/lib/dati/prevendita';
import { rimborsa } from '@/lib/pagamenti';
import { isoRoma, slugDa } from '@/lib/formato';
import { componiData, istanteDopoApertura, LIMITE_PREVENDITA_DEFAULT, pubblicatoDopoSalvataggio } from '@/lib/regole';
import type { StatoTavolo, TipoIngresso } from '@/lib/dati/tipi';

async function admin(): Promise<Sessione> {
  const s = await sessioneCorrente();
  if (!s || s.utente.ruolo !== 'admin') redirect('/accedi?dopo=/admin');
  return s;
}

export interface EsitoAzione { ok?: string; errore?: string; campi?: Record<string, string> }

const t = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (v: string) => (v === '' ? null : Number(v.replace(',', '.').replace(/[^\d.]/g, '')));

// Su Vercel il corpo di una richiesta non supera ~4,5 MB: il modulo riduce la foto prima dell'invio (form-serata).
const MAX_LOCANDINA = 4 * 1024 * 1024;

async function salvaLocandina(file: File | null, cosa = 'La locandina'): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${cosa} deve essere JPG, PNG o WebP`);
  if (file.size > MAX_LOCANDINA) throw new Error(`${cosa} è troppo pesante (massimo 4 MB)`);
  const est = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const nome = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${est}`;
  return salvaMedia(nome, Buffer.from(await file.arrayBuffer()), file.type);
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
  // Il prezzo di prevendita si scrive solo alla nascita (è il prezzo del primo tipo): poi si decide nei tipi.
  const prezzo = num(t(f, 'prezzoLista'));
  const eta = num(t(f, 'etaMinima')) ?? 18;
  // Fino a che ora la prevendita vale per entrare (ora di Roma, hh:mm): vuoto = il default (01:00).
  const limite = t(f, 'prevenditaFinoAlle') || LIMITE_PREVENDITA_DEFAULT;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(limite)) campi.prevenditaFinoAlle = 'Orario hh:mm';
  // Capienza del locale: facoltativa, un numero intero di persone.
  const capienzaScritta = t(f, 'capienza');
  const capienza = capienzaScritta === '' ? null : Number(capienzaScritta);
  if (capienza != null && (!Number.isInteger(capienza) || capienza < 1 || capienza > 100000)) campi.capienza = 'Scrivi un numero di persone';
  if (!id && tipo !== 'libero' && (prezzo == null || Number.isNaN(prezzo) || prezzo < 0)) campi.prezzoLista = 'Scrivi il prezzo del primo tipo';
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
    prezzoLista: tipo === 'libero' ? 0 : prezzo ?? 0, etaMinima: eta,
    // Salvato come istante: la prima volta che a Roma l'orologio segna quell'ora dopo l'apertura porte (01:00 → la notte della serata).
    prevenditaFinoAlle: istanteDopoApertura(data, limite),
    capienza,
    senzaTelefono: f.get('senzaTelefono') === 'on',
    inCopertina: f.get('inCopertina') === 'on',
    // Il primo salvataggio è sempre una bozza: si pubblica dopo, con l'elenco "Cosa manca".
    pubblicato: pubblicatoDopoSalvataggio({ nuova: !id, azione: t(f, 'azione'), eraPubblicata: f.get('pubblicato') === '1' }),
    prAbilitati: tuttiPr ? null : prScelti,
  };
  let salvato;
  try {
    salvato = await salvaEvento(s, id, dati);
  } catch (e) {
    return { errore: (e as Error).message, campi: { slug: (e as Error).message } };
  }
  // Serata nuova nello stesso locale di un'altra: si parte con i suoi tavoli e la sua piantina.
  const copiaDa = t(f, 'copiaTavoliDa');
  if (!id && copiaDa) { try { await copiaTavoli(s, copiaDa, salvato.id); } catch (e) { console.error('[tavoli] copia non riuscita', e); } }
  revalidatePath('/', 'layout');
  redirect(`/admin/eventi/${salvato.id}/modifica?salvato=1`);
}

export async function salvaLottoAzione(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  const eventoId = t(f, 'eventoId');
  const nome = t(f, 'nome');
  const prezzo = num(t(f, 'prezzo'));
  if (!nome) return { errore: 'Dai un nome al tipo (es. "Early bird").' };
  if (prezzo == null || Number.isNaN(prezzo) || prezzo < 0) return { errore: 'Prezzo non valido.' };
  const quantita = num(t(f, 'quantita'));
  const inizio = t(f, 'dataInizio');
  const fine = t(f, 'dataFine');
  const giorni = num(t(f, 'uscitaGiorniPrima'));
  const ore = num(t(f, 'fineOrePrima'));
  const usaGiorni = t(f, 'uscitaModo') === 'giorni' && giorni != null && !Number.isNaN(giorni) && giorni >= 0;
  const usaOre = t(f, 'fineModo') === 'ore' && ore != null && !Number.isNaN(ore) && ore >= 0;
  const abilitati = t(f, 'prModo') === 'alcuni' ? f.getAll('prAbilitati').map(String) : null;
  await salvaLotto(s, {
    id: t(f, 'id') || null, eventoId, nome, prezzo,
    quantita: quantita == null || Number.isNaN(quantita) ? null : Math.round(quantita),
    dataInizio: !usaGiorni && t(f, 'uscitaModo') === 'data' && inizio ? isoRoma(inizio.slice(0, 10), inizio.slice(11, 16) || '00:00') : null,
    dataFine: !usaOre && t(f, 'fineModo') === 'data' && fine ? isoRoma(fine.slice(0, 10), fine.slice(11, 16) || '23:59') : null,
    uscitaGiorniPrima: usaGiorni ? Math.round(giorni!) : null, fineOrePrima: usaOre ? Math.round(ore!) : null,
    categoria: t(f, 'categoria').slice(0, 40) || null, confermaCategoria: Boolean(t(f, 'categoria')) && f.get('confermaCategoria') === 'on',
    dopoPrecedente: f.get('dopoPrecedente') === 'on', prAbilitati: abilitati && abilitati.length ? abilitati : null,
    visibileDaPr: t(f, 'prModo') !== 'nessuno', ordine: Number(t(f, 'ordine') || 0),
  });
  revalidatePath('/', 'layout');
  return { ok: 'Tipo salvato.' };
}

export async function eliminaLottoAzione(id: string) {
  const s = await admin();
  try { await eliminaLotto(s, id); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: 'Tipo eliminato.' };
}

export async function modelloTipiAzione(eventoId: string, modello: NomeModello): Promise<EsitoAzione> {
  const s = await admin();
  try { await applicaModelloTipi(s, eventoId, modello); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: 'Modello applicato: ritocca prezzi, posti e uscite.' };
}

export async function copiaTipiAzione(eventoId: string, daEventoId: string): Promise<EsitoAzione> {
  const s = await admin();
  try {
    const r = await copiaTipi(s, daEventoId, eventoId);
    revalidatePath('/', 'layout');
    return { ok: `${r.copiati} tipi copiati.${r.dateFisse ? ` ${r.dateFisse} hanno una data fissa, spostata come la serata: controllala.` : ''}` };
  } catch (e) { return { errore: (e as Error).message }; }
}

const STATI_TAVOLO: StatoTavolo[] = ['libero', 'riservato', 'confermato', 'non_in_vendita'];

export async function salvaTavoloAzione(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  const nome = t(f, 'nome');
  const spesa = num(t(f, 'spesaMinima')) ?? 0;
  const posti = num(t(f, 'posti'));
  const stato = t(f, 'stato') as StatoTavolo;
  if (!nome) return { errore: 'Dai un nome al tavolo (es. "T4" o "Privé 2").' };
  if (nome.length > 40) return { errore: 'Nome troppo lungo.' };
  if (Number.isNaN(spesa) || spesa < 0) return { errore: 'Spesa minima non valida.' };
  if (posti == null || Number.isNaN(posti) || posti < 1 || posti > 99) return { errore: 'Scrivi i posti del tavolo: un numero da 1 a 99.' };
  try {
    await salvaTavolo(s, {
      id: t(f, 'id') || null, eventoId: t(f, 'eventoId'), nome, zona: t(f, 'zona').slice(0, 40) || null,
      posti: Math.round(posti), spesaMinima: spesa,
      stato: STATI_TAVOLO.includes(stato) ? stato : 'libero', nota: t(f, 'nota').slice(0, 200) || null,
      // A chi è affidato: tutti i PR, nessuno, o solo quelli spuntati.
      visibileDaPr: t(f, 'prChi') !== 'nessuno', prAbilitati: t(f, 'prChi') === 'alcuni' ? f.getAll('prAbilitati').map(String) : null,
      ordine: Number(t(f, 'ordine') || 0),
    });
  } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: 'Tavolo salvato.' };
}

/** "Aggiungi N tavoli": nome di partenza (T1), zona, posti e spesa minima uguali per tutti; i singoli si ritoccano dopo. */
export async function creaTavoliSerieAzione(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  const quanti = num(t(f, 'quanti'));
  const posti = num(t(f, 'posti'));
  const spesa = num(t(f, 'spesaMinima')) ?? 0;
  if (quanti == null || Number.isNaN(quanti)) return { errore: 'Scrivi quanti tavoli vuoi aggiungere.' };
  if (posti == null || Number.isNaN(posti)) return { errore: 'Scrivi i posti di ogni tavolo.' };
  if (Number.isNaN(spesa)) return { errore: 'Spesa minima non valida.' };
  try {
    const nomi = await creaTavoliInSerie(s, {
      eventoId: t(f, 'eventoId'), partenza: t(f, 'partenza'), quanti: Math.round(quanti), zona: t(f, 'zona').slice(0, 40) || null,
      posti: Math.round(posti), spesaMinima: spesa,
    });
    revalidatePath('/', 'layout');
    return { ok: `${nomi.length} ${nomi.length === 1 ? 'tavolo aggiunto' : 'tavoli aggiunti'}: ${nomi.length > 1 ? `${nomi[0]} … ${nomi[nomi.length - 1]}` : nomi[0]}. Ritocca i singoli qui sotto.` };
  } catch (e) { return { errore: (e as Error).message }; }
}

export async function posizionaTavoloAzione(id: string, x: number | null, y: number | null): Promise<EsitoAzione> {
  const s = await admin();
  try { await posizionaTavolo(s, id, x, y); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return {};
}

export async function caricaPiantinaAzione(f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  try {
    const url = await salvaLocandina(f.get('piantina') as File | null, 'La piantina');
    if (!url) return { errore: 'Scegli un’immagine.' };
    await salvaPiantina(s, t(f, 'eventoId'), url);
  } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: 'Piantina caricata.' };
}

export async function togliPiantinaAzione(eventoId: string): Promise<EsitoAzione> {
  const s = await admin();
  try { await salvaPiantina(s, eventoId, null); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: 'Piantina tolta.' };
}

export async function copiaTavoliAzione(eventoId: string, daEventoId: string): Promise<EsitoAzione> {
  const s = await admin();
  let n: number;
  try { n = await copiaTavoli(s, daEventoId, eventoId); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: n === 0 ? 'Niente da copiare: i tavoli ci sono già tutti.' : `${n} ${n === 1 ? 'tavolo copiato' : 'tavoli copiati'}.` };
}

export async function eliminaTavoloAzione(id: string) {
  const s = await admin();
  try { await eliminaTavolo(s, id); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/', 'layout');
  return { ok: 'Tavolo eliminato.' };
}

export async function azioneIscrizione(id: string, azione: 'annulla' | 'rimborsa' | 'ripristina') {
  const s = await admin();
  try {
    if (azione === 'rimborsa') {
      // Prevendita pagata online: prima si restituiscono i soldi su Stripe, poi si chiude. Se il rimborso non va
      // a buon fine l'iscrizione resta com'è. L'ingresso in cassa (contanti o POS) si restituisce a mano.
      const pagamento = await pagamentoIscrizioneDi(s, id);
      if (pagamento) await rimborsa(pagamento);
      if (!(await chiudiRimborsoIscrizione(s, id))) await cambiaStatoIscrizione(s, id, azione);
    } else {
      await cambiaStatoIscrizione(s, id, azione);
    }
  } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/admin', 'layout');
  return { ok: azione === 'rimborsa' ? 'Rimborsato.' : 'Fatto.' };
}

/** Cambio di nominativo dalla scheda delle iscrizioni. `dataNascita`: AAAA-MM-GG (campo data) oppure GG.MM.AAAA. */
export async function cambiaNominativoAzione(id: string, nome: string, cognome: string, dataNascita: string, email = '') {
  const s = await admin();
  const g = dataNascita.trim();
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(g) ?? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(g);
  const iso = !m ? null : g.includes('-') && m[1].length === 4 ? componiData(m[3], m[2], m[1]) : componiData(m[1], m[2], m[3]);
  if (!iso) return { errore: 'Scegli la data di nascita' };
  try { await cambiaNominativo(s, id, { nome, cognome, dataNascita: iso, email }); } catch (e) { return { errore: (e as Error).message }; }
  revalidatePath('/admin', 'layout');
  return { ok: 'Nominativo cambiato.' };
}

/** Duplica serata: chiede solo la nuova data, crea la copia in bozza e porta a modificarla. */
export async function duplicaSerataAzione(_p: EsitoAzione, f: FormData): Promise<EsitoAzione> {
  const s = await admin();
  let nuovoId: string;
  try { nuovoId = (await duplicaSerata(s, t(f, 'id'), t(f, 'giorno'))).id; } catch (e) { return { errore: (e as Error).message, campi: { giorno: (e as Error).message } }; }
  revalidatePath('/', 'layout');
  redirect(`/admin/eventi/${nuovoId}/modifica?copia=1`);
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
