'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { caricaPiantinaAzione, posizionaTavoloAzione, togliPiantinaAzione, type EsitoAzione } from '@/app/azioni/admin';
import type { StatoTavolo } from '@/lib/dati/tipi';
import { riduciImmagine } from './riduci-immagine';

export interface PuntoTavolo {
  id: string; nome: string; zona: string; posti: number | null; spesaMinima: number; stato: StatoTavolo;
  x: number | null; y: number | null;
}

// Stato sempre con la parola in legenda, mai solo colore.
const STATI: Record<StatoTavolo, { testo: string; classe: string }> = {
  libero: { testo: 'Libero', classe: 'border-ok bg-ok text-su-stato' },
  riservato: { testo: 'In attesa di pagamento', classe: 'border-attesa bg-attesa text-su-stato' },
  confermato: { testo: 'Pagato', classe: 'border-arancio bg-arancio text-su-arancio' },
  non_in_vendita: { testo: 'Non in vendita', classe: 'border-linea-forte bg-notte-3 text-osso-2' },
};

const limita = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));

/**
 * Mappa dei tavoli: sopra la piantina del locale (o su un foglio a quadretti se non c'è) i tavoli si trascinano
 * al loro posto. La posizione è in percentuale, così resta giusta a qualsiasi larghezza di schermo.
 */
export function MappaTavoli({ eventoId, piantinaUrl, tavoli }: { eventoId: string; piantinaUrl: string | null; tavoli: PuntoTavolo[] }) {
  const [punti, setPunti] = useState(tavoli);
  useEffect(() => setPunti(tavoli), [tavoli]);
  const [scelto, setScelto] = useState<string | null>(null);
  const [msg, setMsg] = useState<EsitoAzione>({});
  const [inCorso, avvia] = useTransition();
  const foglio = useRef<HTMLDivElement>(null);
  const trascina = useRef<{ id: string; mosso: boolean; x0: number; y0: number } | null>(null);

  const sposta = (id: string, x: number | null, y: number | null) => {
    setPunti((p) => p.map((t) => (t.id === id ? { ...t, x, y } : t)));
    avvia(async () => {
      const esito = await posizionaTavoloAzione(id, x, y);
      if (esito.errore) setMsg(esito);
    });
  };

  const posizione = (e: React.PointerEvent) => {
    const r = foglio.current!.getBoundingClientRect();
    return { x: limita(((e.clientX - r.left) / r.width) * 100), y: limita(((e.clientY - r.top) / r.height) * 100) };
  };

  const sulla = punti.filter((t) => t.x != null && t.y != null);
  const fuori = punti.filter((t) => t.x == null || t.y == null);
  const sel = punti.find((t) => t.id === scelto) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {msg.errore && <p role="alert" className="m-0 text-[14px] text-stop-testo">{msg.errore}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="mm-btn mm-btn--linea cursor-pointer" style={{ minHeight: 40 }}>
          {piantinaUrl ? 'Cambia piantina' : 'Carica la piantina'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={inCorso}
            onChange={(e) => {
              const campo = e.target;
              const file = campo.files?.[0];
              if (!file) return;
              avvia(async () => {
                const f = new FormData();
                f.set('eventoId', eventoId);
                f.set('piantina', await riduciImmagine(file));
                setMsg(await caricaPiantinaAzione(f));
                campo.value = '';
              });
            }} />
        </label>
        {piantinaUrl && (
          <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 40 }} disabled={inCorso}
            onClick={() => { if (confirm('Togliere la piantina? I tavoli restano dove sono.')) avvia(async () => setMsg(await togliPiantinaAzione(eventoId))); }}>Togli piantina</button>
        )}
        <span className="text-[13px] text-osso-2">{inCorso ? 'Salvo…' : 'Foto o disegno della sala, JPG o PNG. Senza piantina i tavoli si mettono sul foglio a quadretti.'}</span>
      </div>

      <div ref={foglio} className={`relative w-full select-none overflow-hidden border border-linea-forte bg-vinile ${piantinaUrl ? '' : 'aspect-[4/3]'}`}
        style={piantinaUrl ? undefined : { backgroundImage: 'linear-gradient(var(--linea) 1px, transparent 1px), linear-gradient(90deg, var(--linea) 1px, transparent 1px)', backgroundSize: '10% 10%' }}
        onPointerDown={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') setScelto(null); }}>
        {piantinaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={piantinaUrl} alt="Piantina del locale" draggable={false} className="block h-auto w-full opacity-80" />
        )}
        {sulla.map((t) => (
          <button key={t.id} type="button" aria-label={`${t.nome}, ${STATI[t.stato].testo}`} aria-pressed={scelto === t.id}
            className={`absolute flex h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-sm border-2 px-2 font-mono text-[12px] font-semibold leading-none active:cursor-grabbing ${STATI[t.stato].classe} ${scelto === t.id ? 'z-10 outline outline-2 outline-offset-2 outline-osso' : ''}`}
            style={{ left: `${t.x}%`, top: `${t.y}%` }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); trascina.current = { id: t.id, mosso: false, x0: e.clientX, y0: e.clientY }; }}
            onPointerMove={(e) => {
              const tr = trascina.current;
              if (!tr || tr.id !== t.id) return;
              // Un tocco che trema di pochi pixel resta un tocco, non uno spostamento.
              if (!tr.mosso && Math.hypot(e.clientX - tr.x0, e.clientY - tr.y0) < 6) return;
              tr.mosso = true;
              const { x, y } = posizione(e);
              setPunti((p) => p.map((q) => (q.id === t.id ? { ...q, x, y } : q)));
            }}
            onPointerUp={(e) => {
              const tr = trascina.current;
              trascina.current = null;
              if (!tr) return;
              // Trascinato: resta selezionato. Solo toccato: un secondo tocco sullo stesso tavolo chiude il riquadro.
              if (tr.mosso) { const { x, y } = posizione(e); sposta(t.id, x, y); setScelto(t.id); }
              else setScelto((s) => (s === t.id ? null : t.id));
            }}
            onPointerCancel={() => { trascina.current = null; setPunti(tavoli); }}
            onKeyDown={(e) => {
              const passo = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
              if (!passo) return;
              e.preventDefault();
              sposta(t.id, limita(t.x! + passo[0]), limita(t.y! + passo[1]));
            }}>
            {t.nome}
          </button>
        ))}
        {punti.length === 0 && <span className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-osso-2">Aggiungi i tavoli qui sotto: poi li metti al loro posto sulla mappa.</span>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {(Object.keys(STATI) as StatoTavolo[]).map((k) => (
          <span key={k} className="flex items-center gap-2 font-mono text-[11px] text-osso-2">
            <span className={`h-3 w-3 rounded-sm border ${STATI[k].classe}`} aria-hidden="true" />{STATI[k].testo.toUpperCase()}
          </span>
        ))}
      </div>

      {sel && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-linea bg-notte-2 px-4 py-3">
          <span className="font-display text-[22px] font-extrabold uppercase leading-none">{sel.nome}</span>
          <span className="font-mono text-[12px] text-osso-2">
            {[sel.zona, sel.posti != null ? `${sel.posti} posti` : null, `min. ${sel.spesaMinima} €`, STATI[sel.stato].testo].filter(Boolean).join(' · ')}
          </span>
          <span className="flex-grow" />
          <a href={`#t-${sel.id}-nome`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Modifica</a>
          {sel.x != null && <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 36 }} onClick={() => { sposta(sel.id, null, null); setScelto(null); }}>Togli dalla mappa</button>}
        </div>
      )}

      {fuori.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="mm-campo__etichetta">Da mettere sulla mappa · tocca per aggiungerlo, poi trascinalo</span>
          <div className="flex flex-wrap gap-2">
            {fuori.map((t) => (
              // Entrano al centro, un po' sfalsati in base a quanti ce ne sono già: così non finiscono uno sopra l'altro.
              <button key={t.id} type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 40 }}
                onClick={() => { const k = sulla.length; sposta(t.id, limita(50 + ((k % 5) - 2) * 14), limita(40 + (Math.floor(k / 5) % 5) * 10)); setScelto(t.id); }}>+ {t.nome}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
