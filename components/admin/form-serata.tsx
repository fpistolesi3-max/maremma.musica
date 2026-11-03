'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import { salvaSerata, type EsitoAzione } from '@/app/azioni/admin';
import { coordinateDaLinkMaps, type Manca } from '@/lib/regole';
import { riduciImmagine } from './riduci-immagine';
import { RegistroSalvataggi, salvaModuli, useNuovoRegistro } from './salva-tutto';
import { Sezione } from './sezione';

/** Id del modulo dei dati: i campi delle sezioni ci si agganciano con form="…". */
const FORM = 'form-serata';

export interface ValoriSerata {
  id: string | null; numero: string; nome: string; slug: string; giorno: string; apertura: string; chiusura: string;
  lineup: string; highlight: string; dressCode: string; descrizione: string;
  location: string; comune: string; lat: string; lng: string; locationSegreta: boolean; infoArrivo: string;
  /** `prezzoLista` vale solo per la serata nuova: è il prezzo del primo tipo. Poi il prezzo si decide nei tipi di prevendita. */
  tipoIngresso: 'libero' | 'lista'; prezzoLista: string; senzaTelefono: boolean; inCopertina: boolean; etaMinima: string;
  /** "01:00": fino a quando la prevendita vale per entrare (ora di Roma; dopo la mezzanotte = la notte della serata). */
  prevenditaFinoAlle: string;
  /** Numero di persone, vuoto = non indicata. */
  capienza: string;
  locandinaUrl: string; pubblicato: boolean; prAbilitati: string[] | null;
}

/**
 * Nuova serata / modifica (mockup Admin · nuova serata).
 * `tipi` e `tavoli` hanno moduli propri: un modulo non può contenerne un altro, quindi il <form> dei dati è vuoto e
 * tutti i suoi campi ci si agganciano con l'attributo form. Così i moduli dei tipi e dei tavoli stanno al loro posto
 * nelle sezioni. Il «Salva» in basso salva prima quelli cambiati (si iscrivono a `RegistroSalvataggi`) e poi i dati.
 */
export function FormSerata({ v, pr, tipi, tavoli, foto, copiaTavoliDa = [], manca = [], prezzoTesto, notaTipi }: {
  v: ValoriSerata; pr: { id: string; nome: string; stato: string }[];
  /** Solo in modifica: l'elenco dei tipi di prevendita (modulo a sé), nella sezione Ingresso. */
  tipi?: React.ReactNode;
  /** Solo in modifica: la sezione Tavoli (moduli a sé). Nella serata nuova la sezione c'è già, con «Riprendi tavoli da…». */
  tavoli?: React.ReactNode;
  /** Solo in modifica: la sezione Foto (07). Le foto si salvano da sole, fuori dal modulo e dal pulsante Salva. */
  foto?: React.ReactNode;
  /** Solo per la serata nuova: serate da cui riprendere tavoli e piantina al primo salvataggio. */
  copiaTavoliDa?: { id: string; etichetta: string }[];
  /** Cosa manca prima di pubblicare (dai dati salvati). */
  manca?: Manca[];
  /** "da 8 €": il prezzo calcolato dai tipi, per la riga informativa della sezione Ingresso. */
  prezzoTesto?: string;
  /** "3 TIPI · DA 8 €": la riga sotto il titolo della sezione Ingresso. */
  notaTipi?: string;
}) {
  const [stato, invia, inCorso] = useActionState(salvaSerata, {} as EsitoAzione);
  const [tipo, setTipo] = useState(v.tipoIngresso);
  const [senzaTel, setSenzaTel] = useState(v.senzaTelefono);
  const [copertina, setCopertina] = useState(v.inCopertina);
  const [tutti, setTutti] = useState(v.prAbilitati === null);
  const [anteprima, setAnteprima] = useState(v.locandinaUrl);
  const [prezzoPrimo, setPrezzoPrimo] = useState(v.prezzoLista);
  const [linkMaps, setLinkMaps] = useState('');
  const [lat, setLat] = useState(v.lat);
  const [lng, setLng] = useState(v.lng);
  const [chiedi, setChiedi] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroreModuli, setErroreModuli] = useState<string | null>(null);
  const registro = useNuovoRegistro();
  const c = stato.campi ?? {};
  // Una sezione chiusa con un campo da correggere si riapre da sola.
  const conErrore = (...campi: string[]) => campi.some((k) => c[k]);
  // Il pulsante premuto (bozza / pubblica) viaggia in un campo nascosto: più affidabile del submitter.
  const azione = useRef<HTMLInputElement>(null);
  const modulo = useRef<HTMLFormElement>(null);

  const coordinate = coordinateDaLinkMaps(linkMaps);
  const nuova = !v.id;
  // Quello che si vede nel modulo conta più di quello salvato: la locandina scelta.
  const mancaOra = manca.filter((m) => !(m.id === 'locandina' && anteprima));

  /** Salva i tipi e i tavoli cambiati e poi i dati della serata: un solo gesto per tutta la pagina. */
  async function salvaTutto(cosa: 'bozza' | 'pubblica' | '') {
    setErroreModuli(null);
    setChiedi(false);
    setSalvando(true);
    const r = await salvaModuli(registro);
    setSalvando(false);
    if (r.errore) { setErroreModuli(r.errore); return; }
    azione.current!.value = cosa;
    modulo.current!.requestSubmit();
  }
  const occupato = inCorso || salvando;

  /**
   * Con `action={invia}` React 19 svuota i campi non controllati appena l'azione finisce: dopo un errore di validazione
   * il modulo tornava vuoto. Con onSubmit l'azione parte uguale (stesso FormData, locandina compresa) ma il modulo non si tocca.
   */
  function inviaSenzaReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dati = new FormData(e.currentTarget);
    startTransition(() => invia(dati));
  }

  return (
    <RegistroSalvataggi value={registro}>
    <div className="grid gap-x-12 gap-y-8 px-4 pb-28 md:px-12 md:pb-12 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col self-start border-b border-linea">
      {/* Il modulo dei dati è vuoto: i campi stanno nelle sezioni (anche in mezzo ai moduli dei tipi e dei tavoli, che sono moduli a sé) e ci si agganciano con l'attributo form. */}
      <form id={FORM} ref={modulo} onSubmit={inviaSenzaReset} className="hidden">
        <input type="hidden" name="id" value={v.id ?? ''} />
        <input type="hidden" name="locandinaAttuale" value={v.locandinaUrl} />
        <input type="hidden" name="pubblicato" value={v.pubblicato ? '1' : ''} />
        <input type="hidden" name="tipoIngresso" value={tipo} />
        <input type="hidden" name="prTutti" value={tutti ? '1' : ''} />
        <input type="hidden" name="azione" ref={azione} defaultValue="" />
      </form>

        {stato.errore && <p role="alert" className="m-0 mt-6 border border-stop-testo px-4 py-3 text-[14px] text-stop-testo">{stato.errore}</p>}
        <Sezione n="01" titolo="Serata" aperta={nuova} forza={conErrore('nome', 'giorno', 'apertura', 'chiusura', 'slug')}>
          <Campo nome="nome" etichetta="Titolo" v={v.nome} errore={c.nome} />
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
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="numero" etichetta="Numero" v={v.numero} aiuto="MM/0xx: lo dà il sito, cambialo solo se serve" inputMode="numeric" />
            <Campo nome="slug" etichetta="Indirizzo della pagina" v={v.slug} aiuto="/e/… — vuoto: dal titolo. Lo dà il sito, cambialo solo se serve" errore={c.slug} />
          </div>
        </Sezione>

        <Sezione id="luogo" n="02" titolo="Luogo" nota="POSTO, MAPPA E COME ARRIVARE">
          <div className="grid gap-4 md:grid-cols-2">
            <Campo nome="location" etichetta="Location" v={v.location} aiuto="Nome del posto" />
            <Campo nome="comune" etichetta="Comune" v={v.comune} />
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="f-linkMaps">Link di Google Maps (facoltativo)</label>
            <input className="mm-campo__input" id="f-linkMaps" type="text" inputMode="url" value={linkMaps} onChange={(e) => {
              setLinkMaps(e.target.value);
              const t = coordinateDaLinkMaps(e.target.value);
              if (t) { setLat(String(t.lat)); setLng(String(t.lng)); }
            }} aria-describedby="f-linkMaps-a" placeholder="Incolla il link del posto" />
            <span className="mm-campo__aiuto" id="f-linkMaps-a">
              {coordinate ? `✓ Coordinate prese dal link: ${coordinate.lat}, ${coordinate.lng}.`
                : linkMaps.trim() ? (/goo\.gl|maps\.app/.test(linkMaps) ? 'È un link corto: aprilo e incolla l’indirizzo lungo dalla barra del browser.' : 'Non trovo le coordinate in questo link.')
                : lat && lng ? `Coordinate salvate: ${lat}, ${lng}.` : 'Serve per il link a Maps nella pagina della serata.'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="mm-campo">
              <label className="mm-campo__etichetta" htmlFor="f-lat">Latitudine</label>
              <input className="mm-campo__input" id="f-lat" name="lat" form={FORM} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="mm-campo">
              <label className="mm-campo__etichetta" htmlFor="f-lng">Longitudine</label>
              <input className="mm-campo__input" id="f-lng" name="lng" form={FORM} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-[10px] text-[15px]"><input type="checkbox" name="locationSegreta" form={FORM} defaultChecked={v.locationSegreta} className="h-[18px] w-[18px] accent-[var(--arancio)]" />Location segreta: mostra il posto solo 48 ore prima</label>
          <Area nome="infoArrivo" etichetta="Come arrivare" v={v.infoArrivo} aiuto="Parcheggio, navetta" righe={2} />
        </Sezione>

        <Sezione id="lotti" n="03" titolo="Ingresso" nota={tipo === 'libero' ? 'INGRESSO LIBERO' : notaTipi ?? 'PREVENDITA ONLINE'} aperta={nuova} forza={conErrore('tipoIngresso', 'prezzoLista', 'prevenditaFinoAlle', 'etaMinima', 'capienza')}>
          <div className="flex flex-col gap-2">
            <span className="mm-campo__etichetta" id="tipo-ingresso">Come si entra</span>
            <div role="radiogroup" aria-labelledby="tipo-ingresso" className="grid border border-linea-forte sm:grid-cols-2">
              {([['libero', 'Libero'], ['lista', 'Prevendita online']] as const).map(([k, t]) => (
                <button key={k} type="button" role="radio" aria-checked={tipo === k} onClick={() => setTipo(k)}
                  className={`min-h-[52px] border-0 border-r border-linea-forte px-2 text-[13px] font-semibold uppercase tracking-bottone ${tipo === k ? 'bg-osso text-notte' : 'bg-transparent text-osso'}`}>{t}</button>
              ))}
            </div>
            {tipo === 'lista' && <span className="mm-campo__aiuto">Si paga solo sul sito (carta, Apple Pay, Google Pay). Il QR arriva dopo il pagamento.</span>}
          </div>

          {/* Solo con la prevendita. I tipi sono moduli a sé (fuori dal modulo dei dati): con l'ingresso libero si nascondono, non si tolgono, così le modifiche non salvate non si perdono. */}
          <div className={tipo === 'lista' ? 'flex min-w-0 flex-col gap-[18px]' : 'hidden'}>
            <div className="flex flex-col gap-2">
              <span className="mm-campo__etichetta">Tipi di prevendita</span>
              <span className="text-[14px] leading-5 text-osso-2">
                Il cliente non sceglie: il sito vende il primo tipo aperto, con posti liberi, nell&apos;ordine dell&apos;elenco.
                {!nuova && <> Una categoria (es. Donne) si controlla alla porta: lo staff la vede sulla scheda.{prezzoTesto ? <> Adesso <strong className="text-osso">{prezzoTesto}</strong>.</> : null}</>}
              </span>
            </div>
            {nuova ? (
              /* La serata non esiste ancora, quindi non si può aggiungere un tipo: il primo nasce al salvataggio, con il prezzo scritto qui. */
              <div className="flex flex-col gap-3 border border-linea bg-notte-2 p-4">
                <div className={`mm-campo ${c.prezzoLista ? 'mm-campo--errore' : ''}`}>
                  <label className="mm-campo__etichetta" htmlFor="f-prezzoLista">Primo tipo: prezzo (€)</label>
                  <input className="mm-campo__input" style={{ height: 44, fontSize: 15 }} id="f-prezzoLista" name="prezzoLista" form={FORM} inputMode="decimal" value={prezzoPrimo} onChange={(e) => setPrezzoPrimo(e.target.value)} aria-invalid={Boolean(c.prezzoLista)} aria-describedby="f-prezzoLista-a" />
                  <span className="mm-campo__aiuto" id="f-prezzoLista-a">{c.prezzoLista ?? 'Si chiamerà «Lista». Dopo il primo salvataggio lo ritocchi (nome, posti, quando esce) e ne aggiungi altri.'}</span>
                </div>
              </div>
            ) : tipi}
            <Campo nome="prevenditaFinoAlle" etichetta="Prevendita valida fino alle" tipo="time" v={v.prevenditaFinoAlle} errore={c.prevenditaFinoAlle}
              aiuto="Dopo quest'ora il QR di una prevendita non fa più entrare, anche se è pagato; dopo la mezzanotte vale per la notte della serata. I tavoli non hanno limite." />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo nome="etaMinima" etichetta="Età minima" v={v.etaMinima} inputMode="numeric" errore={c.etaMinima} />
            <Campo nome="capienza" etichetta="Capienza del locale (facoltativa)" v={v.capienza} inputMode="numeric" errore={c.capienza} aiuto="La serata live dice quanti posti restano (capienza meno chi è entrato)." />
          </div>
          <div className="flex flex-col gap-3 border border-linea bg-notte-2 px-[14px] py-3">
            <label className="flex items-center gap-[10px] text-[15px]">
              <input type="checkbox" name="senzaTelefono" form={FORM} checked={senzaTel} onChange={(e) => setSenzaTel(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--arancio)]" />
              Ingresso senza telefono (con documento)
            </label>
            <span className="mm-campo__aiuto">
              {senzaTel ? 'Il cliente compra online come sempre ma alla porta non mostra il QR: lo staff cerca il cognome e controlla nome e data di nascita sul documento.' : 'Spento: alla porta si scansiona il QR del biglietto.'}
            </span>
          </div>
        </Sezione>

        {nuova ? (
          <Sezione id="tavoli" n="04" titolo="Tavoli" nota={copiaTavoliDa.length > 0 ? 'RIPRENDI DA UN’ALTRA SERATA' : 'SI AGGIUNGONO DOPO IL PRIMO SALVATAGGIO'}>
            {copiaTavoliDa.length > 0 ? (
              <div className="mm-campo">
                <label className="mm-campo__etichetta" htmlFor="f-copiaTavoliDa">Riprendi tavoli e piantina da</label>
                <select id="f-copiaTavoliDa" name="copiaTavoliDa" form={FORM} defaultValue="" className="mm-campo__input">
                  <option value="">Nessuna: li aggiungo dopo</option>
                  {copiaTavoliDa.map((x) => <option key={x.id} value={x.id}>{x.etichetta}</option>)}
                </select>
                <span className="mm-campo__aiuto">Stesso locale di un&apos;altra serata? Parti dai suoi tavoli, già al loro posto sulla mappa: poi ritocchi solo i prezzi.</span>
              </div>
            ) : (
              <span className="text-[14px] leading-5 text-osso-2">Nessun&apos;altra serata ha dei tavoli da riprendere: li aggiungi dopo il primo salvataggio, nella pagina della serata.</span>
            )}
          </Sezione>
        ) : tavoli}

        <Sezione id="copertina" n="05" titolo="Locandina e copertina" nota={anteprima ? 'LOCANDINA CARICATA' : 'LOCANDINA DA CARICARE'} forza={conErrore('locandina')}>
          <div className="flex flex-col gap-4">
            <span className="mm-campo__etichetta">Locandina</span>
            <label className="flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-4 border border-dashed border-linea-forte bg-vinile p-6 text-center">
              {anteprima
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={anteprima} alt="Anteprima locandina" className="max-h-[420px] w-auto" />
                : <><div className="mm-disco h-[120px] w-[120px]" style={{ boxShadow: 'none' }}><div className="mm-disco__foro" style={{ width: 10, height: 10, background: 'var(--vinile)' }} /></div>
                  <span className="font-display text-[28px] font-black uppercase leading-none">Scegli la locandina</span></>}
              <span className="text-[14px] leading-5 text-osso-2">JPG o PNG verticale, almeno 1080 × 1440 px. Fa da sfondo sfocato alla prevendita.</span>
              <input type="file" name="locandina" form={FORM} accept="image/jpeg,image/png,image/webp" className="text-[13px] text-osso-2"
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
          </div>
          <div className="flex flex-col gap-3 border border-linea bg-notte-2 px-[14px] py-3">
            <label className="flex items-center gap-[10px] text-[15px]">
              <input type="checkbox" name="inCopertina" form={FORM} checked={copertina} onChange={(e) => setCopertina(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--arancio)]" />
              In copertina nella home
            </label>
            <span className="mm-campo__aiuto">Se nessuna serata è in copertina, si mostra la prossima data.</span>
          </div>
        </Sezione>

        <Sezione n="06" titolo="PR">
          <label className="flex items-center gap-[10px] text-[15px]"><input type="checkbox" form={FORM} checked={tutti} onChange={(e) => setTutti(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--arancio)]" />Tutti i PR attivi</label>
          {!tutti && (
            <div className="grid gap-3 md:grid-cols-2">
              {pr.map((p) => (
                <label key={p.id} className="flex items-center gap-[10px] border border-linea bg-notte-2 px-[14px] py-3 text-[15px]">
                  <input type="checkbox" name="pr" form={FORM} value={p.id} defaultChecked={v.prAbilitati?.includes(p.id)} className="h-[18px] w-[18px] accent-[var(--arancio)]" />
                  {p.nome}{p.stato !== 'attivo' && <span className="font-mono text-[10px] text-osso-3">SOSPESO</span>}
                </label>
              ))}
            </div>
          )}
          <span className="mm-campo__aiuto">Chi arriva dal link di un PR non abilitato finisce nella Lista Maremma Musica.</span>
        </Sezione>

        {foto}
      </div>

      {/* Su telefono la barra sta fissa in fondo; su desktop resta accanto. */}
      <div className="flex flex-col gap-4 lg:pt-7">
        {v.id && v.slug && <a href={`/e/${v.slug}/prevendita`} target="_blank" className="link-sottolineato self-start py-2">Apri la prevendita →</a>}
        {nuova && <p className="m-0 text-[14px] leading-5 text-osso-2">Il primo salvataggio è sempre una bozza. Poi aggiungi tipi, locandina e tavoli e pubblichi quando vuoi: prima di pubblicare ti diciamo cosa manca.</p>}
        {(erroreModuli || mancaOra.length > 0 && !nuova && !v.pubblicato) && (
          <div className="hidden flex-col gap-1 lg:flex">
            {erroreModuli && <p role="alert" className="m-0 border border-stop-testo px-3 py-2 text-[13px] text-stop-testo">{erroreModuli}</p>}
            {!erroreModuli && <p className="m-0 font-mono text-[12px] text-osso-2">PRIMA DI PUBBLICARE MANCANO {mancaOra.length} {mancaOra.length === 1 ? 'COSA' : 'COSE'}</p>}
          </div>
        )}
        <div className="fixed inset-x-0 bottom-[calc(61px+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 border-t border-linea bg-notte px-4 py-3 md:sticky md:inset-x-auto md:bottom-0 md:z-10 md:border-0 md:px-0">
          {erroreModuli && <p role="alert" className="m-0 border border-stop-testo px-3 py-2 text-[13px] leading-5 text-stop-testo lg:hidden">{erroreModuli}</p>}
          <div className="flex gap-2">
            {nuova ? (
              <button type="button" onClick={() => void salvaTutto('bozza')} className="mm-btn mm-btn--primario flex-1" disabled={occupato}>{occupato ? 'Salvo…' : 'Salva bozza'}</button>
            ) : v.pubblicato ? (
              <>
                <button type="button" onClick={() => void salvaTutto('bozza')} className="mm-btn mm-btn--linea flex-1" disabled={occupato}>Metti in bozza</button>
                <button type="button" onClick={() => void salvaTutto('')} className="mm-btn mm-btn--primario flex-1" disabled={occupato}>{occupato ? 'Salvo…' : 'Salva'}</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void salvaTutto('bozza')} className="mm-btn mm-btn--linea flex-1" disabled={occupato}>{occupato ? 'Salvo…' : 'Salva bozza'}</button>
                <button type="button" onClick={() => (mancaOra.length > 0 ? setChiedi(true) : void salvaTutto('pubblica'))} className="mm-btn mm-btn--primario flex-1" disabled={occupato}>Pubblica serata</button>
              </>
            )}
          </div>
        </div>
      </div>

      {chiedi && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6" onClick={() => setChiedi(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="cosa-manca" onClick={(e) => e.stopPropagation()}
            className="mm-interno flex max-h-[90vh] w-full max-w-[520px] flex-col gap-4 overflow-auto border border-linea-forte bg-notte p-5">
            <h2 id="cosa-manca" className="m-0 font-display text-[28px] font-black uppercase leading-none">Cosa manca</h2>
            <p className="m-0 text-[14px] leading-5 text-osso-2">La serata andrà online subito. Puoi pubblicarla così o completarla prima.</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {mancaOra.map((m) => (
                <li key={m.id} className="flex items-start gap-3 border border-linea bg-notte-2 px-3 py-3 text-[15px] leading-5">
                  <span aria-hidden="true" className="text-attesa">●</span>
                  <span className="flex-1">{m.testo} <a href={`#${m.ancora}`} onClick={() => setChiedi(false)} className="link-sottolineato whitespace-nowrap">Vai lì</a></span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button type="button" className="mm-btn mm-btn--linea flex-1" onClick={() => void salvaTutto('pubblica')} disabled={occupato}>Pubblica lo stesso</button>
              <button type="button" className="mm-btn mm-btn--primario flex-1" onClick={() => setChiedi(false)}>Torno a completare</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RegistroSalvataggi>
  );
}

function Campo({ nome, etichetta, v, tipo = 'text', aiuto, errore, inputMode }: {
  nome: string; etichetta: string; v: string; tipo?: string; aiuto?: string; errore?: string; inputMode?: 'numeric' | 'decimal';
}) {
  const id = `f-${nome}`;
  return (
    <div className={`mm-campo ${errore ? 'mm-campo--errore' : ''}`}>
      <label className="mm-campo__etichetta" htmlFor={id}>{etichetta}</label>
      <input className="mm-campo__input" id={id} name={nome} form={FORM} type={tipo} defaultValue={v} inputMode={inputMode} aria-invalid={Boolean(errore)} aria-describedby={errore || aiuto ? `${id}-a` : undefined} />
      {(errore || aiuto) && <span className="mm-campo__aiuto" id={`${id}-a`}>{errore ?? aiuto}</span>}
    </div>
  );
}

function Area({ nome, etichetta, v, aiuto, righe }: { nome: string; etichetta: string; v: string; aiuto?: string; righe: number }) {
  const id = `f-${nome}`;
  return (
    <div className="mm-campo">
      <label className="mm-campo__etichetta" htmlFor={id}>{etichetta}</label>
      <textarea className="mm-campo__input py-3" style={{ height: 'auto' }} id={id} name={nome} form={FORM} rows={righe} defaultValue={v} aria-describedby={aiuto ? `${id}-a` : undefined} />
      {aiuto && <span className="mm-campo__aiuto" id={`${id}-a`}>{aiuto}</span>}
    </div>
  );
}
