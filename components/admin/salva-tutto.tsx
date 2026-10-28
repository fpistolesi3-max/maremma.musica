'use client';

import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { EsitoAzione } from '@/app/azioni/admin';

/**
 * Un solo "Salva" per la pagina della serata. Tipi e tavoli sono moduli a sé (un modulo non ne contiene un altro):
 * ognuno si iscrive qui e la barra "Salva" prima salva quelli cambiati, poi il modulo dei dati.
 */
export interface ModuloSalvabile { modificato: () => boolean; salva: () => Promise<EsitoAzione> }
type Registro = MutableRefObject<Set<ModuloSalvabile>>;

const Contesto = createContext<Registro | null>(null);
export const RegistroSalvataggi = Contesto.Provider;
export const useNuovoRegistro = (): Registro => useRef(new Set<ModuloSalvabile>());

/** Salva in ordine i moduli cambiati. Si ferma al primo errore e lo restituisce (così il modulo dei dati non parte). */
export async function salvaModuli(registro: Registro): Promise<EsitoAzione & { salvati: number }> {
  let salvati = 0;
  for (const m of [...registro.current]) {
    if (!m.modificato()) continue;
    const r = await m.salva();
    if (r.errore) return { errore: r.errore, salvati };
    salvati += 1;
  }
  return { salvati };
}

/**
 * Stato di un modulo che si salva da solo ("Aggiungi") o insieme agli altri (barra "Salva"):
 * tiene traccia delle modifiche e mostra "Salvato ✓" quando è andato a buon fine.
 */
export function useModuloSalvabile(azione: (prev: EsitoAzione, f: FormData) => Promise<EsitoAzione>, cosa: 'tipo' | 'tavolo' | 'serie di tavoli' = 'tipo') {
  const registro = useContext(Contesto);
  const formRef = useRef<HTMLFormElement>(null);
  const [esito, setEsito] = useState<EsitoAzione>({});
  const [modificato, setModificato] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const stato = useRef({ modificato: false, azione });
  stato.current = { modificato, azione };

  const salva = async (): Promise<EsitoAzione> => {
    if (!formRef.current) return {};
    setInCorso(true);
    try {
      const r = await stato.current.azione({}, new FormData(formRef.current));
      setEsito(r);
      if (!r.errore) setModificato(false);
      // Per il Salva in basso: dice quale modulo si è fermato (può essere lontano dalla barra).
      const nome = (formRef.current?.elements.namedItem('nome') as HTMLInputElement | null)?.value.trim();
      return r.errore ? { ...r, errore: `Non salvato (${nome ? `${cosa} «${nome}»` : cosa === 'serie di tavoli' ? cosa : `${cosa} nuovo`}): ${r.errore}` } : r;
    } finally { setInCorso(false); }
  };
  const salvaRef = useRef(salva);
  salvaRef.current = salva;

  useEffect(() => {
    const voce: ModuloSalvabile = { modificato: () => stato.current.modificato, salva: () => salvaRef.current() };
    registro?.current.add(voce);
    return () => { registro?.current.delete(voce); };
  }, [registro]);

  return {
    formRef, esito, modificato, inCorso, salva,
    proprieta: {
      ref: formRef,
      onChange: () => { setModificato(true); setEsito({}); },
      onSubmit: (e: React.FormEvent) => { e.preventDefault(); void salva(); },
    },
  };
}

/** Riga di stato accanto al pulsante: errore, "Modificato" (si salva con il Salva in basso) o "Salvato ✓". */
export function StatoSalvataggio({ esito, modificato, nuovo = false }: { esito: EsitoAzione; modificato: boolean; nuovo?: boolean }) {
  if (esito.errore) return <span role="alert" className="text-[13px] text-stop-testo">{esito.errore}</span>;
  if (modificato) return <span role="status" className="text-[13px] text-attesa">{nuovo ? 'Non ancora aggiunto' : 'Modificato: si salva con «Salva» in basso'}</span>;
  if (esito.ok) return <span role="status" className="text-[13px] text-ok">{nuovo ? `✓ ${esito.ok}` : 'Salvato ✓'}</span>;
  return null;
}
