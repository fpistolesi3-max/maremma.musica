import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { panoramicaPr } from '@/lib/dati/gestione-pr';
import { dataPunti, euro, giornoSett, quandoRelativo } from '@/lib/formato';
import { Resa, Riquadro, SceltaSerata } from '@/components/gestione';
import { AggiornamentoLive } from '@/components/admin/live';
import { ConfermaConsegna } from '@/components/gestione-client';

export const metadata = { title: 'Attività PR' };

type Props = { searchParams: Promise<{ serata?: string }> };

/** Attività dei PR: chi porta gente, chi la fa entrare, quanti soldi hanno in mano. Admin e staff. */
export default async function AttivitaPr({ searchParams }: Props) {
  const s = await richiedi(['admin', 'staff'], '/gestione/pr');
  const { serata } = await searchParams;
  const p = await panoramicaPr(s, (serata as string) ?? null);
  const q = p.evento ? `?serata=${p.evento.id}` : '?serata=tutte';
  const totaleLista = p.totali.inLista + p.diretta.inLista;
  const nomeSerata = p.evento ? `${p.evento.nome} ${dataPunti(p.evento.data)}` : 'tutte le serate';

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-linea px-4 pb-6 pt-6 md:flex-row md:items-end md:justify-between md:px-10">
        <div className="flex flex-col gap-[10px]">
          <span className="font-mono text-[11px] text-osso-2">GESTIONE / PR</span>
          <h1 className="m-0 font-display text-[44px] font-black uppercase leading-[.85] md:text-[64px]">Attività PR</h1>
          <span className="font-mono text-[12px] text-osso-2">
            {p.evento ? `${giornoSett(p.evento.data)} ${dataPunti(p.evento.data)} · ${p.evento.nome.toUpperCase()}` : 'TUTTE LE SERATE'} · {p.prAttivi} PR ATTIVI
          </span>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <SceltaSerata azione="/gestione/pr" eventi={p.eventi} scelto={p.evento?.id ?? 'tutte'} />
          <AggiornamentoLive ogniSecondi={10} aggiornatoAt={new Date().toISOString()} />
        </div>
      </div>

      <div className="grid grid-cols-2 border-l border-linea lg:grid-cols-4">
        <Riquadro etichetta="In lista dai PR" valore={p.totali.inLista}
          nota={totaleLista ? `${Math.round((p.totali.inLista / totaleLista) * 100)}% DEL TOTALE · +${p.totali.nuovi24h} IN 24H` : undefined} />
        <Riquadro etichetta="Entrati dai PR" valore={p.totali.entrati} colore="text-ok" nota={p.totali.resa != null ? `RESA ${p.totali.resa}%` : 'LA PORTA NON È ANCORA APERTA'} />
        <Riquadro etichetta="Da ritirare dai PR" valore={euro(p.totali.daRitirare)} colore={p.totali.daRitirare ? 'text-attesa' : undefined}
          nota={`${euro(p.totali.consegnato)} GIÀ CONSEGNATI`} />
        <Riquadro etichetta="Senza PR" valore={p.diretta.inLista} nota={<Link href={`/gestione/canali${q}`} className="text-osso-2">DA SOCIAL E SITO · VEDI CANALI →</Link>} />
      </div>

      <section className="flex flex-col gap-3 px-4 py-6 md:px-10">
        <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Per PR</h2>

        {/* Telefono: una scheda per PR */}
        <div className="flex flex-col md:hidden">
          {p.righe.map((r, i) => (
            <div key={r.pr.id} className={`flex flex-col gap-3 border-t border-linea py-4 ${i === p.righe.length - 1 ? 'border-b' : ''}`}>
            <Link href={`/gestione/pr/${r.pr.handle}${q}`} className="flex flex-col gap-3 text-osso no-underline hover:text-osso">
              <div className="flex items-center gap-3">
                <span className="w-7 font-display text-[28px] font-black leading-none text-osso-3">{i + 1}</span>
                <span className="flex-grow font-display text-[22px] font-extrabold uppercase leading-none">{r.pr.nomeDisplay}</span>
                {r.pr.stato === 'sospeso' && <span className="mm-chip mm-chip--annullato">Sospeso</span>}
                <span className="font-mono text-[20px] text-arancio" aria-hidden="true">→</span>
              </div>
              <div className="grid grid-cols-4 gap-2 font-mono text-[11px] text-osso-2">
                <span><b className="block font-display text-[24px] font-black text-osso">{r.inLista}</b>LISTA</span>
                <span><b className="block font-display text-[24px] font-black text-arancio">+{r.nuovi24h}</b>24H</span>
                <span><b className="block font-display text-[24px] font-black text-ok">{r.entrati}</b>ENTRATI</span>
                <span><b className={`block font-display text-[24px] font-black ${r.daRitirare ? 'text-attesa' : 'text-osso'}`}>{euro(r.daRitirare)}</b>DA RITIRARE</span>
              </div>
              <Resa valore={r.resa} />
              <span className="font-mono text-[10px] text-osso-3">ULTIMA ATTIVITÀ: {r.ultimaAttivita ? quandoRelativo(r.ultimaAttivita) : 'NESSUNA'}{r.consegnato ? ` · CONSEGNATI ${euro(r.consegnato)}` : ''}</span>
            </Link>
            <ConfermaConsegna prId={r.pr.id} prNome={r.pr.nomeDisplay} eventoId={p.evento?.id ?? null} serata={nomeSerata} importo={r.daRitirare} compatto />
            </div>
          ))}
        </div>

        {/* Desktop: tabella */}
        <div className="mm-scroll hidden md:block">
          <table className="mm-classifica">
            <thead>
              <tr>
                <th>#</th><th>PR</th><th className="mm-num">In lista</th><th className="mm-num">24h</th><th className="mm-num">Entrati</th>
                <th style={{ width: '18%' }}>Resa</th><th className="mm-num">Pagati al PR</th><th className="mm-num">Da ritirare</th><th className="mm-num">Consegnato</th><th className="mm-num">Annullati</th><th>Ultima attività</th><th />
              </tr>
            </thead>
            <tbody>
              {p.righe.map((r, i) => (
                <tr key={r.pr.id} style={r.pr.stato === 'sospeso' ? { opacity: 0.6 } : undefined}>
                  <td className="mm-classifica__pos">{i + 1}</td>
                  <td>
                    <Link href={`/gestione/pr/${r.pr.handle}${q}`} className="mm-classifica__nome no-underline">{r.pr.nomeDisplay}</Link>
                    {r.pr.stato === 'sospeso' && <span className="mm-chip mm-chip--annullato ml-2">Sospeso</span>}
                    {r.email && <div className="mt-1 font-mono text-[11px] text-osso-3">{r.email}</div>}
                  </td>
                  <td className="mm-num">{r.inLista}</td>
                  <td className="mm-num text-arancio">+{r.nuovi24h}</td>
                  <td className="mm-num">{r.entrati}</td>
                  <td><Resa valore={r.resa} /></td>
                  <td className="mm-num">{r.pagatiAlPr}</td>
                  <td className={`mm-num ${r.daRitirare ? 'text-attesa' : ''}`}>{euro(r.daRitirare)}</td>
                  <td className="mm-num text-ok">{euro(r.consegnato)}</td>
                  <td className="mm-num">{r.annullati}</td>
                  <td className="whitespace-nowrap font-mono text-[11px] text-osso-2">{r.ultimaAttivita ? quandoRelativo(r.ultimaAttivita) : '—'}</td>
                  <td><ConfermaConsegna prId={r.pr.id} prNome={r.pr.nomeDisplay} eventoId={p.evento?.id ?? null} serata={nomeSerata} importo={r.daRitirare} compatto /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[13px] leading-5 text-osso-3">
          &quot;Da ritirare&quot;: soldi che i clienti hanno già dato al PR prima della serata (il PR li ha segnati come pagati). Quando il PR te li dà, tocca &quot;Ricevuti&quot;: resta registrato chi li ha presi e quando.
          {p.admin ? ' Per sospendere o aggiungere un PR vai su Admin → PR.' : ''}
        </p>
      </section>
    </>
  );
}
