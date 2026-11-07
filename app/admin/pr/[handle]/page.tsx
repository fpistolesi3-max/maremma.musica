import Link from 'next/link';
import { notFound } from 'next/navigation';
import { richiedi } from '@/lib/sessione';
import { dettaglioPr, type TipoAttivita } from '@/lib/dati/gestione-pr';
import { dataPunti, euro, giornoSett, ora, parti, quandoRelativo } from '@/lib/formato';
import { Resa, Riquadro } from '@/components/gestione';
import { SceltaSerata } from '@/components/gestione-client';
import { ChipIscrizione } from '@/components/ui';
import { etichettaCanale } from '@/lib/canali';
import { InvitoWhatsApp, ModificaPr } from '@/components/admin/pr-client';
import { StatoPr } from '@/components/admin/azioni-client';
import { origineRichiesta } from '@/lib/sessione';
import { testoInvitoPr } from '@/lib/inviti';
import { percorsoIscrizioni } from '@/lib/iscrizioni-vista';

export const metadata = { title: 'Dettaglio PR' };

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ serata?: string }> };

const ATTIVITA: Record<TipoAttivita, { testo: string; colore: string }> = {
  iscrizione: { testo: 'In lista', colore: 'text-arancio' },
  entrato: { testo: 'Entrato', colore: 'text-ok' },
  annullato: { testo: 'Annullato', colore: 'text-stop-testo' },
  rimborsato: { testo: 'Rimborsato', colore: 'text-stop-testo' },
};
const GIORNI = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];

/** Scheda di un PR: numeri per serata, iscritti al giorno, lista e attività recente. */
export default async function DettaglioPr({ params, searchParams }: Props) {
  const { handle } = await params;
  const s = await richiedi(['admin'], `/admin/pr/${handle}`);
  const { serata } = await searchParams;
  const x = await dettaglioPr(s, handle, (serata as string) ?? null);
  if (!x) notFound();
  const max = Math.max(1, ...x.perGiorno.map((g) => g.n));
  const sospeso = x.pr.stato === 'sospeso';
  const origine = await origineRichiesta();
  const n = x.numeri;

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-linea px-4 pb-6 pt-2 md:flex-row md:items-end md:justify-between md:px-12">
        <div className="flex flex-col gap-[10px]">
          <Link href={`/admin/pr${x.evento ? `?serata=${x.evento.id}` : '?serata=tutte'}`} className="inline-flex min-h-[44px] items-center font-mono text-[11px] text-osso-2 no-underline">← PR</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 font-display text-[44px] font-black uppercase leading-[.85] md:text-[64px]">{x.pr.nomeDisplay}</h1>
            <span className={`mm-chip ${x.pr.stato === 'attivo' ? 'mm-chip--entrato' : 'mm-chip--annullato'}`}>{x.pr.stato === 'attivo' ? 'Attivo' : 'Sospeso'}</span>
          </div>
          <span className="font-mono text-[12px] text-osso-2">
            /pr/{x.pr.handle}{x.email ? ` · ${x.email}` : ''} · PR DAL {dataPunti(x.pr.createdAt)}.{String(parti(x.pr.createdAt).anno).slice(2)}
          </span>
        </div>
      </div>

      <section aria-labelledby="anagrafica" className="flex flex-col gap-5 border-b border-linea px-4 py-6 md:px-12">
        <h2 id="anagrafica" className="m-0 font-display text-[26px] font-black uppercase leading-none">Anagrafica</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3 border border-linea p-4">
            <span className="etichetta">Dati</span>
            <ModificaPr prId={x.pr.id} nome={x.pr.nomeDisplay} email={x.email ?? ''} handle={x.pr.handle} />
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 border border-linea p-4">
              <span className="etichetta">Accesso</span>
              {x.email && !sospeso
                ? <InvitoWhatsApp testo={testoInvitoPr(x.pr.nomeDisplay, x.email, origine)} etichetta="Rimanda invito su WhatsApp" />
                : <span className="text-[13px] leading-5 text-osso-3">{sospeso ? 'Sospeso: non può entrare.' : 'Senza email non può entrare: aggiungila nei dati.'}</span>}
              <span className="text-[13px] leading-5 text-osso-3">Entra da /accedi con la sua email, senza password.</span>
            </div>
            <div className={`flex flex-col gap-3 border p-4 ${sospeso ? 'border-attesa' : 'border-linea'}`}>
              <span className="etichetta">Stato del PR</span>
              <span className="text-[14px] leading-5">
                {sospeso
                  ? <><b className="text-attesa">Sospeso.</b> Non entra nella sua area, chi apre i suoi link vede che non valgono e non riceve i link delle serate. Le iscrizioni già fatte restano.</>
                  : <><b className="text-ok">Attivo.</b> Entra nella sua area e i suoi link funzionano nelle serate a cui è abilitato.</>}
              </span>
              <div><StatoPr id={x.pr.id} attivo={!sospeso} nome={x.pr.nomeDisplay} /></div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="numeri" className="flex flex-col gap-3 px-4 pt-6 md:flex-row md:items-end md:justify-between md:px-12">
        <h2 id="numeri" className="m-0 font-display text-[26px] font-black uppercase leading-none">Numeri</h2>
        <SceltaSerata azione={`/admin/pr/${x.pr.handle}`} eventi={x.eventi} scelto={x.evento?.id ?? 'tutte'} />
      </section>

      <div className="grid grid-cols-2 border-l border-linea lg:grid-cols-4">
        <Riquadro etichetta="In lista" valore={n.inLista} nota={`+${n.nuovi24h} NELLE ULTIME 24H`} />
        <Riquadro etichetta="Entrati" valore={n.entrati} colore="text-ok" nota={n.resa != null ? `RESA ${n.resa}%` : 'PORTA NON ANCORA APERTA'} />
        <Riquadro etichetta="Pagato online" valore={euro(n.incassatoOnline)} nota="PREVENDITA SUL SITO" />
        <Riquadro etichetta="Annullati" valore={n.annullati} nota={n.ultimaAttivita ? `ULTIMA ATTIVITÀ ${quandoRelativo(n.ultimaAttivita)}` : 'NESSUNA ATTIVITÀ'} />
      </div>

      <div className="grid gap-x-12 px-4 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <section className="flex flex-col gap-[10px] py-6">
            <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Iscritti al giorno · 14 giorni</h2>
            <div className="grid h-[96px] grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1" role="img" aria-label={x.perGiorno.map((g) => `${g.giorno}: ${g.n}`).join(', ')}>
              {x.perGiorno.map((g, i) => (
                <div key={g.giorno} className="flex h-full flex-col items-center justify-end gap-1">
                  <span className="font-mono text-[9px] text-osso-3">{g.n || ''}</span>
                  <div className={`w-full ${i === 13 ? 'bg-arancio' : g.n ? 'bg-barra' : 'bg-notte-3'}`} style={{ height: `${Math.max(3, (g.n / max) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1 text-center font-mono text-[8px] text-osso-3">
              {x.perGiorno.map((g, i) => <span key={g.giorno} className={i === 13 ? 'text-arancio' : ''}>{i === 13 ? 'OGGI' : i % 2 === 1 ? GIORNI[new Date(`${g.giorno}T12:00:00`).getDay()] : ''}</span>)}
            </div>
          </section>

          <section className="flex flex-col gap-[10px] pb-6">
            <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Per serata</h2>
            <div className="mm-scroll">
              <table className="mm-classifica">
                <thead><tr><th>Serata</th><th className="mm-num">Lista</th><th className="mm-num">Entrati</th><th style={{ width: '28%' }}>Resa</th><th className="mm-num">Online</th></tr></thead>
                <tbody>
                  {x.serate.map((r) => (
                    <tr key={r.evento.id}>
                      <td className="whitespace-nowrap"><Link href={`/admin/pr/${x.pr.handle}?serata=${r.evento.id}`} className="no-underline"><span className="font-mono text-[12px] text-osso-2">{giornoSett(r.evento.data)} {dataPunti(r.evento.data)}</span> <span className="font-display text-[18px] font-extrabold uppercase">{r.evento.nome}</span></Link></td>
                      <td className="mm-num"><Link href={percorsoIscrizioni({ evento: r.evento.id, pr: x.pr.handle })} className="text-osso underline decoration-arancio underline-offset-[6px]" aria-label={`${r.inLista} in lista: vedi le iscrizioni`}>{r.inLista}</Link></td>
                      <td className="mm-num"><Link href={percorsoIscrizioni({ evento: r.evento.id, pr: x.pr.handle, stato: 'entrato' })} className="text-osso underline decoration-arancio underline-offset-[6px]" aria-label={`${r.entrati} entrati: vedi le iscrizioni`}>{r.entrati}</Link></td>
                      <td><Resa valore={r.resa} /></td>
                      <td className="mm-num">{euro(r.incassatoOnline)}</td>
                    </tr>
                  ))}
                  {x.serate.length === 0 && <tr><td colSpan={5} className="text-osso-2">Nessuna serata.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-[10px] pb-8">
            <div className="flex items-end justify-between">
              <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Lista</h2>
              <span className="font-mono text-[11px] text-osso-2">{x.iscrizioni.length} NOMI</span>
            </div>
            <div className="flex flex-col">
              {x.iscrizioni.slice(0, 200).map((i, k) => (
                <div key={i.id} className={`flex items-center gap-3 border-t border-linea py-3 ${k === Math.min(x.iscrizioni.length, 200) - 1 ? 'border-b' : ''}`}>
                  <div className="flex min-w-0 flex-grow flex-col gap-[3px]">
                    <span className="text-[15px] font-medium leading-5">{i.nome}</span>
                    <span className="font-mono text-[11px] text-osso-3">{quandoRelativo(i.createdAt)}{i.metodoPagamento === 'online' ? ` · ${euro(i.importo)} ONLINE` : ''} · {etichettaCanale(i.canale).toUpperCase()}</span>
                  </div>
                  <ChipIscrizione stato={i.stato} testo={i.stato === 'entrato' && i.oraCheckIn ? `Entrato ${ora(i.oraCheckIn)}` : undefined} />
                </div>
              ))}
              {x.iscrizioni.length === 0 && <p className="border-y border-linea py-4 text-osso-2">Nessuno in lista per questa serata.</p>}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-[10px] border-t border-linea py-6 lg:border-t-0">
          <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Attività recente</h2>
          <ol className="m-0 flex list-none flex-col p-0">
            {x.attivita.map((a, k) => (
              <li key={k} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-t border-linea py-3">
                <span className="font-mono text-[11px] leading-4 text-osso-2">{quandoRelativo(a.quando)}</span>
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className={`font-mono text-[11px] uppercase ${ATTIVITA[a.tipo].colore}`}>
                    {ATTIVITA[a.tipo].testo}{a.tipo === 'iscrizione' && a.importo > 0 ? ` · ${euro(a.importo)} online` : ''}{a.tipo === 'entrato' && a.porta ? ` · ${a.porta}` : ''}
                  </span>
                  <span className="text-[15px] leading-5">{a.nome}</span>
                  {!x.evento && <span className="font-mono text-[10px] text-osso-3">{a.evento.toUpperCase()}</span>}
                </span>
              </li>
            ))}
            {x.attivita.length === 0 && <li className="border-t border-linea py-4 text-osso-2">Nessuna attività.</li>}
          </ol>
        </aside>
      </div>
    </>
  );
}
