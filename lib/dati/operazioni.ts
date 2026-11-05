import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { MotivoRimborso } from './tipi';

// Le operazioni sulle vendite che il database garantisce da solo (supabase/migrations/20261105…, 20261106…, 20261109…): posti del tipo,
// persona già in lista, pagamento registrato una volta sola, rimborso in due fasi, annulla / ripristina, cambio di nominativo.
// Il codice dell'app le usa SOLO quando l'archivio sta nelle tabelle (produzione, o MM_ARCHIVIO=tabelle): vedi lib/dati/archivio.ts e PIANO-SCHEMA.md.
// Qui sta solo il "telefono" verso le funzioni SQL: le regole di orario, età e permessi restano in TypeScript (lib/regole.ts, lib/dati/*).

/** Chiama una funzione SQL con argomenti con nome (`p_id`, `p_adesso`…) e restituisce il suo risultato. I test ne danno una su PGlite. */
export type Rpc = (nome: string, args: Record<string, unknown>) => Promise<unknown>;

export function rpcSupabase(url: string, chiave: string): Rpc {
  const sb = createClient(url, chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Next non deve mai tenere in cache queste risposte.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return async (nome, args) => {
    const { data, error } = await sb.rpc(nome, args);
    if (error) throw new Error(`Archivio: l'operazione ${nome} non è riuscita (${error.message})`);
    return data;
  };
}

export interface DatiCreaIscrizione {
  id: string; eventoId: string; lottoId: string | null; prId: string | null; nome: string; cognome: string; dataNascita: string; email: string;
  tokenQr: string; codice: string; stato: 'in_attesa' | 'in_lista'; importo: number; categoria: string | null; canale: string; consensoMarketing: boolean;
  scade: string | null; pagamentoOnline: boolean; adesso: string;
}
export type EsitoCreaIscrizione =
  | { esito: 'creata'; id: string }
  | { esito: 'ripresa'; id: string }                // richiesta ancora aperta della stessa persona, con la stessa email
  | { esito: 'sospesa_altra_email' }
  | { esito: 'doppione'; email: string | null }     // ha già un QR valido
  | { esito: 'lotto_pieno' };

export interface DatiConfermaPagamento {
  id: string; pagamento: string; centesimi: number; valuta: string; importoOk: boolean; serataChiusa: boolean; adesso: string;
}
export type EsitoConfermaPagamento =
  | { esito: 'confermata' }
  | { esito: 'gia' }
  | { esito: 'sconosciuta' }
  | { esito: 'da_rimborsare'; motivo: MotivoRimborso; principale: boolean; centesimi: number };

export type EsitoAvviaRimborso =
  | { esito: 'avviato'; chiave: string; centesimi: number; principale: boolean }
  | { esito: 'gia' | 'in_corso' | 'sconosciuto' };

export interface EsitoConcludiRimborso {
  esito: 'chiuso' | 'gia' | 'sconosciuto';
  /** Vero solo la prima volta che il pagamento principale chiude l'ordine: l'email al cliente parte allora. */
  chiusaOrdine?: boolean;
  iscrizioneId?: string | null;
  prenotazioneId?: string | null;
}

export interface DatiPrenotaTavolo {
  id: string; tavoloId: string; prId: string | null; nome: string; cognome: string; email: string; telefono: string; persone: number;
  scade: string; tokenQr: string; codice: string; inseritaDa: 'cliente' | 'pr' | 'crew'; adesso: string;
}
export type EsitoPrenotaTavolo =
  | { esito: 'creata'; id: string }
  | { esito: 'troppe_persone'; posti: number }
  | { esito: 'tavolo_non_disponibile' | 'email_gia' | 'telefono_gia' | 'tavolo_sconosciuto' };

export type EsitoAnnullaPrenotazione = 'annullata' | 'gia_chiusa' | 'pagata' | 'sconosciuta';
export interface EsitoIngressoTavolo { esito: 'entrato' | 'gia_contato' | 'completo' | 'non_pagato' | 'chiusa' | 'sconosciuta'; entrati: number; persone: number }
export interface EsitoSegnaIngresso { esito: 'entrato' | 'gia_entrato' | 'non_valida' | 'sconosciuta'; oraCheckIn: string | null; porta: string | null }
export type EsitoRifiutaIngresso = 'rifiutato' | 'gia_entrato' | 'non_trovata';

export type EsitoCambiaStato = 'annullata' | 'ripristinata' | 'pagata' | 'mai_pagata' | 'doppio' | 'ignorata' | 'non_trovata';
export type EsitoCambiaNominativo = 'cambiato' | 'doppione' | 'non_modificabile' | 'non_trovata';

export interface Operazioni {
  creaIscrizione(d: DatiCreaIscrizione): Promise<EsitoCreaIscrizione>;
  confermaPagamentoIscrizione(d: DatiConfermaPagamento): Promise<EsitoConfermaPagamento>;
  salvaSessioneIscrizione(id: string, sessione: string): Promise<boolean>;
  lasciaPosto(id: string, email: string, adesso: string): Promise<boolean>;
  scadenzeIscrizioni(adesso: string): Promise<number>;
  anonimizzaIscrizioni(dati: { id: string; eta: number | null }[], adesso: string): Promise<number>;
  avviaRimborso(d: { pagamento: string; chiave: string; da: string; adesso: string }): Promise<EsitoAvviaRimborso>;
  rimborsoRespinto(pagamento: string): Promise<boolean>;
  concludiRimborso(d: { pagamento: string; da: string; adesso: string }): Promise<EsitoConcludiRimborso>;
  prenotaTavolo(d: DatiPrenotaTavolo): Promise<EsitoPrenotaTavolo>;
  confermaPagamentoPrenotazione(d: { id: string; pagamento: string; centesimi: number; valuta: string; importoOk: boolean; adesso: string }): Promise<EsitoConfermaPagamento>;
  annullaPrenotazione(id: string, da: string, adesso: string): Promise<EsitoAnnullaPrenotazione>;
  scadenzePrenotazioni(adesso: string): Promise<number>;
  avvisiChiusura(adesso: string): Promise<string[]>;
  promemoriaPrenotazioni(oreMinime: number, adesso: string): Promise<string[]>;
  salvaSessionePrenotazione(id: string, sessione: string): Promise<boolean>;
  ingressoTavolo(d: { id: string; rif: string; ora: string; porta: string; adesso: string }): Promise<EsitoIngressoTavolo>;
  segnaIngresso(d: { id: string; eventoId: string; ora: string; porta: string }): Promise<EsitoSegnaIngresso>;
  rifiutaIngresso(d: { id: string; eventoId: string; ora: string; porta: string; da: string }): Promise<EsitoRifiutaIngresso>;
  creaAccesso(d: { id: string; utenteId: string; tokenHash: string; codiceHash: string; scade: string; adesso: string }): Promise<void>;
  usaAccessoToken(tokenHash: string, adesso: string): Promise<string | null>;
  usaAccessoCodice(utenteId: string, codiceHash: string, adesso: string): Promise<boolean>;
  cambiaStatoIscrizione(id: string, azione: 'annulla' | 'ripristina', adesso: string): Promise<EsitoCambiaStato>;
  cambiaNominativo(d: { id: string; nome: string; cognome: string; dataNascita: string; email: string | null }): Promise<EsitoCambiaNominativo>;
}

/** Le operazioni sopra un "telefono" verso il database. */
export function operazioniDa(rpc: Rpc): Operazioni {
  return {
    async creaIscrizione(d) {
      const r = await rpc('crea_iscrizione', {
        p_id: d.id, p_evento_id: d.eventoId, p_lotto_id: d.lottoId, p_pr_id: d.prId, p_nome: d.nome, p_cognome: d.cognome, p_data_nascita: d.dataNascita,
        p_email: d.email, p_token_qr: d.tokenQr, p_codice: d.codice, p_stato: d.stato, p_importo: d.importo, p_categoria: d.categoria, p_canale: d.canale,
        p_consenso_marketing: d.consensoMarketing, p_scade: d.scade, p_pagamento_online: d.pagamentoOnline, p_adesso: d.adesso,
      }) as { esito: EsitoCreaIscrizione['esito']; id?: string; email?: string | null };
      return r.esito === 'creata' || r.esito === 'ripresa' ? { esito: r.esito, id: r.id! } : r.esito === 'doppione' ? { esito: 'doppione', email: r.email ?? null } : { esito: r.esito } as EsitoCreaIscrizione;
    },
    async confermaPagamentoIscrizione(d) {
      const r = await rpc('conferma_pagamento_iscrizione', {
        p_id: d.id, p_pagamento: d.pagamento, p_centesimi: d.centesimi, p_valuta: d.valuta, p_importo_ok: d.importoOk, p_serata_chiusa: d.serataChiusa, p_adesso: d.adesso,
      }) as { esito: string; motivo?: MotivoRimborso; principale?: boolean; centesimi?: number };
      return (r.esito === 'da_rimborsare'
        ? { esito: 'da_rimborsare', motivo: r.motivo!, principale: Boolean(r.principale), centesimi: r.centesimi ?? d.centesimi }
        : { esito: r.esito }) as EsitoConfermaPagamento;
    },
    async salvaSessioneIscrizione(id, sessione) {
      return Boolean(await rpc('salva_sessione_iscrizione', { p_id: id, p_sessione: sessione }));
    },
    async lasciaPosto(id, email, adesso) {
      return Boolean(await rpc('lascia_posto', { p_id: id, p_email: email, p_adesso: adesso }));
    },
    async scadenzeIscrizioni(adesso) {
      return Number(await rpc('scadenze_iscrizioni', { p_adesso: adesso }));
    },
    async anonimizzaIscrizioni(dati, adesso) {
      return Number(await rpc('anonimizza_iscrizioni', { p_dati: dati, p_adesso: adesso }));
    },
    async avviaRimborso(d) {
      const r = await rpc('avvia_rimborso', { p_pagamento: d.pagamento, p_chiave: d.chiave, p_da: d.da, p_adesso: d.adesso }) as
        { esito: string; chiave?: string; centesimi?: number; principale?: boolean };
      return (r.esito === 'avviato' ? { esito: 'avviato', chiave: r.chiave!, centesimi: r.centesimi!, principale: Boolean(r.principale) } : { esito: r.esito }) as EsitoAvviaRimborso;
    },
    async rimborsoRespinto(pagamento) {
      return Boolean(await rpc('rimborso_respinto', { p_pagamento: pagamento }));
    },
    async concludiRimborso(d) {
      const r = await rpc('concludi_rimborso', { p_pagamento: d.pagamento, p_da: d.da, p_adesso: d.adesso }) as
        { esito: EsitoConcludiRimborso['esito']; chiusa_ordine?: boolean; iscrizione_id?: string | null; prenotazione_id?: string | null };
      return { esito: r.esito, chiusaOrdine: Boolean(r.chiusa_ordine), iscrizioneId: r.iscrizione_id ?? null, prenotazioneId: r.prenotazione_id ?? null };
    },
    async prenotaTavolo(d) {
      const r = await rpc('prenota_tavolo', {
        p_id: d.id, p_tavolo_id: d.tavoloId, p_pr_id: d.prId, p_nome: d.nome, p_cognome: d.cognome, p_email: d.email, p_telefono: d.telefono, p_persone: d.persone,
        p_scade: d.scade, p_token_qr: d.tokenQr, p_codice: d.codice, p_inserita_da: d.inseritaDa, p_adesso: d.adesso,
      }) as { esito: string; id?: string; posti?: number };
      if (r.esito === 'creata') return { esito: 'creata', id: r.id! };
      if (r.esito === 'troppe_persone') return { esito: 'troppe_persone', posti: r.posti! };
      return { esito: r.esito } as EsitoPrenotaTavolo;
    },
    async confermaPagamentoPrenotazione(d) {
      const r = await rpc('conferma_pagamento_prenotazione', {
        p_id: d.id, p_pagamento: d.pagamento, p_centesimi: d.centesimi, p_valuta: d.valuta, p_importo_ok: d.importoOk, p_adesso: d.adesso,
      }) as { esito: string; motivo?: MotivoRimborso; principale?: boolean; centesimi?: number };
      return (r.esito === 'da_rimborsare'
        ? { esito: 'da_rimborsare', motivo: r.motivo!, principale: Boolean(r.principale), centesimi: r.centesimi ?? d.centesimi }
        : { esito: r.esito }) as EsitoConfermaPagamento;
    },
    async annullaPrenotazione(id, da, adesso) {
      return ((await rpc('annulla_prenotazione', { p_id: id, p_da: da, p_adesso: adesso })) as { esito: EsitoAnnullaPrenotazione }).esito;
    },
    async scadenzePrenotazioni(adesso) {
      return Number(await rpc('scadenze_prenotazioni', { p_adesso: adesso }));
    },
    async avvisiChiusura(adesso) {
      return ((await rpc('avvisi_chiusura', { p_adesso: adesso })) as string[] | null) ?? [];
    },
    async promemoriaPrenotazioni(oreMinime, adesso) {
      return ((await rpc('promemoria_prenotazioni', { p_ore_minime: oreMinime, p_adesso: adesso })) as string[] | null) ?? [];
    },
    async salvaSessionePrenotazione(id, sessione) {
      return Boolean(await rpc('salva_sessione_prenotazione', { p_id: id, p_sessione: sessione }));
    },
    async ingressoTavolo(d) {
      return await rpc('ingresso_tavolo', { p_prenotazione_id: d.id, p_rif: d.rif, p_ora: d.ora, p_porta: d.porta, p_adesso: d.adesso }) as EsitoIngressoTavolo;
    },
    async segnaIngresso(d) {
      const r = await rpc('segna_ingresso', { p_id: d.id, p_evento_id: d.eventoId, p_ora: d.ora, p_porta: d.porta }) as { esito: EsitoSegnaIngresso['esito']; ora_check_in?: string | null; porta?: string | null };
      return { esito: r.esito, oraCheckIn: r.ora_check_in ?? null, porta: r.porta ?? null };
    },
    async rifiutaIngresso(d) {
      return ((await rpc('rifiuta_ingresso', { p_id: d.id, p_evento_id: d.eventoId, p_ora: d.ora, p_porta: d.porta, p_da: d.da })) as { esito: EsitoRifiutaIngresso }).esito;
    },
    async creaAccesso(d) {
      await rpc('crea_accesso', { p_id: d.id, p_utente_id: d.utenteId, p_token_hash: d.tokenHash, p_codice_hash: d.codiceHash, p_scade: d.scade, p_adesso: d.adesso });
    },
    async usaAccessoToken(tokenHash, adesso) {
      return ((await rpc('usa_accesso_token', { p_token_hash: tokenHash, p_adesso: adesso })) as string | null) ?? null;
    },
    async usaAccessoCodice(utenteId, codiceHash, adesso) {
      return Boolean(await rpc('usa_accesso_codice', { p_utente_id: utenteId, p_codice_hash: codiceHash, p_adesso: adesso }));
    },
    async cambiaStatoIscrizione(id, azione, adesso) {
      return ((await rpc('cambia_stato_iscrizione', { p_id: id, p_azione: azione, p_adesso: adesso })) as { esito: EsitoCambiaStato }).esito;
    },
    async cambiaNominativo(d) {
      return ((await rpc('cambia_nominativo', { p_id: d.id, p_nome: d.nome, p_cognome: d.cognome, p_data_nascita: d.dataNascita, p_email: d.email })) as { esito: EsitoCambiaNominativo }).esito;
    },
  };
}
