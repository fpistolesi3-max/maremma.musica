'use client';

import Link from 'next/link';
import { useActionState, useRef } from 'react';
import { iscriviti, type StatoModulo } from '@/app/azioni/prevendita';

interface Props {
  slug: string;
  prHandle: string | null;
  totaleEtichetta: string;
  totaleValore: string;
  etaMinima: number;
  aPagamento: boolean;    // false = serata gratis: il QR arriva subito
  soloPrevendita: boolean; // la serata non ha la cassa alla porta
  children: React.ReactNode; // campo Lista, già pronto dal server
}

const INIZIALE: StatoModulo = { errori: {}, valori: {} };

export function ModuloPrevendita({ slug, prHandle, totaleEtichetta, totaleValore, etaMinima, aPagamento, soloPrevendita, children }: Props) {
  const [stato, invia, inCorso] = useActionState(iscriviti, INIZIALE);
  const e = stato.errori;
  const v = stato.valori;
  const mese = useRef<HTMLInputElement>(null);
  const anno = useRef<HTMLInputElement>(null);

  // Giorno → mese → anno: il cursore avanza da solo quando il campo è pieno.
  // Se si incolla (o l'autocompilazione scrive) la data intera, le cifre in più passano ai campi dopo.
  const avanti = (prossimo: React.RefObject<HTMLInputElement | null>, lunghezza: number, dopo?: React.RefObject<HTMLInputElement | null>) =>
    (ev: React.FormEvent<HTMLInputElement>) => {
      const el = ev.currentTarget;
      const cifre = el.value.replace(/\D/g, '');
      el.value = cifre.slice(0, lunghezza);
      const resto = cifre.slice(lunghezza);
      if (resto && prossimo.current) {
        const lung2 = dopo ? 2 : 4;
        prossimo.current.value = resto.slice(0, lung2);
        if (dopo?.current && resto.length > 2) dopo.current.value = resto.slice(2, 6);
        (dopo?.current && resto.length > 2 ? dopo.current : prossimo.current).focus();
      } else if (el.value.length === lunghezza) prossimo.current?.focus();
    };

  return (
    <form action={invia} noValidate className="flex flex-col gap-[22px]">
      <input type="hidden" name="slug" value={slug} />
      {prHandle && <input type="hidden" name="pr" value={prHandle} />}
      {children}

      {e.generale && <p role="alert" className="m-0 border border-stop-testo px-4 py-3 text-[14px] leading-5 text-stop-testo">{e.generale}</p>}

      <div className="mm-campi-2">
        <Campo id="p-nome" nome="nome" etichetta="Nome" errore={e.nome} valore={v.nome} autoComplete="given-name" />
        <Campo id="p-cognome" nome="cognome" etichetta="Cognome" errore={e.cognome} valore={v.cognome} autoComplete="family-name"
          dopo={stato.recupero && <> <Link href={`/biglietto?email=${encodeURIComponent(stato.recupero)}`} className="text-osso underline decoration-arancio underline-offset-[3px]">Recupera il QR</Link></>} />
      </div>

      <fieldset className={`mm-campo m-0 border-0 p-0 ${e.nascita ? 'mm-campo--errore' : ''}`} aria-describedby="p-nascita-aiuto">
        <legend className="mm-campo__etichetta mb-2 p-0">Data di nascita</legend>
        <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-2">
          <input className="mm-campo__input text-center font-mono" name="giorno" inputMode="numeric" autoComplete="bday-day" placeholder="GG" aria-label="Giorno"
            defaultValue={v.giorno} aria-invalid={Boolean(e.nascita)} onInput={avanti(mese, 2, anno)} />
          <input ref={mese} className="mm-campo__input text-center font-mono" name="mese" inputMode="numeric" autoComplete="bday-month" placeholder="MM" aria-label="Mese"
            defaultValue={v.mese} aria-invalid={Boolean(e.nascita)} onInput={avanti(anno, 2)} />
          <input ref={anno} className="mm-campo__input text-center font-mono" name="anno" inputMode="numeric" autoComplete="bday-year" placeholder="AAAA" aria-label="Anno" maxLength={4}
            defaultValue={v.anno} aria-invalid={Boolean(e.nascita)} onInput={(ev) => { ev.currentTarget.value = ev.currentTarget.value.replace(/\D/g, '').slice(0, 4); }} />
        </div>
        <span className="mm-campo__aiuto" id="p-nascita-aiuto">{e.nascita ?? (etaMinima > 0 ? `Serata ${etaMinima}+. Porta un documento.` : 'Porta un documento.')}</span>
      </fieldset>

      <Campo id="p-email" nome="email" etichetta="Email" tipo="email" errore={e.email} valore={v.email} autoComplete="email" placeholder="nome@email.it"
        aiuto="Ti mandiamo lì il QR, così non lo perdi." />

      <div className="flex flex-col gap-[14px]">
        <label className="mm-prevendita__legale" htmlFor="p-privacy">
          <input type="checkbox" id="p-privacy" name="privacy" required defaultChecked={v.privacy === '1'} aria-invalid={Boolean(e.privacy)} aria-describedby={e.privacy ? 'p-privacy-err' : undefined} />
          <span>Ho letto l&apos;<Link href="/privacy" target="_blank">informativa privacy</Link> e i <Link href="/condizioni" target="_blank">termini della lista</Link>.</span>
        </label>
        {e.privacy && <span id="p-privacy-err" className="-mt-2 text-[14px] leading-5 text-stop-testo">{e.privacy}</span>}
        <label className="mm-prevendita__legale" htmlFor="p-news">
          <input type="checkbox" id="p-news" name="marketing" defaultChecked={v.marketing === '1'} />
          <span>Avvisami per email delle prossime serate. Facoltativo.</span>
        </label>
      </div>

      <div className="mm-prevendita__totale mt-1"><span>{totaleEtichetta}</span><strong>{totaleValore}</strong></div>
      <button type="submit" className="mm-btn mm-btn--primario mm-btn--pieno" style={{ minHeight: 56 }} disabled={inCorso}>
        {inCorso ? 'Un attimo…' : <>{aPagamento ? `Paga ${totaleValore}` : 'Mettiti in lista'} <span className="mm-btn__freccia" aria-hidden="true">→</span></>}
      </button>
      <span className="text-center font-mono text-[11px] leading-4 text-osso-2">
        {aPagamento ? 'CARTA · APPLE PAY · GOOGLE PAY · IL QR ARRIVA DOPO IL PAGAMENTO' : 'IL QR ARRIVA SUBITO'}
        {soloPrevendita && <><br />INGRESSO SOLO IN PREVENDITA: ALLA PORTA NON SI PAGA</>}
      </span>
    </form>
  );
}

function Campo(p: {
  id: string; nome: string; etichetta: string; errore?: string; valore?: string; tipo?: string; autoComplete?: string; placeholder?: string; aiuto?: string; dopo?: React.ReactNode;
}) {
  const descr = p.errore || p.aiuto ? `${p.id}-aiuto` : undefined;
  return (
    <div className={`mm-campo ${p.errore ? 'mm-campo--errore' : ''}`}>
      <label className="mm-campo__etichetta" htmlFor={p.id}>{p.etichetta}</label>
      <input className="mm-campo__input" id={p.id} name={p.nome} type={p.tipo ?? 'text'} autoComplete={p.autoComplete} placeholder={p.placeholder}
        defaultValue={p.valore} aria-invalid={Boolean(p.errore)} aria-describedby={descr} autoCapitalize={p.tipo === 'email' ? 'none' : 'words'} />
      {descr && <span className="mm-campo__aiuto" id={descr}>{p.errore ?? p.aiuto}{p.errore && p.dopo}</span>}
    </div>
  );
}
