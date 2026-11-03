'use client';

import { useActionState, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { creaPrAzione, inviaLinkSerataAzione, modificaPrAzione, type EsitoLinkSerata, type EsitoModificaPr, type EsitoNuovoPr } from '@/app/azioni/admin';
import { copiaTesto } from '@/components/client';
import { linkWhatsApp } from '@/lib/inviti';
import { Mini } from './azioni-client';

/** Pulsante che apre WhatsApp con l'invito già scritto. */
export function InvitoWhatsApp({ testo, etichetta = 'Manda invito su WhatsApp', primario = false }: { testo: string; etichetta?: string; primario?: boolean }) {
  return (
    <a href={linkWhatsApp(testo)} target="_blank" rel="noopener noreferrer" className={`mm-btn ${primario ? 'mm-btn--primario' : 'mm-btn--linea'}`} style={{ minHeight: 44 }}>
      {etichetta}
    </a>
  );
}

/**
 * "Aggiungi PR": un pulsante che apre il modulo (nome ed email). Dopo l'aggiunta il modulo si chiude e resta l'esito
 * con l'invito su WhatsApp; l'email di benvenuto parte da sola.
 */
export function NuovoPr() {
  const [s, invia, inCorso] = useActionState(creaPrAzione, {} as EsitoNuovoPr);
  const [aperto, setAperto] = useState(false);
  const [esitoChiuso, setEsitoChiuso] = useState<EsitoNuovoPr | null>(null); // l'ultimo esito già messo via
  const esito = s.invito && esitoChiuso !== s ? s : null;
  const chiudiEsito = (riapri: boolean) => { setEsitoChiuso(s); setAperto(riapri); };

  if (esito?.invito) {
    return (
      <div role="status" className="flex w-full flex-col gap-3 border border-ok bg-notte-2 p-4 md:p-5">
        <span className="text-[14px] leading-5 text-ok">✓ {esito.ok}</span>
        {esito.avviso && <span role="alert" className="border border-attesa px-3 py-2 text-[14px] leading-5 text-attesa">{esito.avviso}</span>}
        <div className="flex flex-wrap gap-2">
          <InvitoWhatsApp testo={esito.invito.testo} primario />
          <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} onClick={() => chiudiEsito(true)}>Aggiungi un altro PR</button>
          <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} onClick={() => chiudiEsito(false)}>Chiudi</button>
        </div>
        <span className="text-[13px] leading-5 text-osso-3">Il messaggio è già scritto, con l&apos;indirizzo per entrare e la sua email: «{esito.invito.testo}»</span>
      </div>
    );
  }
  if (!aperto) {
    return <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} onClick={() => setAperto(true)} aria-expanded={false}>+ Aggiungi PR</button>;
  }
  return (
    <div className="flex w-full flex-col gap-4 border border-linea bg-notte-2 p-4 md:p-5">
      <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Aggiungi PR</h2>
      <form action={invia} className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1.2fr]">
          <Mini id="npr-nome" nome="nome" etichetta="Nome" valore={s.valori?.nome} aiuto="Come comparirà nella sua lista" />
          <Mini id="npr-email" nome="email" etichetta="Email" tipo="email" valore={s.valori?.email} aiuto="Con questa entra, senza password" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="mm-btn mm-btn--primario" style={{ minHeight: 44 }} disabled={inCorso}>{inCorso ? 'Un attimo…' : 'Aggiungi PR'}</button>
          <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} onClick={() => setAperto(false)} disabled={inCorso}>Annulla</button>
        </div>
      </form>
      {s.errore && <span role="alert" className="text-[14px] leading-5 text-stop-testo">{s.errore}</span>}
    </div>
  );
}

/** Dati del PR: nome ed email con cui entra. L'handle resta quello, per non rompere i link già girati. */
export function ModificaPr({ prId, nome, email, handle }: { prId: string; nome: string; email: string; handle: string }) {
  const [s, invia, inCorso] = useActionState(modificaPrAzione, {} as EsitoModificaPr);
  const n = s.valori?.nome ?? nome;
  const e = s.valori?.email ?? email;
  return (
    <div className="flex flex-col gap-3">
      <form action={invia} className="flex flex-col gap-3">
        <input type="hidden" name="prId" value={prId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Mini key={`n-${n}`} id="mpr-nome" nome="nome" etichetta="Nome" valore={n} aiuto="Come compare nella sua lista" />
          <Mini key={`e-${e}`} id="mpr-email" nome="email" etichetta="Email" tipo="email" valore={e} aiuto="Con questa entra. Se la cambi, i link di accesso già mandati non valgono più" />
        </div>
        <button type="submit" className="mm-btn mm-btn--primario self-start" style={{ minHeight: 44 }} disabled={inCorso}>{inCorso ? 'Salvo…' : 'Salva dati'}</button>
      </form>
      {s.errore && <span role="alert" className="text-[14px] leading-5 text-stop-testo">{s.errore}</span>}
      {s.ok && !s.errore && <span role="status" className="text-[14px] leading-5 text-ok">✓ {s.ok}</span>}
      <span className="text-[13px] leading-5 text-osso-3">La fine dei suoi link (…/{handle}) non cambia: quelli già girati ai clienti continuano a funzionare.</span>
    </div>
  );
}

const nessunCambio = () => () => {};
/** Il dispositivo sa condividere (menu del telefono)? Sul server e al primo disegno no: il pulsante compare dopo, senza differenze di hydration. */
const puoCondividere = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Il link da dare ai clienti, accorciato, con Copia, WhatsApp e, dove il dispositivo lo sa fare, Condividi. */
export function LinkPr({ url, testoWhatsApp, nomePr }: { url: string; testoWhatsApp?: string; nomePr: string }) {
  const [avviso, setAvviso] = useState<string | null>(null);
  // Sul computer di solito il menu di condivisione non c'è: lì "Condividi" farebbe solo quello che fa già "Copia", quindi non si mostra.
  const condivisione = useSyncExternalStore(nessunCambio, puoCondividere, () => false);
  const breve = url.replace(/^https?:\/\/[^/]+/, '…');
  const mostra = (t: string) => { setAvviso(t); setTimeout(() => setAvviso(null), 1600); };
  const copia = async () => { if (await copiaTesto(url)) mostra('Link copiato'); };
  // "Condividi" apre il menu del telefono (WhatsApp, Telegram, Messaggi…); se fallisce per altro che un annullamento, copia il link.
  const condividi = async () => {
    try { await navigator.share({ text: testoWhatsApp ?? url }); } catch (e) { if ((e as Error).name !== 'AbortError') await copia(); }
  };
  const icona = 'grid h-10 w-10 flex-none place-items-center border border-linea-forte bg-transparent text-osso-2 hover:border-osso hover:text-osso';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 border border-linea p-1.5 pl-3">
        <span className="min-w-0 flex-grow truncate font-mono text-[12px] leading-4 text-osso-2" title={url}>{breve}</span>
        <button type="button" className={icona} aria-label={`Copia il link di ${nomePr}`} title="Copia il link" onClick={() => void copia()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></svg>
        </button>
        {testoWhatsApp && (
          <a href={linkWhatsApp(testoWhatsApp)} target="_blank" rel="noopener noreferrer" className={`${icona} no-underline`} aria-label={`Manda il link a ${nomePr} su WhatsApp`} title="Manda al PR su WhatsApp" style={{ color: '#25D366' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z" /><path d="M9.2 8.6c.2-.5.5-.6.8-.6h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .4-.1.6l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.5c.2-.2.4-.2.6-.1l1.5.6c.3.1.4.3.4.5v.5c0 .3-.1.6-.6.8-.6.3-1.5.4-2.6-.1a8.4 8.4 0 0 1-4.3-4.3c-.5-1.1-.4-2-.2-2.6z" /></svg>
          </a>
        )}
        {condivisione && (
          <button type="button" className={icona} aria-label={`Condividi il link di ${nomePr}`} title="Condividi" onClick={() => void condividi()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></svg>
          </button>
        )}
      </div>
      <span role="status" className="min-h-4 font-mono text-[11px] leading-4 text-ok">{avviso}</span>
    </div>
  );
}

/**
 * "Manda a tutti il link della serata": un'email a ogni PR attivo e abilitato col suo link. Chiede conferma con il numero
 * (più esplicita se un invio c'è già stato) e dopo mostra quante email sono partite e chi non è stato raggiunto.
 */
export function InvioLinkSerata({ eventoId, nomeSerata, destinatari, senzaEmail, ultimo, bloccato }: {
  eventoId: string; nomeSerata: string; destinatari: number; senzaEmail: number; ultimo: string | null; bloccato: string | null;
}) {
  const [inCorso, avvia] = useTransition();
  const [esito, setEsito] = useState<EsitoLinkSerata | null>(null);
  const [aperto, setAperto] = useState(false);
  const inviando = useRef(false); // un secondo clic prima che il pulsante si disattivi non deve mandare le email due volte
  const ultimoVisto = esito?.ultimo ?? ultimo;
  const manda = () => {
    if (inviando.current) return;
    const domanda = ultimoVisto
      ? `Il link di ${nomeSerata} è già stato mandato. ${ultimoVisto}.

Vuoi mandarlo di nuovo a ${destinatari} PR? Riceveranno un'altra email.`
      : `Mando il link di ${nomeSerata} a ${destinatari} PR?`;
    if (!window.confirm(domanda)) return;
    inviando.current = true;
    avvia(async () => {
      try { setEsito(await inviaLinkSerataAzione(eventoId)); } finally { inviando.current = false; }
    });
  };
  const disabilitato = inCorso || Boolean(bloccato) || destinatari === 0;
  if (!aperto) {
    return (
      <button type="button" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }} onClick={() => setAperto(true)} aria-expanded={false}>
        Link della serata ai PR
      </button>
    );
  }
  return (
    <section aria-labelledby="link-serata" className="flex w-full flex-col gap-3 border border-linea bg-notte-2 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 id="link-serata" className="m-0 font-display text-[26px] font-black uppercase leading-none">Link della serata ai PR</h2>
        <button type="button" className="mm-btn mm-btn--muto" style={{ minHeight: 44 }} onClick={() => { setAperto(false); setEsito(null); }} disabled={inCorso}>Chiudi</button>
      </div>
      <span className="text-[14px] leading-5 text-osso-2">
        Manda a ogni PR attivo il suo link personale per <b className="text-osso">{nomeSerata}</b>, con un testo pronto da girare ai clienti.
        {!bloccato && ` L'email arriverebbe a ${destinatari} PR${senzaEmail ? `; ${senzaEmail} non hanno un'email` : ''}.`}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="mm-btn mm-btn--primario" style={{ minHeight: 44 }} disabled={disabilitato} onClick={manda}>
          {inCorso ? 'Invio in corso…' : 'Manda a tutti il link della serata'}
        </button>
        {ultimoVisto && <span className="font-mono text-[12px] leading-4 text-osso-2">{ultimoVisto}</span>}
      </div>
      {bloccato && <span className="text-[14px] leading-5 text-attesa">{bloccato}</span>}
      {!bloccato && destinatari === 0 && <span className="text-[14px] leading-5 text-attesa">Nessun PR attivo con un&apos;email per questa serata.</span>}
      {esito?.errore && <span role="alert" className="text-[14px] leading-5 text-stop-testo">{esito.errore}</span>}
      {esito && !esito.errore && (
        <div role="status" className="flex flex-col gap-2 border border-ok p-3 text-[14px] leading-5">
          <b className="text-ok">Inviate {esito.inviate} email · {esito.nonPartite} non partite</b>
          {(esito.nonRaggiunti?.length ?? 0) > 0 && (
            <>
              <span className="text-osso-2">Non raggiunti:</span>
              <ul className="m-0 pl-5">{esito.nonRaggiunti!.map((n) => <li key={n.nome}>{n.nome}: {n.motivo}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
