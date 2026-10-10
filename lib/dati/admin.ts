import 'server-only';
import { randomUUID } from 'node:crypto';
import { leggi, modifica } from './archivio';
import type { Evento, Iscrizione, Lotto, StatoIscrizione, Tavolo } from './tipi';
import type { Sessione } from '../sessione';
import { calcolaClassifica } from './classifica';
import { eventoPassato, isAttiva, EMAIL_RE, HANDLE_RE } from '../regole';
import { nascita, ora as oraDi, dataCompleta } from '../formato';
import { usatiPerLotto } from './pubblico';

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
  const incassato = [...attive, ...cassa].filter((i) => i.metodoPagamento).reduce((t, i) => t + i.importo, 0);
  const incassatoPorta = [...attive, ...cassa].filter((i) => i.metodoPagamento?.startsWith('porta')).reduce((t, i) => t + i.importo, 0);

  // Ingressi ogni mezz'ora, dall'apertura alla chiusura (o 6 ore).
  const inizio = new Date(evento.data).getTime();
  const fine = evento.dataFine ? new Date(evento.dataFine).getTime() : inizio + 6 * 3_600_000;
  const slot = Math.max(1, Math.ceil((fine - inizio) / 1_800_000));
  const perMezzora = Array.from({ length: slot }, (_, k) => ({ da: new Date(inizio + k * 1_800_000).toISOString(), n: 0 }));
  for (const i of entrati) {
    const k = Math.floor((new Date(i.oraCheckIn!).getTime() - inizio) / 1_800_000);
    perMezzora[Math.min(Math.max(k, 0), slot - 1)].n += 1;
  }

  const nomeLista = (i: Iscrizione) => (i.origine === 'cassa' ? 'Cassa' : (i.prId ? d.pr.find((p) => p.id === i.prId)?.nomeDisplay : null) ?? 'Maremma Musica');
  return {
    evento,
    inLista: attive.length,
    entrati: entrati.length,
    entratiDaLista: entrati.filter((i) => i.origine !== 'cassa').length,
    cassa: { ingressi: cassa.length, incassato: cassa.reduce((t, i) => t + i.importo, 0) },
    incassato,
    incassatoPorta,
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
    .filter((i) => !filtro.stato || (filtro.stato === 'cassa' ? i.origine === 'cassa' : i.stato === filtro.stato))
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
    } else if (azione === 'rimborsa' && (i.metodoPagamento || i.stato === 'pagato' || i.stato === 'entrato')) {
      // Rimborso manuale (niente pagamenti online): i soldi si restituiscono a mano, qui si registra.
      i.stato = 'rimborsato'; i.annullatoAt = adesso;
    } else if (azione === 'ripristina' && (i.stato === 'annullato' || i.stato === 'rimborsato')) {
      const doppio = d.iscrizioni.find((x) => x.id !== i.id && x.eventoId === i.eventoId && isAttiva(x)
        && x.dataNascita === i.dataNascita && x.cognome.toLowerCase() === i.cognome.toLowerCase());
      if (doppio) throw new Error('Esiste già un QR attivo per questa persona');
      const stato: StatoIscrizione = i.oraCheckIn ? 'entrato' : i.metodoPagamento ? 'pagato' : 'in_lista';
      i.stato = stato; i.annullatoAt = null;
    }
  });
}

export type DatiEvento = Omit<Evento, 'id' | 'createdAt' | 'updatedAt' | 'numero'> & { numero?: number | null };

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
    const e: Evento = { ...dati, id: randomUUID(), numero, createdAt: adesso, updatedAt: adesso };
    d.eventi.push(e);
    // Ogni serata a lista nasce con un lotto base: si modifica poi dalla pagina della serata.
    if (e.tipoIngresso !== 'libero') {
      d.lotti.push({ id: randomUUID(), eventoId: e.id, nome: 'Lista', prezzo: e.prezzoLista, quantita: null, dataInizio: null, dataFine: null, visibileDaPr: true, ordine: 0 });
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

export async function salvaTavolo(s: Sessione, tavolo: Omit<Tavolo, 'id'> & { id?: string | null }) {
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
      Object.assign(t, { ...tavolo, id: t.id });
    } else {
      d.tavoli.push({ ...tavolo, id: randomUUID() });
    }
  });
}

export async function eliminaTavolo(s: Sessione, id: string) {
  soloAdmin(s);
  await modifica((d) => {
    d.tavoli = d.tavoli.filter((t) => t.id !== id);
  });
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
  const intestazione = ['Codice', 'Origine', 'Nome', 'Cognome', 'Data di nascita', 'Email', 'Lista', 'Lotto', 'Importo', 'Stato', 'Pagamento', 'Iscritto il', 'Entrato alle', 'Porta', 'Newsletter'];
  const righe = d.iscrizioni
    .filter((i) => i.eventoId === eventoId)
    .sort((a, b) => a.cognome.localeCompare(b.cognome))
    .map((i) => [
      i.codice, i.origine === 'cassa' ? 'cassa' : 'lista', i.nome, i.cognome, nascita(i.dataNascita), i.email,
      i.origine === 'cassa' ? 'Cassa' : (i.prId ? d.pr.find((p) => p.id === i.prId)?.nomeDisplay : null) ?? 'Maremma Musica',
      i.lottoId ? d.lotti.find((l) => l.id === i.lottoId)?.nome : '',
      i.importo.toFixed(2).replace('.', ','), i.stato, i.metodoPagamento ?? '',
      `${dataCompleta(i.createdAt)} ${oraDi(i.createdAt)}`, i.oraCheckIn ? oraDi(i.oraCheckIn) : '', i.porta ?? '',
      i.consensoMarketing ? 'sì' : 'no',
    ].map(cella).join(';'));
  // BOM + punto e virgola: si apre bene nell'Excel italiano.
  return { nome: `${evento.slug}-iscrizioni.csv`, testo: '﻿' + [intestazione.join(';'), ...righe].join('\r\n') };
}
