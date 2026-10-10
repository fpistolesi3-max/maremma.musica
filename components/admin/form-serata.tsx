'use client';

import { useActionState, useRef, useState } from 'react';
import { salvaSerata, type EsitoAzione } from '@/app/azioni/admin';
import { riduciImmagine } from './riduci-immagine';
import { Sezione } from './sezione';

export interface ValoriSerata {
  id: string | null; numero: string; nome: string; slug: string; giorno: string; apertura: string; chiusura: string;
  lineup: string; highlight: string; dressCode: string; descrizione: string;
  location: string; comune: string; lat: string; lng: string; locationSegreta: boolean; infoArrivo: string;
  tipoIngresso: 'libero' | 'lista'; prezzoLista: string; prezzoCassa: string; etaMinima: string;
  locandinaUrl: string; pubblicato: boolean; prAbilitati: string[] | null;
}

/** Nuova serata / modifica (mockup Admin · nuova serata). */
export function FormSerata({ v, pr }: { v: ValoriSerata; pr: { id: string; nome: string; stato: string }[] }) {
  const [stato, invia, inCorso] = useActionState(salvaSerata, {} as EsitoAzione);
  const [tipo, setTipo] = useState(v.tipoIngresso);
  const [tutti, setTutti] = useState(v.prAbilitati === null);
  const [anteprima, setAnteprima] = useState(v.locandinaUrl);
  const c = stato.campi ?? {};
  // Una sezione chiusa con un campo da correggere si riapre da sola.
  const conErrore = (...campi: string[]) => campi.some((k) => c[k]);
  // Il pulsante premuto (bozza / pubblica) viaggia in un campo nascosto: più affidabile del submitter.
  const azione = useRef<HTMLInputElement>(null);

  return (
    <form action={invia} className="grid gap-12 px-4 pb-12 md:px-12 lg:grid-cols-[minmax(0,1fr)_380px]">
      <input type="hidden" name="id" value={v.id ?? ''} />
      <input type="hidden" name="locandinaAttuale" value={v.locandinaUrl} />
      <input type="hidden" name="pubblicato" value={v.pubblicato ? '1' : ''} />
      <input type="hidden" name="tipoIngresso" value={tipo} />
      <input type="hidden" name="prTutti" value={tutti ? '1' : ''} />
      <input type="hidden" name="azione" ref={azione} defaultValue="" />

      <div className="flex flex-col self-start border-b border-linea">
        {stato.errore && <p role="alert" className="m-0 mt-6 border border-stop-testo px-4 py-3 text-[14px] text-stop-testo">{stato.errore}</p>}
        <Sezione n="01" titolo="La serata" aperta={!v.id} forza={conErrore('nome', 'giorno', 'apertura', 'chiusura')}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
            <Campo nome="nome" etichetta="Titolo" v={v.nome} errore={c.nome} />
            <Campo nome="numero" etichetta="Numero" v={v.numero} aiuto="MM/0xx, in automatico" inputMode="numeric" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo nome="giorno" etichetta="Data" tipo="date" v={v.giorno} errore={c.giorno} />
            <Campo nome="apertura" etichetta="Apertura" tipo="time" v={v.apertura} errore={c.apertura} />
            <Campo nome="chiusura" etichetta="Chiusura" tipo="time" v={v.chiusura} errore={c.chiusura} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="highlight" etichetta="In evidenza" v={v.highlight} aiuto="Es. Premio 500 € alla maschera migliore" />
            <Campo nome="dressCode" etichetta="Dress code" v={v.dressCode} />
          </div>
          <Area nome="lineup" etichetta="Line-up" v={v.lineup} aiuto="Un artista per riga · puoi aggiungerla dopo" righe={3} />
          <Area nome="descrizione" etichetta="Descrizione" v={v.descrizione} righe={3} />
        </Sezione>

        <Sezione n="02" titolo="Dove">
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="location" etichetta="Location" v={v.location} aiuto="Nome del posto" />
            <Campo nome="comune" etichetta="Comune" v={v.comune} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo nome="lat" etichetta="Latitudine" v={v.lat} inputMode="decimal" aiuto="Per il link a Maps" />
            <Campo nome="lng" etichetta="Longitudine" v={v.lng} inputMode="decimal" />
          </div>
          <label className="flex items-center gap-[10px] text-[15px]"><input type="checkbox" name="locationSegreta" defaultChecked={v.locationSegreta} className="h-[18px] w-[18px] accent-[var(--arancio)]" />Location segreta: mostra il posto solo 48 ore prima</label>
          <Area nome="infoArrivo" etichetta="Come arrivare" v={v.infoArrivo} aiuto="Parcheggio, navetta" righe={2} />
        </Sezione>

        <Sezione n="03" titolo="Ingresso" forza={conErrore('tipoIngresso', 'prezzoLista', 'prezzoCassa', 'etaMinima')}>
          <div className="flex flex-col gap-2">
            <span className="mm-campo__etichetta" id="tipo-ingresso">Tipo di ingresso</span>
            <div role="radiogroup" aria-labelledby="tipo-ingresso" className="grid border border-linea-forte sm:grid-cols-3">
              {([['libero', 'Libero'], ['lista', 'Lista · paga alla porta']] as const).map(([k, t]) => (
                <button key={k} type="button" role="radio" aria-checked={tipo === k} onClick={() => setTipo(k)}
                  className={`min-h-[52px] border-0 border-r border-linea-forte px-2 text-[13px] font-semibold uppercase tracking-bottone ${tipo === k ? 'bg-osso text-notte' : 'bg-transparent text-osso'}`}>{t}</button>
              ))}
              {/* Opzione C, fase successiva: resta visibile ma spenta */}
              <button type="button" role="radio" aria-checked="false" disabled className="flex min-h-[52px] cursor-not-allowed flex-col items-center justify-center gap-1 border-0 bg-transparent px-2 text-[13px] font-semibold uppercase tracking-bottone text-osso-3">
                Prevendita online<span className="font-mono text-[10px] normal-case tracking-normal">in arrivo</span>
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {tipo === 'lista' && <Campo nome="prezzoLista" etichetta="Prezzo lista (€)" v={v.prezzoLista} inputMode="decimal" errore={c.prezzoLista} aiuto="Il primo lotto nasce con questo prezzo" />}
            {tipo === 'lista' && <Campo nome="prezzoCassa" etichetta="Prezzo in cassa (€)" v={v.prezzoCassa} inputMode="decimal" errore={c.prezzoCassa} aiuto="Chi entra senza lista. Vuoto = come la lista" />}
            <Campo nome="etaMinima" etichetta="Età minima" v={v.etaMinima} inputMode="numeric" errore={c.etaMinima} />
          </div>
        </Sezione>

        <Sezione n="04" titolo="PR">
          <label className="flex items-center gap-[10px] text-[15px]"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--arancio)]" />Tutti i PR attivi</label>
          {!tutti && (
            <div className="grid gap-3 md:grid-cols-2">
              {pr.map((p) => (
                <label key={p.id} className="flex items-center gap-[10px] border border-linea bg-notte-2 px-[14px] py-3 text-[15px]">
                  <input type="checkbox" name="pr" value={p.id} defaultChecked={v.prAbilitati?.includes(p.id)} className="h-[18px] w-[18px] accent-[var(--arancio)]" />
                  {p.nome}{p.stato !== 'attivo' && <span className="font-mono text-[10px] text-osso-3">SOSPESO</span>}
                </label>
              ))}
            </div>
          )}
          <span className="mm-campo__aiuto">Chi arriva dal link di un PR non abilitato finisce nella Lista Maremma Musica.</span>
        </Sezione>
      </div>

      <div className="flex flex-col gap-4 lg:pt-7">
        <span className="mm-campo__etichetta">Locandina</span>
        <label className="flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-4 border border-dashed border-linea-forte bg-vinile p-6 text-center">
          {anteprima
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={anteprima} alt="Anteprima locandina" className="max-h-[420px] w-auto" />
            : <><div className="mm-disco h-[120px] w-[120px]" style={{ boxShadow: 'none' }}><div className="mm-disco__foro" style={{ width: 10, height: 10, background: 'var(--vinile)' }} /></div>
              <span className="font-display text-[28px] font-black uppercase leading-none">Scegli la locandina</span></>}
          <span className="text-[14px] leading-5 text-osso-2">JPG o PNG verticale, almeno 1080 × 1440 px.</span>
          <input type="file" name="locandina" accept="image/jpeg,image/png,image/webp" className="text-[13px] text-osso-2"
            onChange={async (e) => {
              const campo = e.target;
              const scelto = campo.files?.[0];
              if (!scelto) return;
              setAnteprima(URL.createObjectURL(scelto));
              // Foto da telefono: troppo pesanti per l'invio. Si riducono prima (e anche la pagina pesa meno).
              const ridotto = await riduciImmagine(scelto);
              if (ridotto !== scelto) {
                const dt = new DataTransfer();
                dt.items.add(ridotto);
                campo.files = dt.files;
              }
            }} />
        </label>
        {c.locandina && <span className="text-[14px] text-stop-testo">{c.locandina}</span>}
        <Campo nome="slug" etichetta="Indirizzo della pagina" v={v.slug} aiuto="/e/… — vuoto: dal titolo" errore={c.slug} />
        <div className="flex flex-col gap-2 border border-linea bg-notte-2 p-4">
          <span className="text-[11px] font-semibold tracking-etichetta text-osso-2">ANTEPRIMA</span>
          <span className="text-[14px] leading-5">La locandina fa da sfondo sfocato alla prevendita: il modulo resta leggibile sopra qualsiasi colore.</span>
          {v.id && v.slug && <a href={`/e/${v.slug}/prevendita`} target="_blank" className="link-sottolineato self-start py-2">Apri la prevendita →</a>}
        </div>
        <div className="sticky bottom-0 flex gap-2 bg-notte py-3">
          <button type="submit" onClick={() => { azione.current!.value = 'bozza'; }} className="mm-btn mm-btn--linea flex-1" disabled={inCorso}>{v.pubblicato ? 'Metti in bozza' : 'Salva bozza'}</button>
          <button type="submit" onClick={() => { azione.current!.value = 'pubblica'; }} className="mm-btn mm-btn--primario flex-1" disabled={inCorso}>{v.pubblicato ? 'Salva' : 'Pubblica serata'}</button>
        </div>
      </div>
    </form>
  );
}

function Campo({ nome, etichetta, v, tipo = 'text', aiuto, errore, inputMode }: {
  nome: string; etichetta: string; v: string; tipo?: string; aiuto?: string; errore?: string; inputMode?: 'numeric' | 'decimal';
}) {
  const id = `f-${nome}`;
  return (
    <div className={`mm-campo ${errore ? 'mm-campo--errore' : ''}`}>
      <label className="mm-campo__etichetta" htmlFor={id}>{etichetta}</label>
      <input className="mm-campo__input" id={id} name={nome} type={tipo} defaultValue={v} inputMode={inputMode} aria-invalid={Boolean(errore)} aria-describedby={errore || aiuto ? `${id}-a` : undefined} />
      {(errore || aiuto) && <span className="mm-campo__aiuto" id={`${id}-a`}>{errore ?? aiuto}</span>}
    </div>
  );
}

function Area({ nome, etichetta, v, aiuto, righe }: { nome: string; etichetta: string; v: string; aiuto?: string; righe: number }) {
  const id = `f-${nome}`;
  return (
    <div className="mm-campo">
      <label className="mm-campo__etichetta" htmlFor={id}>{etichetta}</label>
      <textarea className="mm-campo__input py-3" style={{ height: 'auto' }} id={id} name={nome} rows={righe} defaultValue={v} aria-describedby={aiuto ? `${id}-a` : undefined} />
      {aiuto && <span className="mm-campo__aiuto" id={`${id}-a`}>{aiuto}</span>}
    </div>
  );
}
