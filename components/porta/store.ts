'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MetodoPagamento } from '@/lib/dati/tipi';
import type { DatiCassa, EsitoPorta, VocePorta } from '@/lib/porta-logica';

// Stato del telefono della porta, salvato in localStorage: l'elenco resta anche senza campo
// e gli ingressi fatti offline aspettano in coda finché torna la connessione.

export interface Movimento { idLocale: string; voceId: string; chiave: string; metodo: MetodoPagamento; ora: string; cassa?: DatiCassa; conferma?: boolean; rifiuto?: boolean }

interface StatoPorta {
  eventoId: string | null;
  porta: string;
  elenco: VocePorta[];
  salvatoAlle: string | null;     // ultimo elenco scaricato
  cassa: boolean | null;          // la serata ha la cassa alla porta (dall'ultima sincronizzazione); null = non ancora saputo
  coda: Movimento[];
  conflitti: number;              // ingressi offline che un'altra porta aveva già fatto
  online: boolean;
  serveAccesso: boolean;         // sessione scaduta: rientrare con il link
  scegliEvento: (id: string) => void;
  scegliPorta: (p: string) => void;
  applicaLocale: (voce: VocePorta, m: Movimento) => void;
  aggiungiCassa: (voce: VocePorta, m: Movimento) => void;
  sincronizza: () => Promise<{ esiti: { idLocale: string; esito: EsitoPorta }[] } | null>;
  scarica: () => Promise<void>;
}

/** L'elenco del server vince, tranne per le persone con un ingresso ancora in coda sul telefono. */
function unisci(server: VocePorta[], coda: Movimento[], locale: VocePorta[]) {
  const inCoda = new Set(coda.map((m) => m.voceId));
  const loc = new Map(locale.map((v) => [v.id, v]));
  const ids = new Set(server.map((v) => v.id));
  // Gli ingressi in cassa ancora in coda non sono sul server: restano quelli del telefono.
  const soloLocali = locale.filter((v) => inCoda.has(v.id) && !ids.has(v.id));
  return [...server.map((v) => (inCoda.has(v.id) ? loc.get(v.id) ?? v : v)), ...soloLocali];
}

type EsitoSync = { esiti: { idLocale: string; esito: EsitoPorta }[] } | null;
let inVolo: Promise<EsitoSync> | null = null;
let ancora = false;

export const usePorta = create<StatoPorta>()(
  persist(
    (set, get) => ({
      eventoId: null,
      porta: 'P1',
      elenco: [],
      salvatoAlle: null,
      cassa: null,
      coda: [],
      conflitti: 0,
      online: true,
      serveAccesso: false,
      scegliEvento: (id) => { if (get().eventoId !== id) set({ eventoId: id, elenco: [], salvatoAlle: null, cassa: null, coda: [], conflitti: 0 }); },
      scegliPorta: (p) => set({ porta: p }),
      aggiungiCassa: (voce, m) => {
        set((s) => ({ elenco: [...s.elenco, voce], coda: [...s.coda, m] }));
        void get().sincronizza();
      },
      applicaLocale: (voce, m) => {
        set((s) => ({ elenco: s.elenco.map((v) => (v.id === voce.id ? voce : v)), coda: [...s.coda, m] }));
        void get().sincronizza();
      },
      sincronizza: async () => {
        // Una sincronizzazione alla volta: se ne arriva un'altra, riparte subito dopo.
        if (inVolo) { ancora = true; return inVolo; }
        inVolo = (async () => {
          let r = await sincronizzaUnaVolta();
          while (ancora) { ancora = false; r = await sincronizzaUnaVolta(); }
          return r;
        })().finally(() => { inVolo = null; });
        return inVolo;

        async function sincronizzaUnaVolta() {
        const { eventoId, porta, coda } = get();
        if (!eventoId) return null;
        const inviati = coda.slice();
        try {
          const r = await fetch('/api/door', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
            body: JSON.stringify({ eventoId, porta, movimenti: inviati }),
          });
          if (r.status === 401) { set({ serveAccesso: true }); return null; }
          if (!r.ok) throw new Error(String(r.status));
          const dati = (await r.json()) as { esiti: { idLocale: string; esito: EsitoPorta }[]; elenco: VocePorta[]; cassa: boolean; ora: string };
          const conflitti = dati.esiti.filter((e) => e.esito.esito !== 'entrato' && e.esito.esito !== 'rifiutato').length;
          set((s) => {
            const rimasti = s.coda.filter((m) => !inviati.some((x) => x.idLocale === m.idLocale));
            return { coda: rimasti, elenco: unisci(dati.elenco, rimasti, s.elenco), salvatoAlle: dati.ora, cassa: dati.cassa, conflitti: s.conflitti + conflitti, online: true, serveAccesso: false };
          });
          return dati;
        } catch {
          set({ online: false });
          return null;
        }
        }
      },
      scarica: async () => { await get().sincronizza(); },
    }),
    {
      name: 'mm-porta',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ eventoId: s.eventoId, porta: s.porta, elenco: s.elenco, salvatoAlle: s.salvatoAlle, cassa: s.cassa, coda: s.coda, conflitti: s.conflitti }),
    },
  ),
);

export const nuovoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
