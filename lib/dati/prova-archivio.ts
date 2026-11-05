import { randomUUID } from 'node:crypto';
import { datiIniziali } from './seed';
import type { Archivio, PrenotazioneTavolo, Tavolo } from './tipi';

// Un archivio "ricco" per i test del passaggio alle tabelle: i dati di esempio più quello che il seed non ha (pagamenti in più, rimborsi,
// iscrizioni anonime, prevendite in attesa, "non rientra", accessi, porte, tavoli, prenotazioni, ingressi). Solo per i test.

export const SEGRETO_DI_PROVA = 'segreto-di-prova-che-non-deve-mai-comparire';

function prenotazione(d: Archivio, tavoloId: string, n: number, o: Partial<PrenotazioneTavolo>): PrenotazioneTavolo {
  return {
    id: randomUUID(), tavoloId, eventoId: d.eventi[0].id, prId: null, nome: `Nome${n}`, cognome: `Cognome${n}`, email: `p${n}@esempio.it`, telefono: `+39 333 000000${n}`, persone: 4,
    spesaMinima: 150, stato: 'in_attesa', scade: '2026-10-29T15:00:00.000Z', tokenQr: `MM1.tok${n}`, codice: `COD0000${n}`, inseritaDa: 'cliente',
    consensoPrivacyAt: '2026-10-29T14:00:00.000Z', createdAt: '2026-10-29T14:00:00.000Z', pagatoAt: null, metodoPagamento: null, pagatoDa: null, chiusaAt: null,
    chiusaDa: null, promemoriaAt: null, avvisoChiusuraAt: null, pagamentoOnline: { sessione: `cs_${n}`, pagamento: null, daRimborsare: false }, ingressi: [], ...o,
  };
}

export function archivioRicco(): Archivio {
  const d = datiIniziali(SEGRETO_DI_PROVA, new Date('2026-10-20T10:00:00+02:00'));
  const [prima, seconda] = d.eventi;
  const pr = d.pr[0];
  Object.assign(prima, {
    inCopertina: true, capienza: 800, prevenditaFinoAlle: '2026-11-01T00:00:00.000Z', piantinaUrl: 'https://esempio.test/sala.png',
    lineup: ['A', 'B & C', "D'E"], prAbilitati: [d.pr[0].id, d.pr[1].id], invioLinkPr: { at: '2026-10-25T09:00:00.000Z', inviate: 3, nonPartite: 1 },
    cassaAttiva: true, prezzoCassa: 12, // restano nella riga ma non nelle tabelle
  });
  Object.assign(seconda, { senzaTelefono: true, locationSegreta: true, lat: 43.1512, lng: 10.7713, etaMinima: 21 });
  Object.assign(d.lotti[0], { dataInizio: null, dataFine: null, categoria: 'Donne', confermaCategoria: true, uscitaGiorniPrima: 5, fineOrePrima: 3, dopoPrecedente: true, prAbilitati: [pr.id], automatico: true });
  d.porte.push({ nome: 'P1', eventoId: prima.id, ultimoSync: '2026-10-31T23:10:00.000Z', ingressi: 99 }, { nome: 'P2', eventoId: prima.id, ultimoSync: '2026-10-31T23:20:00+01:00', ingressi: 0 });

  const [a, b, c, e, f, g] = d.iscrizioni;
  Object.assign(a, { pagamentoOnline: { sessione: 'cs_1', pagamento: 'pi_A', daRimborsare: false,
    inPiu: [{ pagamento: 'pi_A2', centesimi: 1000, valuta: 'EUR', motivo: 'secondo_pagamento', at: '2026-10-29T10:00:00.000Z',
      rimborso: { stato: 'fatto', chiave: 'mm-rimborso-1', avviatoAt: '2026-10-29T11:00:00.000Z', fattoAt: '2026-10-29T11:00:05.000Z', da: 'admin@esempio.it' } },
    { pagamento: 'pi_A3', centesimi: 500, valuta: 'eur', motivo: 'importo', at: '2026-10-29T10:30:00.000Z' }] } });
  Object.assign(b, { stato: 'rimborsato', annullatoAt: '2026-10-29T12:00:00.000Z', pagamentoOnline: { sessione: null, pagamento: 'pi_B', daRimborsare: false, motivo: 'lotto_pieno',
    rimborso: { stato: 'fatto', chiave: 'mm-rimborso-2', avviatoAt: '2026-10-29T12:00:00.000Z', fattoAt: '2026-10-29T12:00:03.000Z', da: 'admin@esempio.it' } } });
  Object.assign(c, { pagamentoOnline: { sessione: null, pagamento: 'pi_C', daRimborsare: true, motivo: 'doppione',
    rimborso: { stato: 'in_corso', chiave: 'mm-rimborso-3', avviatoAt: '2026-10-29T13:00:00.000Z', fattoAt: null, da: 'admin@esempio.it' } } });
  Object.assign(e, { nome: '', cognome: '', dataNascita: '', email: '', anonimizzata: true, anonimizzataAt: '2026-10-29T14:00:00.000Z', etaAllaSerata: 23 });
  Object.assign(f, { stato: 'in_attesa', metodoPagamento: null, pagatoAt: null, scade: '2026-10-29T15:00:00.000Z', rifiutoIngresso: { ora: '2026-10-31T23:00:00.000Z', porta: 'P1', da: 'staff@esempio.it' },
    pagamentoOnline: { sessione: 'cs_f', pagamento: null, daRimborsare: false } });
  Object.assign(g, { stato: 'entrato', oraCheckIn: '2026-10-31T23:30:00.000Z', porta: 'P1' });
  d.accessi.push(
    { id: randomUUID(), utenteId: d.utenti[0].id, tokenHash: 'h1', codiceHash: 'c1', scade: '2026-10-29T16:00:00.000Z', usato: false, tentativi: 2 },
    { id: randomUUID(), utenteId: randomUUID(), tokenHash: 'h2', codiceHash: 'c2', scade: '2026-10-29T16:00:00.000Z', usato: true, tentativi: 0 }); // utente sparito

  const tavoli: Tavolo[] = [
    { id: randomUUID(), eventoId: prima.id, nome: 'T1', zona: 'Pista', posti: 6, spesaMinima: 150, stato: 'confermato', nota: 'nota interna', visibileDaPr: true, prAbilitati: [pr.id], ordine: 1, x: 10.5, y: 20 },
    { id: randomUUID(), eventoId: prima.id, nome: 'T2', zona: null, posti: null, spesaMinima: 0, stato: 'libero', nota: null, visibileDaPr: false, prAbilitati: null, ordine: 2, x: null, y: null },
    { id: randomUUID(), eventoId: prima.id, nome: 'T3', zona: 'Privé', posti: 8, spesaMinima: 300.5, stato: 'non_in_vendita', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 3, x: 99.9, y: 0 },
    { id: randomUUID(), eventoId: prima.id, nome: 'T4', zona: null, posti: 4, spesaMinima: 100, stato: 'riservato', nota: null, visibileDaPr: true, prAbilitati: null, ordine: 4, x: null, y: null },
  ];
  const pagata = prenotazione(d, tavoli[0].id, 1, {
    stato: 'confermata', prId: pr.id, pagatoAt: '2026-10-29T14:10:00.000Z', metodoPagamento: 'online', pagatoDa: 'pagamento online', persone: 6,
    pagamentoOnline: { sessione: 'cs_1', pagamento: 'pi_T1', daRimborsare: false, inPiu: [{ pagamento: 'pi_T1b', centesimi: 15000, valuta: 'eur', motivo: 'secondo_pagamento', at: '2026-10-29T14:20:00.000Z' }] },
    ingressi: [{ rif: 'r1', ora: '2026-10-31T23:00:00.000Z', porta: 'P1' }, { rif: 'r2', ora: '2026-10-31T23:05:00+01:00', porta: 'P2' }],
  });
  const rimborsata = prenotazione(d, tavoli[1].id, 2, {
    stato: 'rimborsata', inseritaDa: 'crew', pagatoAt: '2026-10-28T10:00:00.000Z', metodoPagamento: 'online', pagatoDa: 'pagamento online', chiusaAt: '2026-10-28T12:00:00.000Z', chiusaDa: 'admin@esempio.it',
    avvisoChiusuraAt: '2026-10-28T12:00:00.000Z', promemoriaAt: '2026-10-28T09:00:00.000Z',
    pagamentoOnline: { sessione: null, pagamento: 'pi_T2', daRimborsare: false, rimborso: { stato: 'fatto', chiave: 'mm-rimborso-9', avviatoAt: '2026-10-28T12:00:00.000Z', fattoAt: '2026-10-28T12:00:04.000Z', da: 'admin@esempio.it' } },
  });
  const lasciata = prenotazione(d, tavoli[3].id, 3, { stato: 'scaduta', chiusaAt: '2026-10-29T15:00:00.000Z', inseritaDa: 'pr', prId: pr.id });
  const attiva = prenotazione(d, tavoli[3].id, 4, { stato: 'in_attesa', scade: '2099-11-30T15:00:00.000Z' });
  const daRimborsare = prenotazione(d, tavoli[2].id, 5, {
    stato: 'annullata', chiusaAt: '2026-10-29T16:00:00.000Z', chiusaDa: 'p5@esempio.it', pagatoAt: '2026-10-29T16:30:00.000Z', metodoPagamento: 'online',
    pagamentoOnline: { sessione: null, pagamento: 'pi_T5', daRimborsare: true, motivo: 'ordine_chiuso' },
  });
  d.tavoli.push(...tavoli);
  d.prenotazioni.push(pagata, rimborsata, lasciata, attiva, daRimborsare);
  return d;
}

/** Una copia dell'archivio senza i campi che le serate e i tipi salvati prima non avevano. */
export function versioneVecchia(d: Archivio): Archivio {
  const c = structuredClone(d);
  for (const e of c.eventi as unknown as Record<string, unknown>[]) for (const k of ['senzaTelefono', 'inCopertina', 'capienza', 'prevenditaFinoAlle', 'piantinaUrl', 'invioLinkPr', 'prAbilitati', 'highlight']) delete e[k];
  for (const l of c.lotti as unknown as Record<string, unknown>[]) for (const k of ['categoria', 'confermaCategoria', 'uscitaGiorniPrima', 'fineOrePrima', 'dopoPrecedente', 'prAbilitati', 'automatico']) delete l[k];
  return c;
}
