'use client';

import { useActionState, useState, useTransition } from 'react';
import { creaPrAzione, inviaLinkSerataAzione, type EsitoLinkSerata, type EsitoNuovoPr } from '@/app/azioni/admin';
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

/** "Aggiungi PR": nome ed email. Subito dopo compare il pulsante per l'invito su WhatsApp; l'email di benvenuto parte da sola. */
export function NuovoPr() {
  const [s, invia, inCorso] = useActionState(creaPrAzione, {} as EsitoNuovoPr);
  return (
    <div className="flex flex-col gap-4">
      <form action={invia} className="grid gap-3 md:grid-cols-[1fr_1.2fr_auto] md:items-end">
        <Mini id="npr-nome" nome="nome" etichetta="Nome" valore={s.valori?.nome} aiuto="Come comparirà nella sua lista" />
        <Mini id="npr-email" nome="email" etichetta="Email" tipo="email" valore={s.valori?.email} aiuto="Con questa entra, senza password" />
        <button type="submit" className="mm-btn mm-btn--primario" style={{ minHeight: 44 }} disabled={inCorso}>{inCorso ? 'Un attimo…' : 'Aggiungi PR'}</button>
      </form>
      {s.errore && <span role="alert" className="text-[14px] leading-5 text-stop-testo">{s.errore}</span>}
      {s.invito && (
        <div role="status" className="flex flex-col gap-3 border border-ok p-4">
          <span className="text-[14px] leading-5 text-ok">✓ {s.ok}</span>
          {s.avviso && <span role="alert" className="border border-attesa px-3 py-2 text-[14px] leading-5 text-attesa">{s.avviso}</span>}
          <InvitoWhatsApp testo={s.invito.testo} primario />
          <span className="text-[13px] leading-5 text-osso-3">Il messaggio è già scritto, con l&apos;indirizzo per entrare e la sua email: «{s.invito.testo}»</span>
        </div>
      )}
    </div>
  );
}

/** Il link da dare ai clienti, scritto per intero, con "Copia". */
export function LinkPr({ url }: { url: string }) {
  const [copiato, setCopiato] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-grow break-all font-mono text-[12px] leading-4 text-osso-2">{url}</span>
      <button type="button" className="mm-btn mm-btn--linea flex-none" style={{ minHeight: 44, padding: '0 16px' }} aria-label={`Copia il link ${url}`}
        onClick={async () => { if (await copiaTesto(url)) { setCopiato(true); setTimeout(() => setCopiato(false), 1600); } }}>
        {copiato ? 'Copiato' : 'Copia'}
      </button>
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
  const ultimoVisto = esito?.ultimo ?? ultimo;
  const manda = () => {
    const domanda = ultimoVisto
      ? `Il link di ${nomeSerata} è già stato mandato. ${ultimoVisto}.

Vuoi mandarlo di nuovo a ${destinatari} PR? Riceveranno un'altra email.`
      : `Mando il link di ${nomeSerata} a ${destinatari} PR?`;
    if (!window.confirm(domanda)) return;
    avvia(async () => setEsito(await inviaLinkSerataAzione(eventoId)));
  };
  const disabilitato = inCorso || Boolean(bloccato) || destinatari === 0;
  return (
    <section aria-labelledby="link-serata" className="flex flex-col gap-3 border border-linea bg-notte-2 p-4 md:p-5">
      <h2 id="link-serata" className="m-0 font-display text-[26px] font-black uppercase leading-none">Link della serata ai PR</h2>
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
