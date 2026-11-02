'use client';

import { useActionState, useState } from 'react';
import { creaPrAzione, type EsitoNuovoPr } from '@/app/azioni/admin';
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
