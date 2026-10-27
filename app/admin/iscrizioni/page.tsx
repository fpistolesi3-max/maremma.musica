import { richiedi } from '@/lib/sessione';
import { elencoSerate, iscrizioniAdmin } from '@/lib/dati/admin';
import { dataPunti, euro, nascita, ora, quandoRelativo } from '@/lib/formato';
import { mostraCodice } from '@/lib/qr-token';
import { Filtri, TestataAdmin } from '@/components/admin/ui';
import { ChipIscrizione } from '@/components/ui';
import { AzioniIscrizione } from '@/components/admin/azioni-client';

export const metadata = { title: 'Iscrizioni' };

const STATI: Record<string, string> = {
  cassa: 'Ingresso in cassa', da_rimborsare: 'Da rimborsare', pagato: 'Pagato online', in_lista: 'In lista (gratis)',
  in_attesa: 'Non pagato (in attesa)', scaduta: 'Scaduta senza pagare', entrato: 'Entrato', annullato: 'Annullato', rimborsato: 'Rimborsato',
};

type Props = { searchParams: Promise<{ evento?: string; q?: string; stato?: string }> };

/** Tutte le vendite (iscrizioni in lista), con filtri, CSV, annulli e rimborsi. */
export default async function AdminIscrizioni({ searchParams }: Props) {
  const s = await richiedi(['admin'], '/admin/iscrizioni');
  const f = await searchParams;
  const [righe, serate] = await Promise.all([iscrizioniAdmin(s, f), elencoSerate(s)]);
  const attive = righe.filter((r) => ['in_lista', 'pagato', 'entrato'].includes(r.iscrizione.stato));
  const incassato = attive.filter((r) => r.iscrizione.metodoPagamento).reduce((t, r) => t + r.iscrizione.importo, 0);
  const attivi = [
    serate.find(({ evento: e }) => e.id === f.evento)?.evento.nome,
    f.q && `“${f.q}”`,
    f.stato && STATI[f.stato],
  ].filter((x): x is string => Boolean(x));
  return (
    <>
      <TestataAdmin briciole="ISCRIZIONI" titolo="Iscrizioni" sotto={`${righe.length} RISULTATI · ${attive.length} ATTIVE · ${euro(incassato)} INCASSATI`}
        azioni={f.evento ? <a className="mm-btn mm-btn--linea" href={`/api/admin/csv/${f.evento}`}>Esporta CSV</a> : undefined} />
      <div className="flex flex-col gap-6 px-4 py-6 md:px-12">
        <Filtri attivi={attivi} azzera="/admin/iscrizioni"><form className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="fi-evento">Serata</label>
            <select id="fi-evento" name="evento" defaultValue={f.evento ?? ''} className="mm-campo__input" style={{ height: 44 }}>
              <option value="">Tutte</option>
              {serate.map(({ evento: e }) => <option key={e.id} value={e.id}>{dataPunti(e.data)} · {e.nome}</option>)}
            </select>
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="fi-q">Cerca</label>
            <input id="fi-q" name="q" defaultValue={f.q ?? ''} className="mm-campo__input" style={{ height: 44 }} placeholder="Nome, email o codice" />
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="fi-stato">Stato</label>
            <select id="fi-stato" name="stato" defaultValue={f.stato ?? ''} className="mm-campo__input" style={{ height: 44 }}>
              <option value="">Tutti</option><option value="cassa">Ingresso in cassa</option><option value="da_rimborsare">Da rimborsare</option><option value="pagato">Pagato online</option><option value="in_lista">In lista (gratis)</option>
              <option value="in_attesa">Non pagato (in attesa)</option><option value="scaduta">Scaduta senza pagare</option>
              <option value="entrato">Entrato</option><option value="annullato">Annullato</option><option value="rimborsato">Rimborsato</option>
            </select>
          </div>
          <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }}>Filtra</button>
        </form></Filtri>
        <div className="mm-scroll">
          <table className="mm-classifica mm-schede">
            <thead><tr><th>Persona</th><th>Serata</th><th>Lista</th><th className="mm-num">Importo</th><th>Stato</th><th>Iscritto</th><th /></tr></thead>
            <tbody>
              {righe.slice(0, 500).map(({ iscrizione: i, evento, lista }) => (
                <tr key={i.id}>
                  <td className="mm-pieno">
                    <div className="text-[15px] font-medium">{i.anonimizzata ? 'Dati cancellati' : `${i.nome} ${i.cognome}`}</div>
                    <div className="font-mono text-[11px] text-osso-2">{i.anonimizzata ? `${i.etaAllaSerata != null ? `${i.etaAllaSerata} ANNI · ` : ''}${i.origine === 'cassa' ? 'INGRESSO IN CASSA' : 'ANONIMIZZATA'}` : `${nascita(i.dataNascita)} · ${i.origine === 'cassa' ? `INGRESSO IN CASSA${i.porta ? ` · ${i.porta}` : ''}` : `${i.email} · ${mostraCodice(i.codice)}`}`}</div>
                  </td>
                  <td data-et="Serata" className="whitespace-nowrap font-mono text-[12px]">{dataPunti(evento.data)} {evento.nome}</td>
                  <td data-et="Lista" className="whitespace-nowrap text-[14px]">{lista}</td>
                  <td data-et="Importo" className="mm-num">{euro(i.importo)}{i.metodoPagamento && <div className="text-[10px] text-osso-3">{{ online: 'ONLINE', porta_contanti: 'CONTANTI', porta_pos: 'POS' }[i.metodoPagamento]}</div>}</td>
                  <td data-et="Stato">
                    {i.pagamentoOnline?.daRimborsare
                      ? <span className="mm-chip mm-chip--incassare">Da rimborsare</span>
                      : <ChipIscrizione stato={i.stato} testo={i.stato === 'entrato' && i.oraCheckIn ? `Entrato ${ora(i.oraCheckIn)}` : undefined} />}
                    {i.rifiutoIngresso && <div className="mt-1"><span className="mm-chip mm-chip--incassare" title={`Rifiutato da ${i.rifiutoIngresso.da} · ${i.rifiutoIngresso.porta}`}>Rifiutato {ora(i.rifiutoIngresso.ora)}{i.categoria ? ` · ${i.categoria}` : ''}</span></div>}
                  </td>
                  <td data-et="Iscritto" className="whitespace-nowrap font-mono text-[11px] text-osso-2">{quandoRelativo(i.createdAt)}</td>
                  <td className="mm-pieno"><AzioniIscrizione id={i.id} stato={i.stato} pagato={Boolean(i.metodoPagamento)} online={i.metodoPagamento === 'online'}
                    nominativo={evento.senzaTelefono && !i.anonimizzata ? { nome: i.nome, cognome: i.cognome, nascita: i.dataNascita, email: i.origine === 'cassa' ? null : i.email } : null}
                    daRimborsare={Boolean(i.pagamentoOnline?.daRimborsare)} maiPagata={Boolean(i.pagamentoOnline && !i.metodoPagamento)} /></td>
                </tr>
              ))}
              {righe.length === 0 && <tr><td colSpan={7} className="text-osso-2">Nessuna iscrizione con questi filtri.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
