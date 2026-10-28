'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

type Fase = 'riposo' | 'tocco' | 'carico' | 'ok';

/** Sotto questa soglia l'utente vede solo la risposta al tocco; il cerchio compare se l'attesa dura di più (150 ms: oltre il tocco, prima che sembri fermo). */
const SOGLIA_MS = 150;

type Props = {
  /** Con href è un collegamento (Link, o <a> se `esterno`); senza è un <button>. */
  href?: string;
  esterno?: boolean;
  type?: 'submit' | 'button';
  /** Per i pulsanti che inviano un modulo: lo stato di invio lo decide il chiamante. */
  caricamento?: boolean;
  /** Pagamento riuscito: la forma parte da cerchio con la spunta e si riallarga nell'etichetta. */
  esito?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

const riduci = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Pulsante d'azione pubblico: una sola forma che si stringe in cerchio con l'anello che gira (attesa),
 * diventa spunta (esito) e si riallarga. Il clic non viene mai ritardato né bloccato: la navigazione o l'invio
 * partono subito, la forma accompagna. Il pulsante tiene sempre il suo spazio: nessuno spostamento di layout.
 */
export function PulsanteMorph({ href, esterno, type = 'button', caricamento, esito, disabled, className = '', style, children }: Props) {
  const [premuto, setPremuto] = useState(false);
  const [lungo, setLungo] = useState(false);
  const [esitoFase, setEsitoFase] = useState<Fase>(esito ? 'carico' : 'riposo');

  useEffect(() => {
    if (!esito) return;
    // Stato iniziale uguale su server e client; la scelta sul movimento si fa solo dopo il montaggio.
    if (riduci()) { setEsitoFase('riposo'); return; }
    const a = setTimeout(() => setEsitoFase('ok'), 350);
    const b = setTimeout(() => setEsitoFase('riposo'), 900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [esito]);

  // Tornando indietro (cache di navigazione) o se la navigazione non parte, il pulsante torna com'era.
  useEffect(() => {
    if (!premuto) return;
    const t = setTimeout(() => setPremuto(false), 10000);
    const p = (e: PageTransitionEvent) => { if (e.persisted) setPremuto(false); };
    window.addEventListener('pageshow', p);
    return () => { clearTimeout(t); window.removeEventListener('pageshow', p); };
  }, [premuto]);

  const attesa = Boolean(caricamento || premuto);
  useEffect(() => {
    if (!attesa) { setLungo(false); return; }
    const t = setTimeout(() => setLungo(true), SOGLIA_MS);
    return () => clearTimeout(t);
  }, [attesa]);

  const fase: Fase = esito && esitoFase !== 'riposo' ? esitoFase : attesa ? (lungo ? 'carico' : 'tocco') : 'riposo';
  const props = {
    className: `mm-btn mm-btn--primario mm-morph ${className}`.trim(),
    style,
    'data-fase': fase,
    'aria-busy': attesa || undefined,
  };
  const dentro = (
    <>
      <span className="mm-morph__testo">{children}</span>
      <span className="mm-morph__anello" aria-hidden="true" />
      <svg className="mm-morph__spunta" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 7.8" /></svg>
    </>
  );

  // Fuori dal pulsante, così non entra nel suo nome accessibile.
  const annuncio = <span className="sr-only" role="status" aria-live="polite">{attesa ? 'Un attimo, sto caricando' : fase === 'ok' ? 'Fatto' : ''}</span>;

  if (href) {
    const inClick = (e: MouseEvent) => {
      if (e.defaultPrevented || href.startsWith('#') || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      setPremuto(true);
    };
    return (
      <>
        {esterno ? <a href={href} onClick={inClick} {...props}>{dentro}</a> : <Link href={href} onClick={inClick} {...props}>{dentro}</Link>}
        {annuncio}
      </>
    );
  }
  return <><button type={type} disabled={disabled} {...props}>{dentro}</button>{annuncio}</>;
}
