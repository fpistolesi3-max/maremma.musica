import { richiedi } from '@/lib/sessione';
import Link from 'next/link';
import { daRimborsareAncora, elencoSerate, iscrizioniAdmin, nomePr } from '@/lib/dati/admin';
import { dataPunti, euro, nascita, ora, quandoRelativo } from '@/lib/formato';
import { mostraCodice } from '@/lib/qr-token';
import { etichettaCanale } from '@/lib/canali';
import { dividiSerate } from '@/lib/elenco-serate';
import { percorsoIscrizioni, vistaIscrizioni, type FiltroIscrizioni } from '@/lib/iscrizioni-vista';
import { Filtri, TestataAdmin } from '@/components/admin/ui';
import { Linguette } from '@/components/admin/linguette';
import { ChipIscrizione } from '@/components/ui';
import { AzioniIscrizione } from '@/components/admin/azioni-client';

export const metadata = { title: 'Iscrizioni' };

const STATI: Record<string, string> = {
  porta_storico: 'Ingresso alla porta (storico)', da_rimborsare: 'Da rimborsare', pagato: 'Pagato online', in_lista: 'In lista (gratis)',
  in_attesa: 'Non pagato (in attesa)', scaduta: 'Scaduta senza pagare', entrato: 'Entrato', annullato: 'Annullato', rimborsato: 'Rimborsato',
};

type Props = { searchParams: Promise<FiltroIscrizioni> };

/**
 * Le iscrizioni di una serata alla volta (linguette in alto; si apre sulla prossima), con filtri, CSV, annulli e rimborsi.
 * La ricerca per nome o email guarda in tutte le serate. Da Canali si arriva con il filtro su un PR o un canale.
 */
export default async function AdminIscrizioni({ searchParams }: Props) {
  const s = await richiedi(['admin'], '/admin/iscrizioni');
  const f = await searchParams;
  const serate = await elencoSerate(s);
  const { scelta, tutte } = vistaIscrizioni(f, serate);
  const eventoId = scelta?.evento.id;
  const righe = scelta || tutte ? await iscrizioniAdmin(s, { eventoId: tutte ? undefined : eventoId, q: f.q?.trim(), stato: f.stato, pr: f.pr, canale: f.canale }) : [];
  const attive = righe.filter((r) => ['in_lista', 'pagato', 'entrato'].includes(r.iscrizione.stato));
  const incassato = attive.filter((r) => r.iscrizione.metodoPagamento).reduce((t, r) => t + r.iscrizione.importo, 0);

  // Linguette: le serate in arrivo per data, poi "Passate" (con una seconda fila per sceglierne una). Cambiando serata restano stato, PR e canale.
  const { inArrivo, passate } = dividiSerate(serate);
  const resto = { stato: f.stato, pr: f.pr, canale: f.canale };
  const vai = (id: string) => percorsoIscrizioni({ ...resto, evento: id });
  const sullaPassata = !tutte && Boolean(scelta?.passata);
  const attiva = (id: string) => !tutte && scelta?.evento.id === id;
  const anno = (d: string) => String(new Date(d).getFullYear()).slice(2);

  // Filtri su PR e canale: un'etichetta "Solo: …" ciascuno, che si toglie con un tocco.
  const senza = (k: 'pr' | 'canale') => percorsoIscrizioni({ ...f, evento: eventoId, [k]: undefined });
  const solo = [
    f.pr && { chiave: 'pr', testo: f.pr === 'nessuno' ? 'Senza PR' : f.pr === 'con' ? 'Dai PR' : await nomePr(s, f.pr), togli: senza('pr') },
    f.canale && { chiave: 'canale', testo: etichettaCanale(f.canale), togli: senza('canale') },
  ].filter((x): x is { chiave: string; testo: string; togli: string } => Boolean(x));
  const attivi = [f.q && `“${f.q}”`, f.stato && STATI[f.stato]].filter((x): x is string => Boolean(x));
  const colonne = tutte ? 7 : 6;

  return (
    <>
      <TestataAdmin briciole="ISCRIZIONI" titolo="Iscrizioni"
        sotto={`${tutte ? 'TUTTE LE SERATE' : scelta ? `${dataPunti(scelta.evento.data)} · ${scelta.evento.nome.toUpperCase()}` : 'NESSUNA SERATA'} · ${righe.length} ${righe.length === 1 ? 'RISULTATO' : 'RISULTATI'} · ${attive.length} ${attive.length === 1 ? 'ATTIVA' : 'ATTIVE'} · ${euro(incassato)} INCASSATI`}
        azioni={<>
          <Link className="mm-btn mm-btn--muto" href={!tutte && eventoId ? `/admin/rimborsi?evento=${eventoId}` : '/admin/rimborsi'}>Rimborsi</Link>
          {!tutte && eventoId && <a className="mm-btn mm-btn--linea" href={`/api/admin/csv/${eventoId}`}>Esporta CSV</a>}
        </>} />
      {serate.length > 0 && (
        <>
          <Linguette etichetta="Serate" voci={[
            ...inArrivo.map(({ evento: e }) => ({ href: vai(e.id), testo: `${e.nome} · ${dataPunti(e.data)}`, attiva: attiva(e.id) })),
            ...(passate.length > 0 ? [{ href: vai(sullaPassata && scelta ? scelta.evento.id : passate[0].evento.id), testo: 'Passate', attiva: sullaPassata }] : []),
          ]} />
          {sullaPassata && (
            <Linguette etichetta="Serate passate" piccola voci={passate.map(({ evento: e }) => ({ href: vai(e.id), testo: `${e.nome} · ${dataPunti(e.data)}.${anno(e.data)}`, attiva: attiva(e.id) }))} />
          )}
        </>
      )}
      <div className="flex flex-col gap-6 px-4 py-6 md:px-12">
        {(solo.length > 0 || tutte) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {tutte && (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-osso-2">
                RISULTATI IN TUTTE LE SERATE
                {scelta && <Link href={percorsoIscrizioni({ ...resto, evento: scelta.evento.id })} className="link-sottolineato">Torna a {scelta.evento.nome}</Link>}
              </span>
            )}
            {solo.map((x) => (
              <Link key={x.chiave} href={x.togli} className="mm-btn mm-btn--linea" style={{ minHeight: 36, padding: '0 var(--space-3)' }} aria-label={`Togli il filtro: ${x.testo}`}>Solo: {x.testo} ✕</Link>
            ))}
          </div>
        )}
        <Filtri attivi={attivi} azzera={percorsoIscrizioni({ evento: eventoId, pr: f.pr, canale: f.canale })}><form className="grid gap-3 md:grid-cols-[1.6fr_1fr_auto] md:items-end">
          {eventoId && <input type="hidden" name="evento" value={eventoId} />}
          {f.pr && <input type="hidden" name="pr" value={f.pr} />}
          {f.canale && <input type="hidden" name="canale" value={f.canale} />}
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="fi-q">Cerca in tutte le serate</label>
            <input id="fi-q" name="q" defaultValue={f.q ?? ''} className="mm-campo__input" style={{ height: 44 }} placeholder="Nome, cognome, email o codice" />
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="fi-stato">Stato</label>
            <select id="fi-stato" name="stato" defaultValue={f.stato ?? ''} className="mm-campo__input" style={{ height: 44 }}>
              <option value="">Tutti</option><option value="porta_storico">Ingresso alla porta (storico)</option><option value="da_rimborsare">Da rimborsare</option><option value="pagato">Pagato online</option><option value="in_lista">In lista (gratis)</option>
              <option value="in_attesa">Non pagato (in attesa)</option><option value="scaduta">Scaduta senza pagare</option>
              <option value="entrato">Entrato</option><option value="annullato">Annullato</option><option value="rimborsato">Rimborsato</option>
            </select>
          </div>
          <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }}>Filtra</button>
        </form></Filtri>
        <div className="mm-scroll">
          <table className="mm-classifica mm-schede">
            <thead><tr><th>Persona</th>{tutte && <th>Serata</th>}<th>Lista</th><th className="mm-num">Importo</th><th>Stato</th><th>Iscritto</th><th /></tr></thead>
            <tbody>
              {righe.slice(0, 500).map(({ iscrizione: i, evento, lista }) => (
                <tr key={i.id}>
                  <td className="mm-pieno">
                    <div className="text-[15px] font-medium">{i.anonimizzata ? 'Dati cancellati' : `${i.nome} ${i.cognome}`}</div>
                    <div className="font-mono text-[11px] text-osso-2">{i.anonimizzata ? `${i.etaAllaSerata != null ? `${i.etaAllaSerata} ANNI · ` : ''}${i.origine === 'cassa' ? 'INGRESSO ALLA PORTA (STORICO)' : 'ANONIMIZZATA'}` : `${nascita(i.dataNascita)} · ${i.origine === 'cassa' ? `INGRESSO ALLA PORTA (STORICO)${i.porta ? ` · ${i.porta}` : ''}` : `${i.email} · ${mostraCodice(i.codice)}`}`}</div>
                  </td>
                  {tutte && <td data-et="Serata" className="whitespace-nowrap font-mono text-[12px]"><Link href={percorsoIscrizioni({ ...resto, evento: evento.id })} className="text-osso no-underline hover:underline">{dataPunti(evento.data)} {evento.nome}</Link></td>}
                  <td data-et="Lista" className="whitespace-nowrap text-[14px]">{lista}</td>
                  <td data-et="Importo" className="mm-num">{euro(i.importo)}{i.metodoPagamento && <div className="text-[10px] text-osso-3">{{ online: 'ONLINE', porta_contanti: 'CONTANTI', porta_pos: 'POS' }[i.metodoPagamento]}</div>}</td>
                  <td data-et="Stato">
                    {i.pagamentoOnline?.daRimborsare
                      ? <span className="mm-chip mm-chip--incassare">Da rimborsare</span>
                      : <ChipIscrizione stato={i.stato} testo={i.stato === 'entrato' && i.oraCheckIn ? `Entrato ${ora(i.oraCheckIn)}` : undefined} />}
                    {daRimborsareAncora(i) && !i.pagamentoOnline?.daRimborsare && <div className="mt-1"><Link href={`/admin/rimborsi?evento=${evento.id}`} className="mm-chip mm-chip--incassare no-underline">Pagamento in più da rimborsare</Link></div>}
                    {i.rifiutoIngresso && <div className="mt-1"><span className="mm-chip mm-chip--incassare" title={`Rifiutato da ${i.rifiutoIngresso.da} · ${i.rifiutoIngresso.porta}`}>Rifiutato {ora(i.rifiutoIngresso.ora)}{i.categoria ? ` · ${i.categoria}` : ''}</span></div>}
                  </td>
                  <td data-et="Iscritto" className="whitespace-nowrap font-mono text-[11px] text-osso-2">{quandoRelativo(i.createdAt)}</td>
                  <td className="mm-pieno"><AzioniIscrizione id={i.id} stato={i.stato} pagato={Boolean(i.metodoPagamento)} online={i.metodoPagamento === 'online'}
                    nominativo={!i.anonimizzata ? { nome: i.nome, cognome: i.cognome, nascita: i.dataNascita, email: i.origine === 'cassa' ? null : i.email } : null}
                    daRimborsare={Boolean(i.pagamentoOnline?.daRimborsare)} maiPagata={Boolean(i.pagamentoOnline && !i.metodoPagamento)} /></td>
                </tr>
              ))}
              {righe.length === 0 && <tr><td colSpan={colonne} className="text-osso-2">{tutte ? 'Nessuna iscrizione con questi filtri.' : 'Nessuna iscrizione in questa serata con questi filtri.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
