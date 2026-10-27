import 'server-only';
import { randomUUID } from 'node:crypto';
import { leggi, modifica } from './archivio';
import type { Archivio, Evento, Iscrizione, Lotto, StatoIscrizione, Tavolo } from './tipi';
import { tipiDelModello, type NomeModello } from '../tipi-modelli';
import type { Sessione } from '../sessione';
import { calcolaClassifica } from './classifica';
import { eventoPassato, isAttiva, tienePosto, prenotazioneAttiva, prenotazioneScaduta, EMAIL_RE, HANDLE_RE } from '../regole';
import { nascita, ora as oraDi, dataCompleta } from '../formato';
import { usatiPerLotto } from './pubblico';
import { applicaScadenze } from './tavoli';

// Admin: vede e modifica tutto (policy "…_admin" nello schema Supabase).

export function soloAdmin(s: Sessione) {
  if (s.utente.ruolo !== 'admin') throw new Error('non_autorizzato');
}

export async function elencoSerate(s: Sessione) {
  soloAdmin(s);
  const d = await leggi();
  return d.eventi
    .slice()
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((e) => {
      const iscr = d.iscrizioni.filter((i) => i.eventoId === e.id);
      return {
        evento: e,
        inLista: iscr.filter((i) => isAttiva(i) && i.origine !== 'cassa').length,
        entrati: iscr.filter((i) => i.stato === 'entrato').length,
        passata: eventoPassato(e),
      };
    });
}

export async function eventoAdmin(s: Sessione, id: string) {
  soloAdmin(s);
  // Prima le scadenze: altrimenti un tavolo appena decaduto risulterebbe ancora in attesa di pagamento.
  await applicaScadenze();
  const d = await leggi();
  const evento = d.eventi.find((e) => e.id === id);
  if (!evento) return null;
  const lotti = d.lotti.filter((l) => l.eventoId === id).sort((a, b) => a.ordine - b.ordine);
  const tavoli = d.tavoli.filter((t) => t.eventoId === id).sort((a, b) => a.ordine - b.ordine);
  return { evento, lotti, tavoli, usati: usatiPerLotto(d, id), pr: d.pr.slice().sort((a, b) => a.nomeDisplay.localeCompare(b.nomeDisplay)) };
}

export async function tuttiIPr(s: Sessione) {
  soloAdmin(s);
  const d = await leggi();
  return d.pr.slice().sort((a, b) => a.nomeDisplay.localeCompare(b.nomeDisplay)).map((p) => {
    const mie = d.iscrizioni.filter((i) => i.prId === p.id);
    return {
      pr: p,
      email: d.utenti.find((u) => u.prId === p.id)?.email ?? null,
      iscritti: mie.filter(isAttiva).length,
      entrati: mie.filter((i) => i.stato === 'entrato').length,
    };
  });
}

/** Tutto quello che serve durante la serata: aggiornato ogni pochi secondi dalla pagina. */
export async function serataLive(s: Sessione, eventoId: string) {
  soloAdmin(s);
  const d = await leggi();
  const evento = d.eventi.find((e) => e.id === eventoId);
  if (!evento) return null;
  const iscr = d.iscrizioni.filter((i) => i.eventoId === eventoId);
  const cassa = iscr.filter((i) => i.origine === 'cassa' && isAttiva(i));
  const attive = iscr.filter((i) => isAttiva(i) && i.origine !== 'cassa');   // "in lista": senza la cassa
  const entrati = iscr.filter((i) => i.stato === 'entrato');
  // Soldi: la prevendita si incassa online, alla porta solo l'ingresso in cassa (contanti o POS).
  const somma = (xs: Iscrizione[]) => xs.reduce((t, i) => t + i.importo, 0);
  const online = attive.filter((i) => i.metodoPagamento === 'online');
  const daRimborsare = iscr.filter((i) => i.pagamentoOnline?.daRimborsare);
  const incassatoOnline = somma(online);
  const incassatoCassa = somma(cassa);

  // Ingressi ogni mezz'ora, dall'apertura alla chiusura (o 6 ore).
  const inizio = new Date(evento.data).getTime();
  const fine = evento.dataFine ? new Date(evento.dataFine).getTime() : inizio + 6 * 3_600_000;
  const slot = Math.max(1, Math.ceil((fine - inizio) / 1_800_000));
  const perMezzora = Array.from({ length: slot }, (_, k) => ({ da: new Date(inizio + k * 1_800_000).toISOString(), n: 0 }));
  for (const i of entrati) {
    const k = Math.floor((new Date(i.oraCheckIn!).getTime() - inizio) / 1_800_000);
    perMezzora[Math.min(Math.max(k, 0), slot - 1)].n += 1;
  }

  // Tavoli: quelli in attesa di pagamento sono soldi attesi, non incassati. Le prenotazioni col termine passato non contano.
  const tavoliSerata = d.tavoli.filter((t) => t.eventoId === eventoId && t.stato !== 'non_in_vendita');
  const prenotazioni = d.prenotazioni.filter((p) => p.eventoId === eventoId && prenotazioneAttiva(p) && !prenotazioneScaduta(p));
  const pagate = prenotazioni.filter((p) => p.stato === 'confermata');
  const attese = prenotazioni.filter((p) => p.stato === 'in_attesa');
  const sommaTavoli = (ps: typeof prenotazioni) => ps.reduce((t, p) => t + p.spesaMinima, 0);
  const listeTavoli = [...new Set(prenotazioni.map((p) => p.prId))].map((prId) => {
    const sue = prenotazioni.filter((p) => p.prId === prId);
    const suePagate = sue.filter((p) => p.stato === 'confermata');
    return {
      prId, nome: (prId ? d.pr.find((p) => p.id === prId)?.nomeDisplay : null) ?? 'Maremma Musica',
      pagati: suePagate.length, incassato: sommaTavoli(suePagate), inAttesa: sue.length - suePagate.length, atteso: sommaTavoli(sue) - sommaTavoli(suePagate),
    };
  }).sort((a, b) => b.incassato - a.incassato || b.atteso - a.atteso);

  const nomeLista = (i: Iscrizione) => (i.origine === 'cassa' ? 'Cassa' : (i.prId ? d.pr.find((p) => p.id === i.prId)?.nomeDisplay : null) ?? 'Maremma Musica');
  return {
    evento,
    inLista: attive.length,
    entrati: entrati.length,
    entratiDaLista: entrati.filter((i) => i.origine !== 'cassa').length,
    cassa: {
      attiva: evento.cassaAttiva, ingressi: cassa.length, incassato: incassatoCassa,
      contanti: somma(cassa.filter((i) => i.metodoPagamento === 'porta_contanti')), pos: somma(cassa.filter((i) => i.metodoPagamento === 'porta_pos')),
    },
    prevendita: {
      pagate: online.length, incassato: incassatoOnline,
      inAttesa: iscr.filter((i) => tienePosto(i) && i.stato === 'in_attesa').length,
      daRimborsare: { n: daRimborsare.length, importo: somma(daRimborsare) },
    },
    tavoli: {
      totale: tavoliSerata.length,
      liberi: tavoliSerata.filter((t) => t.stato === 'libero').length,
      pagati: pagate.length, incassato: sommaTavoli(pagate), persone: pagate.reduce((t, p) => t + p.persone, 0),
      entrati: pagate.reduce((t, p) => t + p.ingressi.length, 0),
      inAttesa: attese.length, atteso: sommaTavoli(attese),
      perLista: listeTavoli,
    },
    // Per tipo di prevendita: venduti (QR validi), posti, entrati e incasso.
    perTipo: d.lotti.filter((l) => l.eventoId === eventoId).sort((a, b) => a.ordine - b.ordine).map((l) => {
      const sue = attive.filter((i) => i.lottoId === l.id);
      return { id: l.id, nome: l.nome, categoria: l.categoria, posti: l.quantita, venduti: sue.length, entrati: sue.filter((i) => i.stato === 'entrato').length, incassato: somma(sue.filter((i) => i.metodoPagamento === 'online')) };
    }),
    // Chi lo staff ha rifiutato alla porta (categoria non rispettata): l'iscrizione resta valida, l'admin decide se rimborsare.
    rifiuti: iscr.filter((i) => i.rifiutoIngresso).sort((a, b) => b.rifiutoIngresso!.ora.localeCompare(a.rifiutoIngresso!.ora)).map((i) => ({
      id: i.id, nome: `${i.nome} ${i.cognome}`, categoria: i.categoria, entrato: i.stato === 'entrato', ...i.rifiutoIngresso!,
    })),
    incassato: incassatoOnline + incassatoCassa,
    fuori: attive.filter((i) => i.stato !== 'entrato').length,
    perMezzora,
    classifica: calcolaClassifica(d, eventoId, { admin: true }),
    ultimi: entrati
      .slice()
      .sort((a, b) => b.oraCheckIn!.localeCompare(a.oraCheckIn!))
      .slice(0, 8)
      .map((i) => ({ id: i.id, nome: `${i.nome} ${i.cognome}`, lista: nomeLista(i), ora: i.oraCheckIn!, porta: i.porta })),
    porte: d.porte.filter((p) => p.eventoId === eventoId),
    aggiornatoAt: new Date().toISOString(),
  };
}

export async function iscrizioniAdmin(s: Sessione, filtro: { eventoId?: string; q?: string; stato?: string }) {
  soloAdmin(s);
  const d = await leggi();
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = filtro.q ? norm(filtro.q) : '';
  return d.iscrizioni
    .filter((i) => !filtro.eventoId || i.eventoId === filtro.eventoId)
    .filter((i) => !filtro.stato || (filtro.stato === 'cassa' ? i.origine === 'cassa'
      : filtro.stato === 'da_rimborsare' ? Boolean(i.pagamentoOnline?.daRimborsare) : i.stato === filtro.stato))
    .filter((i) => !q || norm(`${i.nome} ${i.cognome} ${i.email} ${i.codice}`).includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => ({
      iscrizione: i,
      evento: d.eventi.find((e) => e.id === i.eventoId)!,
      lista: i.origine === 'cassa' ? 'Cassa' : (i.prId ? d.pr.find((p) => p.id === i.prId)?.nomeDisplay : null) ?? 'Maremma Musica',
    }));
}

export async function cambiaStatoIscrizione(s: Sessione, id: string, azione: 'annulla' | 'rimborsa' | 'ripristina') {
  soloAdmin(s);
  await modifica((d) => {
    const i = d.iscrizioni.find((x) => x.id === id);
    if (!i) throw new Error('Iscrizione non trovata');
    const adesso = new Date().toISOString();
    if (azione === 'annulla' && isAttiva(i)) {
      i.stato = 'annullato'; i.annullatoAt = adesso;
    } else if (azione === 'rimborsa' && i.metodoPagamento && (isAttiva(i) || i.stato === 'annullato')) {
      // Online: i soldi sono già stati restituiti su Stripe (azioneIscrizione). Cassa: si restituiscono a mano, qui si registra.
      i.stato = 'rimborsato'; i.annullatoAt = adesso;
    } else if (azione === 'ripristina' && i.stato === 'annullato') {
      // Una prevendita lasciata senza pagare non torna valida: sarebbe un QR regalato.
      if (i.pagamentoOnline && !i.metodoPagamento) throw new Error('Questa prevendita non è mai stata pagata: non si può riattivare');
      const doppio = d.iscrizioni.find((x) => x.id !== i.id && x.eventoId === i.eventoId && isAttiva(x)
        && x.dataNascita === i.dataNascita && x.cognome.toLowerCase() === i.cognome.toLowerCase());
      if (doppio) throw new Error('Esiste già un QR attivo per questa persona');
      const stato: StatoIscrizione = i.oraCheckIn ? 'entrato' : i.metodoPagamento ? 'pagato' : 'in_lista';
      i.stato = stato; i.annullatoAt = null;
    }
  });
}

export type DatiEvento = Omit<Evento, 'id' | 'createdAt' | 'updatedAt' | 'numero' | 'piantinaUrl'> & { numero?: number | null };

export async function salvaEvento(s: Sessione, id: string | null, dati: DatiEvento): Promise<Evento> {
  soloAdmin(s);
  return modifica((d) => {
    if (d.eventi.some((e) => e.slug === dati.slug && e.id !== id)) throw new Error(`L'indirizzo /e/${dati.slug} è già usato da un'altra serata`);
    const adesso = new Date().toISOString();
    if (id) {
      const e = d.eventi.find((x) => x.id === id);
      if (!e) throw new Error('Serata non trovata');
      Object.assign(e, dati, { numero: dati.numero ?? e.numero, updatedAt: adesso });
      return e;
    }
    const numero = dati.numero ?? Math.max(0, ...d.eventi.map((e) => e.numero ?? 0)) + 1;
    const e: Evento = { ...dati, id: randomUUID(), numero, piantinaUrl: null, createdAt: adesso, updatedAt: adesso };
    d.eventi.push(e);
    // Ogni serata a lista nasce con un lotto base: si modifica poi dalla pagina della serata.
    if (e.tipoIngresso !== 'libero') {
      d.lotti.push({ id: randomUUID(), eventoId: e.id, nome: 'Lista', prezzo: e.prezzoLista, quantita: null, dataInizio: null, dataFine: null, visibileDaPr: true, ordine: 0, categoria: null, confermaCategoria: false, uscitaGiorniPrima: null, fineOrePrima: null, dopoPrecedente: false, prAbilitati: null });
    }
    return e;
  });
}

export async function prossimoNumero(s: Sessione) {
  soloAdmin(s);
  const d = await leggi();
  return Math.max(0, ...d.eventi.map((e) => e.numero ?? 0)) + 1;
}

export async function salvaLotto(s: Sessione, lotto: Omit<Lotto, 'id'> & { id?: string | null }) {
  soloAdmin(s);
  await modifica((d) => {
    if (lotto.id) {
      const l = d.lotti.find((x) => x.id === lotto.id);
      if (!l) throw new Error('Lotto non trovato');
      Object.assign(l, { ...lotto, id: l.id });
    } else {
      d.lotti.push({ ...lotto, id: randomUUID() });
    }
  });
}

export async function eliminaLotto(s: Sessione, id: string) {
  soloAdmin(s);
  await modifica((d) => {
    if (d.iscrizioni.some((i) => i.lottoId === id)) throw new Error('Ci sono iscrizioni su questo lotto: chiudilo con una data di fine invece di eliminarlo');
    d.lotti = d.lotti.filter((l) => l.id !== id);
  });
}

/** La posizione sulla mappa non passa da qui: si cambia solo con posizionaTavolo. */
export async function salvaTavolo(s: Sessione, tavolo: Omit<Tavolo, 'id' | 'x' | 'y'> & { id?: string | null }) {
  soloAdmin(s);
  await modifica((d) => {
    if (!d.eventi.some((e) => e.id === tavolo.eventoId)) throw new Error('Serata non trovata');
    const nome = tavolo.nome.trim().toLowerCase();
    if (d.tavoli.some((x) => x.eventoId === tavolo.eventoId && x.id !== tavolo.id && x.nome.trim().toLowerCase() === nome)) {
      throw new Error(`C'è già un tavolo "${tavolo.nome.trim()}" in questa serata`);
    }
    if (tavolo.id) {
      const t = d.tavoli.find((x) => x.id === tavolo.id);
      if (!t) throw new Error('Tavolo non trovato');
      // Con una prenotazione attiva lo stato del tavolo lo decide lei, non il modulo, e i posti non scendono sotto il gruppo.
      const attiva = d.prenotazioni.find((p) => p.tavoloId === t.id && prenotazioneAttiva(p));
      if (!attiva && (tavolo.stato === 'riservato' || tavolo.stato === 'confermato')) {
        throw new Error('Un tavolo diventa "in attesa" o "pagato" solo con una prenotazione pagata sul sito');
      }
      if (attiva && tavolo.posti != null && tavolo.posti < attiva.persone) {
        throw new Error(`${t.nome} è prenotato per ${attiva.persone} persone: i posti non possono essere meno di ${attiva.persone}`);
      }
      // Un tavolo resta nella sua serata: per un'altra serata si copia.
      Object.assign(t, { ...tavolo, id: t.id, eventoId: t.eventoId, stato: attiva ? t.stato : tavolo.stato });
    } else {
      if (tavolo.stato === 'riservato' || tavolo.stato === 'confermato') throw new Error('Un tavolo nuovo è libero o non in vendita');
      d.tavoli.push({ ...tavolo, id: randomUUID(), x: null, y: null });
    }
  });
}

/** Mette il tavolo sulla mappa (x, y in % della piantina) o lo toglie (null). */
export async function posizionaTavolo(s: Sessione, id: string, x: number | null, y: number | null) {
  soloAdmin(s);
  const limita = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));
  await modifica((d) => {
    const t = d.tavoli.find((q) => q.id === id);
    if (!t) throw new Error('Tavolo non trovato');
    const valida = x != null && y != null && Number.isFinite(x) && Number.isFinite(y);
    t.x = valida ? limita(x) : null;
    t.y = valida ? limita(y) : null;
  });
}

export async function salvaPiantina(s: Sessione, eventoId: string, url: string | null) {
  soloAdmin(s);
  await modifica((d) => {
    const e = d.eventi.find((q) => q.id === eventoId);
    if (!e) throw new Error('Serata non trovata');
    e.piantinaUrl = url;
  });
}

export async function eliminaTavolo(s: Sessione, id: string) {
  soloAdmin(s);
  await modifica((d) => {
    if (d.prenotazioni.some((p) => p.tavoloId === id && prenotazioneAttiva(p))) throw new Error('Questo tavolo ha una prenotazione: annullala prima di eliminarlo');
    // Le prenotazioni chiuse restano nello storico e nel CSV legate al tavolo (come "on delete restrict" nello schema).
    if (d.prenotazioni.some((p) => p.tavoloId === id)) throw new Error('Questo tavolo ha prenotazioni nello storico: invece di eliminarlo mettilo "Non in vendita"');
    d.tavoli = d.tavoli.filter((t) => t.id !== id);
  });
}

/** Serate da cui si possono riprendere i tavoli (tutte quelle che ne hanno, tranne `esclusa`). */
export async function serateConTavoli(s: Sessione, esclusa?: string) {
  soloAdmin(s);
  const d = await leggi();
  return d.eventi
    .filter((e) => e.id !== esclusa && d.tavoli.some((t) => t.eventoId === e.id))
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((e) => ({ id: e.id, etichetta: `${dataCompleta(e.data)} · ${e.nome}${e.location ? ` · ${e.location}` : ''} (${d.tavoli.filter((t) => t.eventoId === e.id).length} tavoli)` }));
}

/**
 * Riprende i tavoli di un'altra serata (stesso locale): nome, zona, posti, spesa minima, PR e posizione.
 * Arrivano liberi e senza nota. Quelli con un nome già presente restano com'erano; la piantina si copia
 * solo se la serata non ne ha una. Restituisce quanti ne ha aggiunti.
 */
export async function copiaTavoli(s: Sessione, daEventoId: string, aEventoId: string): Promise<number> {
  soloAdmin(s);
  if (daEventoId === aEventoId) throw new Error('Scegli un’altra serata');
  return modifica((d) => {
    const da = d.eventi.find((e) => e.id === daEventoId);
    const a = d.eventi.find((e) => e.id === aEventoId);
    if (!da || !a) throw new Error('Serata non trovata');
    const chiave = (nome: string) => nome.trim().toLowerCase();
    const presenti = new Set(d.tavoli.filter((t) => t.eventoId === a.id).map((t) => chiave(t.nome)));
    const base = Math.max(-1, ...d.tavoli.filter((t) => t.eventoId === a.id).map((t) => t.ordine)) + 1;
    const nuovi = d.tavoli
      .filter((t) => t.eventoId === da.id && !presenti.has(chiave(t.nome)))
      .sort((x, y) => x.ordine - y.ordine)
      .map((t, k): Tavolo => ({ ...t, id: randomUUID(), eventoId: a.id, stato: t.stato === 'non_in_vendita' ? 'non_in_vendita' : 'libero', nota: null, ordine: base + k }));
    d.tavoli.push(...nuovi);
    a.piantinaUrl ??= da.piantinaUrl;
    return nuovi.length;
  });
}

export async function csvTavoli(s: Sessione, eventoId: string) {
  soloAdmin(s);
  const d = await leggi();
  const evento = d.eventi.find((e) => e.id === eventoId);
  if (!evento) return null;
  const STATI = { in_attesa: 'in attesa di pagamento', confermata: 'pagata', annullata: 'annullata', rimborsata: 'rimborsata', scaduta: 'scaduta' };
  const intestazione = ['Tavolo', 'Zona', 'Stato', 'Nome', 'Cognome', 'Email', 'Telefono', 'Persone', 'Entrati', 'Spesa minima', 'Lista', 'Inserita da', 'Richiesta il', 'Termine', 'Pagata il', 'Metodo', 'Pagamento segnato da', 'Chiusa il', 'Chiusa da', 'Codice'];
  const quando = (iso: string | null) => (iso ? `${dataCompleta(iso)} ${oraDi(iso)}` : '');
  const righe = d.prenotazioni
    .filter((p) => p.eventoId === eventoId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((p) => {
      const t = d.tavoli.find((x) => x.id === p.tavoloId);
      return [
        t?.nome ?? '', t?.zona ?? '', prenotazioneScaduta(p) ? STATI.scaduta : STATI[p.stato], p.nome, p.cognome, p.email, p.telefono, p.persone, p.ingressi.length,
        p.spesaMinima.toFixed(2).replace('.', ','), (p.prId ? d.pr.find((x) => x.id === p.prId)?.nomeDisplay : null) ?? 'Maremma Musica', p.inseritaDa,
        quando(p.createdAt), quando(p.scade), quando(p.pagatoAt), p.metodoPagamento ?? '', p.pagatoDa ?? '', quando(p.chiusaAt), p.chiusaDa ?? '', p.codice,
      ].map(cella).join(';');
    });
  return { nome: `${evento.slug}-tavoli.csv`, testo: '\ufeff' + [intestazione.join(';'), ...righe].join('\r\n') };
}

export async function creaPr(s: Sessione, input: { nome: string; handle: string; email: string }) {
  soloAdmin(s);
  const handle = input.handle.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  if (!input.nome.trim()) throw new Error('Scrivi il nome della lista');
  if (!HANDLE_RE.test(handle)) throw new Error('Handle: solo lettere minuscole, numeri e trattini');
  if (!EMAIL_RE.test(email)) throw new Error('Email non valida');
  await modifica((d) => {
    if (d.pr.some((p) => p.handle === handle)) throw new Error('Handle già usato da un altro PR');
    if (d.utenti.some((u) => u.email === email)) throw new Error('Email già usata da un altro accesso');
    const pr = { id: randomUUID(), handle, nomeDisplay: input.nome.trim(), stato: 'attivo' as const, createdAt: new Date().toISOString() };
    d.pr.push(pr);
    d.utenti.push({ id: randomUUID(), email, ruolo: 'pr', prId: pr.id, createdAt: pr.createdAt });
  });
}

export async function cambiaStatoPr(s: Sessione, prId: string, attivo: boolean) {
  soloAdmin(s);
  await modifica((d) => {
    const p = d.pr.find((x) => x.id === prId);
    if (p) p.stato = attivo ? 'attivo' : 'sospeso';
  });
}

export async function utentiStaff(s: Sessione) {
  soloAdmin(s);
  const d = await leggi();
  return d.utenti.filter((u) => u.ruolo !== 'pr').sort((a, b) => a.email.localeCompare(b.email));
}

export async function creaStaff(s: Sessione, email: string, ruolo: 'staff' | 'admin') {
  soloAdmin(s);
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new Error('Email non valida');
  await modifica((d) => {
    if (d.utenti.some((u) => u.email === e)) throw new Error('Questa email ha già un accesso');
    d.utenti.push({ id: randomUUID(), email: e, ruolo, prId: null, createdAt: new Date().toISOString() });
  });
}

export async function rimuoviStaff(s: Sessione, utenteId: string) {
  soloAdmin(s);
  if (utenteId === s.utente.id) throw new Error('Non puoi togliere l’accesso a te stesso');
  await modifica((d) => {
    const u = d.utenti.find((x) => x.id === utenteId);
    if (!u || u.ruolo === 'pr') return;
    d.utenti = d.utenti.filter((x) => x.id !== utenteId);
  });
}

function cella(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v);
  // Evita formule quando il CSV si apre in Excel.
  const sicuro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(sicuro) ? `"${sicuro.replace(/"/g, '""')}"` : sicuro;
}

export async function csvEvento(s: Sessione, eventoId: string) {
  soloAdmin(s);
  const d = await leggi();
  const evento = d.eventi.find((e) => e.id === eventoId);
  if (!evento) return null;
  const intestazione = ['Codice', 'Origine', 'Nome', 'Cognome', 'Data di nascita', 'Email', 'Lista', 'Tipo di prevendita', 'Categoria', 'Importo', 'Stato', 'Pagamento', 'Pagato il', 'Da rimborsare', 'Iscritto il', 'Entrato alle', 'Porta', 'Rifiutato alla porta', 'Newsletter'];
  const PAGAMENTO = { online: 'online', porta_contanti: 'porta contanti', porta_pos: 'porta POS' } as const;
  const righe = d.iscrizioni
    .filter((i) => i.eventoId === eventoId)
    .sort((a, b) => a.cognome.localeCompare(b.cognome))
    .map((i) => [
      i.codice, i.origine === 'cassa' ? 'cassa' : 'lista', i.nome, i.cognome, nascita(i.dataNascita), i.email,
      i.origine === 'cassa' ? 'Cassa' : (i.prId ? d.pr.find((p) => p.id === i.prId)?.nomeDisplay : null) ?? 'Maremma Musica',
      i.lottoId ? d.lotti.find((l) => l.id === i.lottoId)?.nome : '', i.categoria ?? '',
      i.importo.toFixed(2).replace('.', ','), i.stato, i.metodoPagamento ? PAGAMENTO[i.metodoPagamento] : '',
      i.pagatoAt ? `${dataCompleta(i.pagatoAt)} ${oraDi(i.pagatoAt)}` : '', i.pagamentoOnline?.daRimborsare ? 'sì' : '',
      `${dataCompleta(i.createdAt)} ${oraDi(i.createdAt)}`, i.oraCheckIn ? oraDi(i.oraCheckIn) : '', i.porta ?? '',
      i.rifiutoIngresso ? `${oraDi(i.rifiutoIngresso.ora)} · ${i.rifiutoIngresso.porta} · ${i.rifiutoIngresso.da}` : '',
      i.consensoMarketing ? 'sì' : 'no',
    ].map(cella).join(';'));
  // BOM + punto e virgola: si apre bene nell'Excel italiano.
  return { nome: `${evento.slug}-iscrizioni.csv`, testo: '﻿' + [intestazione.join(';'), ...righe].join('\r\n') };
}

/** Serate (diverse da questa) che hanno tipi di prevendita da copiare. */
export async function serateConTipi(s: Sessione, escludiId: string) {
  soloAdmin(s);
  const d = await leggi();
  return d.eventi
    .filter((e) => e.id !== escludiId && d.lotti.some((l) => l.eventoId === e.id))
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((e) => ({ id: e.id, etichetta: `${e.nome} · ${e.data.slice(0, 10)}`, quanti: d.lotti.filter((l) => l.eventoId === e.id).length }));
}

/** I tipi esistenti si possono sostituire solo se nessuno ci si è ancora iscritto. */
function sostituibili(d: Archivio, eventoId: string) {
  const ids = new Set(d.lotti.filter((l) => l.eventoId === eventoId).map((l) => l.id));
  if (d.iscrizioni.some((i) => i.lottoId && ids.has(i.lottoId))) {
    throw new Error('Ci sono già iscritti su questa serata: modifica i tipi uno per uno, senza sostituirli tutti');
  }
  d.lotti = d.lotti.filter((l) => l.eventoId !== eventoId);
}

/** Sostituisce i tipi della serata con un modello rapido. */
export async function applicaModelloTipi(s: Sessione, eventoId: string, modello: NomeModello) {
  soloAdmin(s);
  await modifica((d) => {
    const e = d.eventi.find((x) => x.id === eventoId);
    if (!e) throw new Error('Serata non trovata');
    sostituibili(d, eventoId);
    tipiDelModello(modello, e.prezzoLista).forEach((t, ordine) => d.lotti.push({ ...t, id: randomUUID(), eventoId, ordine }));
  });
}

/** Copia i tipi da un'altra serata. Le uscite relative seguono la nuova data; quelle con data fissa vanno controllate. */
export async function copiaTipi(s: Sessione, daEventoId: string, aEventoId: string): Promise<{ copiati: number; dateFisse: number }> {
  soloAdmin(s);
  if (daEventoId === aEventoId) throw new Error('Scegli un’altra serata');
  return modifica((d) => {
    if (!d.eventi.some((e) => e.id === aEventoId) || !d.eventi.some((e) => e.id === daEventoId)) throw new Error('Serata non trovata');
    const da = d.lotti.filter((l) => l.eventoId === daEventoId).sort((a, b) => a.ordine - b.ordine);
    if (da.length === 0) throw new Error('Quella serata non ha tipi di prevendita');
    sostituibili(d, aEventoId);
    da.forEach((l, ordine) => d.lotti.push({ ...l, id: randomUUID(), eventoId: aEventoId, ordine, prAbilitati: null }));
    return { copiati: da.length, dateFisse: da.filter((l) => (l.dataInizio && l.uscitaGiorniPrima == null) || (l.dataFine && l.fineOrePrima == null)).length };
  });
}
