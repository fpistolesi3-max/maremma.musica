'use client';

import { QRCodeSVG } from 'qrcode.react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** QR del biglietto: moduli vinile su fondo osso, livello di correzione M. */
export function QrBiglietto({ valore, etichetta, stampa = false }: { valore: string; etichetta: string; stampa?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // "Si stampa" riga per riga una volta sola: il segno in sessionStorage evita il replay a ogni ricarica.
  useEffect(() => {
    const el = ref.current;
    if (!stampa || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const chiave = `mm-stampa-${valore.slice(-12)}`;
    try { if (sessionStorage.getItem(chiave)) return; sessionStorage.setItem(chiave, '1'); } catch { /* si stampa e basta */ }
    const bil = el.closest('.mm-biglietto');
    el.classList.add('mm-stampa');
    bil?.classList.add('mm-biglietto--strappo');
    const fine = setTimeout(() => { el.classList.remove('mm-stampa'); bil?.classList.remove('mm-biglietto--strappo'); }, 2200);
    return () => clearTimeout(fine);
  }, [stampa, valore]);
  return (
    <div ref={ref}>
    <QRCodeSVG value={valore} level="M" marginSize={0} fgColor="#050505" bgColor="#e1d7c9" role="img" aria-label={etichetta}
      style={{ display: 'block', width: '100%', height: 'auto' }} size={320} />
    </div>
  );
}

/** Copia un link. Nel browser di Instagram l'API clipboard a volte manca: si ripiega sulla selezione. */
export async function copiaTesto(testo: string) {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = testo;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, testo.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    return ok;
  }
}

export function CampoLink({ link, mostra, etichetta = 'Copia il link' }: { link: string; mostra?: string; etichetta?: string }) {
  const [copiato, setCopiato] = useState(false);
  const [origine, setOrigine] = useState('');
  useEffect(() => setOrigine(window.location.origin), []);
  const assoluto = link.startsWith('/') ? `${origine}${link}` : link;
  return (
    <div className="flex h-[52px] items-center gap-2 border border-linea-forte bg-vinile pl-[14px] pr-[6px]">
      <span className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] leading-none" suppressHydrationWarning>
        {mostra ?? assoluto.replace(/^https?:\/\//, '')}
      </span>
      <span aria-live="polite" className="font-mono text-[11px] text-ok">{copiato ? 'COPIATO' : ''}</span>
      <button type="button" aria-label={etichetta} onClick={async () => { if (await copiaTesto(assoluto)) { setCopiato(true); setTimeout(() => setCopiato(false), 1800); } }}
        className="grid h-10 w-10 flex-none place-items-center border-0 bg-transparent p-0 text-arancio">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="1" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></svg>
      </button>
    </div>
  );
}

export interface BigliettoRicordato { id: string; email: string; evento: string; data: string; nome: string }
const CHIAVE = 'mm_biglietti';

export function leggiRicordati(): BigliettoRicordato[] {
  try { return JSON.parse(localStorage.getItem(CHIAVE) ?? '[]') as BigliettoRicordato[]; } catch { return []; }
}

/** Ricorda il biglietto su questo telefono, così "Il mio QR" lo ritrova anche senza email. */
export function RicordaBiglietto(b: BigliettoRicordato) {
  useEffect(() => {
    try {
      const altri = leggiRicordati().filter((x) => x.id !== b.id);
      localStorage.setItem(CHIAVE, JSON.stringify([b, ...altri].slice(0, 12)));
    } catch { /* navigazione privata: pazienza */ }
  }, [b]);
  return null;
}

export function BigliettiRicordati() {
  const [lista, setLista] = useState<BigliettoRicordato[] | null>(null);
  useEffect(() => { setLista(leggiRicordati().filter((b) => new Date(b.data).getTime() > Date.now() - 12 * 3_600_000)); }, []);
  if (!lista?.length) return null;
  return (
    <div className="flex flex-col">
      <span className="etichetta pb-3">Su questo telefono</span>
      {lista.map((b) => (
        <a key={b.id} href={`/biglietto/${b.id}?email=${encodeURIComponent(b.email)}`} className="flex items-center justify-between gap-3 border-t border-linea py-4 no-underline last:border-b">
          <span className="flex flex-col gap-1">
            <span className="font-display text-[24px] font-extrabold uppercase leading-none">{b.evento}</span>
            <span className="dato-s text-osso-2">{b.nome}</span>
          </span>
          <span className="font-mono text-[22px] text-arancio" aria-hidden="true">→</span>
        </a>
      ))}
    </div>
  );
}

/**
 * Menu telefono: resta un <details> (si apre anche senza JavaScript), ma si richiude quando si tocca
 * una voce o si cambia pagina. La testata non si ricarica tra una pagina e l'altra, quindi da solo resterebbe aperto.
 */
export function MenuTelefono({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const percorso = usePathname();
  useEffect(() => { if (ref.current) ref.current.open = false; }, [percorso]);
  return (
    <details ref={ref} className={className} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) e.currentTarget.open = false; }}>
      {children}
    </details>
  );
}
