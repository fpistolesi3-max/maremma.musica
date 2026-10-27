import 'server-only';
import { randomUUID } from 'node:crypto';
import { leggi, modifica, segreto } from './archivio';
import type { Archivio, Evento, Iscrizione, Lotto, Pr } from './tipi';
import { creaCodice, creaTokenQr } from '../qr-token';
import { chiaveCognome, eventoPassato, giaIscritto, isAttiva, iscrizioneScaduta, scadenzaPagamentoOnline, statoLista, tienePosto, type StatoLista, etaSufficiente } from '../regole';
import { modoPagamentoOnline } from '../pagamenti';

// Dati per le pagine pubbliche e per la prevendita. Nessuna sessione richiesta:
// qui si espone solo ciò che un visitatore può vedere.

export interface EventoPubblico {
  evento: Evento;
  lotti: Lotto[];
  stato: StatoLista;
}

export function usatiPerLotto(d: Readonly<Archivio>, eventoId: string) {
  const usati: Record<string, number> = {};
  // Contano anche le prevendite in attesa di pagamento, finché sono nel termine: il posto è tenuto per loro.
  for (const i of d.iscrizioni) if (i.eventoId === eventoId && i.lottoId && tienePosto(i)) usati[i.lottoId] = (usati[i.lottoId] ?? 0) + 1;
  return usati;
}

function conStato(d: Readonly<Archivio>, e: Evento, daPr = false, prId: string | null = null): EventoPubblico {
  const lotti = d.lotti.filter((l) => l.eventoId === e.id).sort((a, b) => a.ordine - b.ordine);
  return { evento: e, lotti, stato: statoLista(e, lotti, usatiPerLotto(d, e.id), { daPr, prId }) };
}

export async function eventiPubblici() {
  const d = await leggi();
  const pubblicati = d.eventi.filter((e) => e.pubblicato);
  const prossimi = pubblicati.filter((e) => !eventoPassato(e)).sort((a, b) => a.data.localeCompare(b.data)).map((e) => conStato(d, e));
  const passati = pubblicati.filter((e) => eventoPassato(e)).sort((a, b) => b.data.localeCompare(a.data));
  return { prossimi, passati };
}

export async function eventoPerSlug(slug: string, daPr = false, prId: string | null = null): Promise<EventoPubblico | null> {
  const d = await leggi();
  const e = d.eventi.find((x) => x.slug === slug && x.pubblicato);
  return e ? conStato(d, e, daPr, prId) : null;
}

/** Il PR vale solo se attivo e abilitato per quella serata. */
export async function prValido(handle: string | null | undefined, evento?: Evento): Promise<Pr | null> {
  if (!handle) return null;
  const d = await leggi();
  const pr = d.pr.find((p) => p.handle === handle.toLowerCase() && p.stato === 'attivo');
  if (!pr) return null;
  if (evento?.prAbilitati && !evento.prAbilitati.includes(pr.id)) return null;
  return pr;
}

export { luogoVisibile as locationVisibile } from '../luogo';

/** La prevendita a pagamento si vende solo se il pagamento online è attivo (sul sito vero: con la chiave di Stripe). */
export const prevenditaOnlineAttiva = () => modoPagamentoOnline() !== null;

export type EsitoIscrizione =
  | { ok: true; iscrizione: Iscrizione }
  | { ok: false; campo?: string; errore: string; esistente?: string };

export async function creaIscrizione(input: {
  slug: string; handlePr: string | null; nome: string; cognome: string; dataNascita: string; email: string; marketing: boolean; canale?: string | null; confermaCategoria?: boolean;
}): Promise<EsitoIscrizione> {
  const d0 = await leggi();
  const evento = d0.eventi.find((x) => x.slug === input.slug && x.pubblicato);
  if (!evento) return { ok: false, errore: 'Questa serata non esiste più.' };
  if (!etaSufficiente(input.dataNascita, evento)) {
    return { ok: false, campo: 'nascita', errore: `Serata ${evento.etaMinima}+: con questa data non puoi entrare.` };
  }
  const pr = await prValido(input.handlePr, evento);
  const chiave = await segreto();

  // Controlli e scrittura nello stesso passaggio: due invii simultanei non superano i posti del lotto.
  return modifica((d): EsitoIscrizione => {
    const doppio = giaIscritto(d.iscrizioni, evento.id, input.cognome, input.dataNascita);
    if (doppio) {
      return { ok: false, campo: 'cognome', errore: 'Risulti già in lista per questa serata: un solo QR a persona.', esistente: doppio.email };
    }
    const adesso = new Date();
    // Ci ha già provato e non ha ancora pagato: riprende la stessa iscrizione (e lo stesso posto) invece di farne un'altra.
    const k = chiaveCognome(input.cognome);
    const sospesa = d.iscrizioni.find((i) => i.eventoId === evento.id && i.stato === 'in_attesa' && !iscrizioneScaduta(i, adesso)
      && i.dataNascita === input.dataNascita && chiaveCognome(i.cognome) === k);
    if (sospesa) {
      if (sospesa.email === input.email.trim().toLowerCase()) return { ok: true, iscrizione: sospesa };
      return { ok: false, campo: 'email', errore: 'C’è già una prevendita in attesa di pagamento per te con un’altra email: completala da lì o riprova tra mezz’ora.' };
    }
    const lotti = d.lotti.filter((l) => l.eventoId === evento.id);
    const stato = statoLista(evento, lotti, usatiPerLotto(d, evento.id), { daPr: Boolean(pr), prId: pr?.id });
    if (stato.tipo === 'piena') return { ok: false, errore: 'Lista piena: i posti sono finiti.' };
    if (stato.tipo === 'dal') return { ok: false, errore: 'La lista non è ancora aperta.' };
    if (stato.tipo !== 'aperta' && stato.tipo !== 'libero') return { ok: false, errore: 'La lista per questa serata è chiusa.' };
    if (stato.lotto?.categoria && stato.lotto.confermaCategoria && !input.confermaCategoria) {
      return { ok: false, campo: 'categoria', errore: `Questa prevendita è riservata: ${stato.lotto.categoria}. Conferma di rientrare nella categoria.` };
    }
    const daPagare = stato.prezzo > 0;
    if (daPagare && !prevenditaOnlineAttiva()) return { ok: false, errore: 'La prevendita online apre a breve: riprova nei prossimi giorni.' };

    const id = randomUUID();
    const iscrizione: Iscrizione = {
      id, eventoId: evento.id, lottoId: stato.lotto?.id ?? null, categoria: stato.lotto?.categoria ?? null, prId: pr?.id ?? null,
      nome: input.nome.trim(), cognome: input.cognome.trim(), dataNascita: input.dataNascita,
      email: input.email.trim().toLowerCase(),
      tokenQr: creaTokenQr(chiave, id, evento.id, adesso), codice: creaCodice(chiave, id),
      // A pagamento: il posto è tenuto finché il cliente paga online; gratis: vale subito.
      stato: daPagare ? 'in_attesa' : 'in_lista', metodoPagamento: null, importo: stato.prezzo, pagatoAt: null,
      scade: daPagare ? scadenzaPagamentoOnline(adesso, evento) : null,
      pagamentoOnline: daPagare ? { sessione: null, pagamento: null, daRimborsare: false } : null,
      oraCheckIn: null, porta: null, consensoPrivacyAt: adesso.toISOString(), consensoMarketing: input.marketing,
      annullatoAt: null, createdAt: adesso.toISOString(),
      canale: input.canale || 'diretto', consegnaId: null, origine: 'lista', rifCassa: null,
    };
    d.iscrizioni.push(iscrizione);
    return { ok: true, iscrizione };
  });
}

export interface Biglietto {
  iscrizione: Iscrizione;
  evento: Evento;
  lista: string;
  prHandle: string | null;
}

export function bigliettoDi(d: Readonly<Archivio>, i: Iscrizione): Biglietto | null {
  const evento = d.eventi.find((e) => e.id === i.eventoId);
  if (!evento) return null;
  const pr = i.prId ? d.pr.find((p) => p.id === i.prId) : null;
  return { iscrizione: i, evento, lista: pr?.nomeDisplay ?? 'Maremma Musica', prHandle: pr?.handle ?? null };
}

/** Il biglietto si vede solo con id + email giusti. Il QR la pagina lo mostra solo se l'iscrizione vale (pagata o gratis). */
export async function bigliettoPubblico(id: string, email: string | null | undefined): Promise<Biglietto | null> {
  if (!email) return null;
  const d = await leggi();
  const i = d.iscrizioni.find((x) => x.id === id);
  if (!i || i.email !== email.trim().toLowerCase()) return null;
  return bigliettoDi(d, i);
}

export async function bigliettiPerEmail(email: string): Promise<Biglietto[]> {
  const d = await leggi();
  const e = email.trim().toLowerCase();
  return d.iscrizioni
    .filter((i) => i.email === e && isAttiva(i))
    .map((i) => {
      const evento = d.eventi.find((x) => x.id === i.eventoId)!;
      const pr = i.prId ? d.pr.find((p) => p.id === i.prId) : null;
      return { iscrizione: i, evento, lista: pr?.nomeDisplay ?? 'Maremma Musica', prHandle: pr?.handle ?? null };
    })
    .filter((b) => b.evento && !eventoPassato(b.evento));
}
