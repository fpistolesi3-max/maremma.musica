import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { elencoSerate } from '@/lib/dati/admin';
import { rimborsiAdmin, type VoceRimborso } from '@/lib/dati/rimborsi';
import { TESTO_MOTIVO_RIMBORSO } from '@/lib/regole';
import { dataPunti, euro, quandoRelativo } from '@/lib/formato';
import { Filtri, TestataAdmin } from '@/components/admin/ui';
import { RimborsaPagamento } from '@/components/admin/rimborsi-client';

export const metadata = { title: 'Rimborsi' };

type Props = { searchParams: Promise<{ evento?: string; motivo?: string }> };

const dove = (v: VoceRimborso) => (v.bersaglio.tipo === 'prevendita' ? `/admin/iscrizioni?evento=${v.eventoId}&q=${encodeURIComponent(v.email ?? '')}` : `/admin/eventi/${v.eventoId}/modifica#tavoli`);

/**
 * Pagamenti da restituire: arrivati quando non valevano più (posti finiti, serata iniziata, doppione, tavolo di un altro), pagamenti
 * doppi sullo stesso ordine e pagamenti con importo sbagliato. Più, in fondo, gli ultimi restituiti. Il rimborso è uno solo per pagamento.
 */
export default async function AdminRimborsi({ searchParams }: Props) {
  const s = await richiedi(['admin'], '/admin/rimborsi');
  const f = await searchParams;
  const [{ daFare, fatti }, serate] = await Promise.all([rimborsiAdmin(s, f), elencoSerate(s)]);
  const totale = daFare.reduce((t, v) => t + v.importo, 0);
  const attivi = [
    serate.find(({ evento: e }) => e.id === f.evento)?.evento.nome,
    f.motivo && TESTO_MOTIVO_RIMBORSO[f.motivo as keyof typeof TESTO_MOTIVO_RIMBORSO],
  ].filter((x): x is string => Boolean(x));
  return (
    <>
      <TestataAdmin briciole="RIMBORSI" titolo="Da rimborsare" sotto={`${daFare.length} DA FARE · ${euro(totale)} DA RESTITUIRE`}
        azioni={<Link className="mm-btn mm-btn--muto" href="/admin/iscrizioni">Iscrizioni</Link>} />
      <div className="flex flex-col gap-6 px-4 py-6 md:px-12">
        <Filtri attivi={attivi} azzera="/admin/rimborsi"><form className="grid gap-3 md:grid-cols-[1.4fr_1.4fr_auto] md:items-end">
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="fr-evento">Serata</label>
            <select id="fr-evento" name="evento" defaultValue={f.evento ?? ''} className="mm-campo__input" style={{ height: 44 }}>
              <option value="">Tutte</option>
              {serate.map(({ evento: e }) => <option key={e.id} value={e.id}>{dataPunti(e.data)} · {e.nome}</option>)}
            </select>
          </div>
          <div className="mm-campo">
            <label className="mm-campo__etichetta" htmlFor="fr-motivo">Motivo</label>
            <select id="fr-motivo" name="motivo" defaultValue={f.motivo ?? ''} className="mm-campo__input" style={{ height: 44 }}>
              <option value="">Tutti</option>
              {Object.entries(TESTO_MOTIVO_RIMBORSO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 44 }}>Filtra</button>
        </form></Filtri>

        <section aria-label="Da rimborsare" className="flex flex-col gap-3">
          {daFare.length === 0 && <p className="m-0 text-[15px] text-osso-2">Nessun pagamento da restituire.</p>}
          {daFare.map((v) => (
            <div key={v.chiave} className="flex flex-col gap-3 border border-stop-testo px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[17px] font-medium leading-6">{v.persona} <span className="font-mono text-[13px] text-osso-2">· {euro(v.importo)}</span></span>
                <span className="text-[14px] leading-5 text-stop-testo">{v.motivo ? TESTO_MOTIVO_RIMBORSO[v.motivo] : 'Pagamento che non valeva più'}</span>
                <span className="font-mono text-[11px] leading-4 text-osso-2">
                  {v.bersaglio.tipo === 'prevendita' ? 'PREVENDITA' : 'TAVOLO'} · {v.serata.toUpperCase()} · {quandoRelativo(v.at).toUpperCase()}{v.email ? ` · ${v.email}` : ''}
                  {v.stato === 'in_corso' && ' · RIMBORSO IN CORSO: SE NON È CONCLUSO RIPROVA, NON PARTE DUE VOLTE'}
                </span>
                <Link href={dove(v)} className="link-sottolineato w-fit py-1 text-[13px]">Vedi l&apos;ordine →</Link>
              </div>
              <RimborsaPagamento tipo={v.bersaglio.tipo} id={v.bersaglio.id} pagamento={v.bersaglio.pagamento} persona={v.persona} importo={euro(v.importo)} />
            </div>
          ))}
        </section>

        {fatti.length > 0 && (
          <section aria-label="Già restituiti" className="flex flex-col gap-2">
            <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Già restituiti</h2>
            <div className="mm-scroll">
              <table className="mm-classifica mm-schede">
                <thead><tr><th>Persona</th><th>Serata</th><th>Motivo</th><th className="mm-num">Importo</th><th>Quando</th></tr></thead>
                <tbody>
                  {fatti.map((v) => (
                    <tr key={v.chiave}>
                      <td className="mm-pieno">{v.persona}</td>
                      <td data-et="Serata" className="text-[14px]">{v.serata}</td>
                      <td data-et="Motivo" className="text-[13px]">{v.motivo ? TESTO_MOTIVO_RIMBORSO[v.motivo] : 'Annullata con rimborso'}</td>
                      <td data-et="Importo" className="mm-num">{euro(v.importo)}</td>
                      <td data-et="Quando" className="whitespace-nowrap font-mono text-[11px] text-osso-2">{v.fattoAt ? quandoRelativo(v.fattoAt) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
