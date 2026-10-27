'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  azioneIscrizione, cambiaNominativoAzione, creaPrAzione, creaStaffAzione, rimuoviStaffAzione, statoPrAzione, type EsitoAzione,
} from '@/app/azioni/admin';

/**
 * Pulsanti annulla / rimborsa / ripristina, con conferma. `online`: pagata sul sito, il rimborso passa da Stripe;
 * `daRimborsare`: pagamento arrivato quando non valeva più; `maiPagata`: prevendita chiesta e mai pagata (niente da fare).
 */
export function AzioniIscrizione({ id, stato, pagato, online, daRimborsare, maiPagata, nominativo }: {
  nominativo?: { nome: string; cognome: string; nascita: string } | null; // serate senza telefono: l'admin può cambiare chi entra
  id: string; stato: string; pagato: boolean; online: boolean; daRimborsare: boolean; maiPagata: boolean;
}) {
  const [inCorso, avvia] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const fai = (azione: 'annulla' | 'rimborsa' | 'ripristina', domanda: string) => {
    if (!window.confirm(domanda)) return;
    avvia(async () => { const r = await azioneIscrizione(id, azione); setErrore(r.errore ?? null); });
  };
  const cambiaNome = () => {
    if (!nominativo) return;
    const nome = window.prompt('Nome di chi entra al posto suo', nominativo.nome); if (nome === null) return;
    const cognome = window.prompt('Cognome', nominativo.cognome); if (cognome === null) return;
    const nascita = window.prompt('Data di nascita (GG.MM.AAAA)', nominativo.nascita); if (nascita === null) return;
    avvia(async () => { const r = await cambiaNominativoAzione(id, nome, cognome, nascita); setErrore(r.errore ?? null); });
  };
  const attiva = ['in_lista', 'pagato', 'entrato'].includes(stato);
  const domandaRimborso = online
    ? 'Restituire i soldi? Il rimborso parte subito sulla carta del cliente e il QR smette di funzionare.'
    : 'Segnare come rimborsata? Restituisci i soldi a mano: qui si registra soltanto.';
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {daRimborsare && <button type="button" disabled={inCorso} className="mm-btn mm-btn--linea" style={{ minHeight: 32, fontSize: 12 }} onClick={() => fai('rimborsa', 'Restituire i soldi di questo pagamento arrivato quando non valeva più?')}>Rimborsa</button>}
      {attiva && <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 32, fontSize: 12 }} onClick={() => fai('annulla', online ? 'Annullare senza restituire i soldi? Il QR smette di funzionare. Per restituirli usa Rimborsa.' : 'Annullare questa iscrizione? Il QR smette di funzionare.')}>Annulla</button>}
      {!daRimborsare && (attiva || stato === 'annullato') && pagato && <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 32, fontSize: 12 }} onClick={() => fai('rimborsa', domandaRimborso)}>Rimborsa</button>}
      {stato === 'annullato' && !maiPagata && <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 32, fontSize: 12 }} onClick={() => fai('ripristina', 'Riattivare il QR?')}>Ripristina</button>}
      {nominativo && ['in_lista', 'pagato'].includes(stato) && <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 32, fontSize: 12 }} onClick={cambiaNome}>Cambia nome</button>}
      {errore && <span className="text-[12px] text-stop-testo">{errore}</span>}
    </span>
  );
}

export function NuovoPr() {
  const [s, invia, inCorso] = useActionState(creaPrAzione, {} as EsitoAzione);
  return (
    <form action={invia} className="grid gap-3 border border-linea bg-notte-2 p-4 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
      <Mini id="npr-nome" nome="nome" etichetta="Nome della lista" aiuto="Come lo sceglie il PR" />
      <Mini id="npr-handle" nome="handle" etichetta="Handle" aiuto="Nel link: vuoto = dal nome" />
      <Mini id="npr-email" nome="email" etichetta="Email" tipo="email" aiuto="Per entrare senza password" />
      <button type="submit" className="mm-btn mm-btn--primario" disabled={inCorso}>Aggiungi PR</button>
      {(s.ok || s.errore) && <span role="status" className={`text-[14px] md:col-span-4 ${s.errore ? 'text-stop-testo' : 'text-ok'}`}>{s.errore ?? s.ok}</span>}
    </form>
  );
}

export function StatoPr({ id, attivo }: { id: string; attivo: boolean }) {
  const [inCorso, avvia] = useTransition();
  return (
    <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 32, fontSize: 12 }}
      onClick={() => { if (attivo && !window.confirm('Sospendere il PR? Il suo link smette di attribuire iscrizioni e non può più entrare.')) return; avvia(() => statoPrAzione(id, !attivo)); }}>
      {attivo ? 'Sospendi' : 'Riattiva'}
    </button>
  );
}

export function NuovoStaff() {
  const [s, invia, inCorso] = useActionState(creaStaffAzione, {} as EsitoAzione);
  return (
    <form action={invia} className="grid gap-3 border border-linea bg-notte-2 p-4 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
      <Mini id="ns-email" nome="email" etichetta="Email" tipo="email" />
      <div className="mm-campo">
        <label className="mm-campo__etichetta" htmlFor="ns-ruolo">Ruolo</label>
        <select id="ns-ruolo" name="ruolo" className="mm-campo__input" style={{ height: 44 }}><option value="staff">Staff porta</option><option value="admin">Admin</option></select>
      </div>
      <button type="submit" className="mm-btn mm-btn--primario" disabled={inCorso}>Dai accesso</button>
      {(s.ok || s.errore) && <span role="status" className={`text-[14px] md:col-span-3 ${s.errore ? 'text-stop-testo' : 'text-ok'}`}>{s.errore ?? s.ok}</span>}
    </form>
  );
}

export function RimuoviStaff({ id }: { id: string }) {
  const [inCorso, avvia] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  return (
    <span className="flex items-center justify-end gap-2">
      {errore && <span className="text-[12px] text-stop-testo">{errore}</span>}
      <button type="button" disabled={inCorso} className="mm-btn mm-btn--muto" style={{ minHeight: 32, fontSize: 12 }}
        onClick={() => { if (window.confirm('Togliere l’accesso?')) avvia(async () => { const r = await rimuoviStaffAzione(id); setErrore(r.errore ?? null); }); }}>Togli accesso</button>
    </span>
  );
}

function Mini({ id, nome, etichetta, tipo = 'text', aiuto }: { id: string; nome: string; etichetta: string; tipo?: string; aiuto?: string }) {
  return (
    <div className="mm-campo">
      <label className="mm-campo__etichetta" htmlFor={id}>{etichetta}</label>
      <input className="mm-campo__input" style={{ height: 44, fontSize: 15 }} id={id} name={nome} type={tipo} autoCapitalize="none" aria-describedby={aiuto ? `${id}-a` : undefined} />
      {aiuto && <span className="mm-campo__aiuto" id={`${id}-a`}>{aiuto}</span>}
    </div>
  );
}
