import { ChipSerata } from '@/components/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { richiedi } from '@/lib/sessione';
import { serataLive } from '@/lib/dati/admin';
import { canaliSerata } from '@/lib/dati/gestione-pr';
import { dataPunti, euro, giornoSett, numeroEvento, ora, orari } from '@/lib/formato';
import { luogoTesto } from '@/lib/luogo';
import { eventoPassato, testoPrezzoTipi } from '@/lib/regole';
import { MenuAltro, Numero, TestataAdmin } from '@/components/admin/ui';
import { AggiornamentoLive } from '@/components/admin/live';

export const metadata = { title: 'Serata live' };

type Props = { params: Promise<{ id: string }> };

/** Serata in corso (mockup Admin · serata in corso): ingressi, incasso, PR e porte in tempo reale. */
export default async function SerataLive({ params }: Props) {
  const { id } = await params;
  const s = await richiedi(['admin'], `/admin/eventi/${id}`);
  const l = await serataLive(s, id);
  if (!l) notFound();
  const canali = await canaliSerata(s, id);
  const e = l.evento;
  const max = Math.max(1, ...l.perMezzora.map((x) => x.n));
  const adesso = Date.now();
  const inCorso = new Date(e.data).getTime() - 2 * 3_600_000 < adesso && !eventoPassato(e);

  return (
    <>
      <TestataAdmin
        briciole={`SERATE / ${e.numero ? numeroEvento(e.numero) : e.slug}`}
        titolo={e.nome}
        chip={<ChipSerata pubblicata={e.pubblicato} inCorso={inCorso} testo={inCorso ? 'Porta aperta · live' : e.pubblicato ? 'Lista aperta' : undefined} />}
        sotto={`${giornoSett(e.data)} ${dataPunti(e.data)} · ${luogoTesto(e).toUpperCase()} · ${orari(e.data, e.dataFine)} · ${e.tipoIngresso === 'libero' ? 'INGRESSO LIBERO' : `PREVENDITA ${testoPrezzoTipi(l.prezzoTipi, e.prezzoLista).toUpperCase()} ONLINE${l.prevenditaFinoAlle ? ` · VALIDA FINO ALLE ${ora(l.prevenditaFinoAlle)}` : ''}`}`}
        azioni={<>
          <Link className="mm-btn mm-btn--primario" href={`/admin/eventi/${e.id}/modifica`}>Modifica serata</Link>
          <MenuAltro>
            <Link href={`/admin/eventi/${e.id}/duplica`}>Duplica serata</Link>
            <Link href={`/admin/iscrizioni?evento=${e.id}`}>Tutte le vendite</Link>
            <a href={`/api/admin/csv/${e.id}`}>Esporta CSV</a>
            {e.senzaTelefono && <Link href={`/admin/eventi/${e.id}/lista`}>Lista da stampare</Link>}
          </MenuAltro>
        </>}
      />
      <section aria-label="Entrati" className="flex flex-col gap-3 border-b border-linea px-4 py-6 md:px-12">
        {l.conteggio.dopoLimite && l.prevenditaFinoAlle && (
          <span className="font-mono text-[12px] font-semibold leading-4 tracking-[.04em] text-attesa">DALLE {ora(l.prevenditaFinoAlle)} LE PREVENDITE NON VALGONO PIÙ</span>
        )}
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-etichetta text-osso-2">ENTRATI</span>
            <span className="font-display text-[72px] font-black leading-[.85] text-ok md:text-[96px]">{l.conteggio.entrati}</span>
          </div>
          {l.capienza != null && l.conteggio.liberi != null && (
            l.conteggio.dopoLimite ? (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-etichetta text-osso-2">PUOI FAR ENTRARE ANCORA</span>
                <span className="font-display text-[72px] font-black leading-[.85] text-arancio md:text-[96px]">{l.conteggio.liberi}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-etichetta text-osso-2">CAPIENZA {l.capienza} · LIBERI</span>
                <span className="font-display text-[72px] font-black leading-[.85] md:text-[96px]">{l.conteggio.liberi}</span>
              </div>
            )
          )}
        </div>
        {l.capienza != null && l.conteggio.dopoLimite && <span className="font-mono text-[12px] leading-4 text-osso-2">CAPIENZA {l.capienza} · ENTRATI {l.conteggio.entrati} · LIBERI {l.conteggio.liberi}</span>}
        <span className="font-mono text-[11px] leading-4 text-osso-3">
          ENTRATI = SCAN DI PREVENDITE E TAVOLI{!l.conteggio.dopoLimite && l.conteggio.attesi > 0 ? ` · ATTESI ANCORA FUORI ${l.conteggio.attesi}` : ''}. GLI INGRESSI PAGATI ALLA PORTA{l.prevenditaFinoAlle ? ` DOPO LE ${ora(l.prevenditaFinoAlle)}` : ''} SONO FUORI DAL SITO E NON SI CONTANO.
        </span>
      </section>
      <div className="grid grid-cols-2 border-b border-linea lg:grid-cols-4">
        <Numero etichetta="In lista" valore={String(l.inLista)} />
        <Numero etichetta="Entrati" valore={String(l.entrati)} colore="text-ok"
          nota={`${l.entratiDaLista} DALLA LISTA${l.inLista ? ` (${Math.round((l.entratiDaLista / l.inLista) * 100)}%)` : ''}${l.portaStorico.ingressi ? ` · ${l.portaStorico.ingressi} ALLA PORTA (STORICO)` : ''}`} bordo />
        <Numero etichetta="Incassato" valore={euro(l.incassato)} nota={`${euro(l.prevendita.incassato)} PREVENDITA ONLINE${l.portaStorico.ingressi ? ` · ${euro(l.portaStorico.incassato)} ALLA PORTA (STORICO)` : ''}`} bordo />
        <Numero etichetta="Ancora fuori" valore={String(l.fuori)} nota={l.prevendita.inAttesa ? `DELLA LISTA · ${l.prevendita.inAttesa} STANNO PAGANDO` : 'DELLA LISTA'} bordo />
      </div>
      {l.rimborsi.n > 0 && (
        <Link href={`/admin/rimborsi?evento=${e.id}`} className="mx-4 mt-4 block border border-attesa px-4 py-3 text-[14px] text-attesa no-underline md:mx-12">
          {l.rimborsi.n === 1 ? '1 pagamento da restituire' : `${l.rimborsi.n} pagamenti da restituire`}: {euro(l.rimborsi.importo)} (arrivati quando non valevano, doppi o con importo sbagliato). Apri →
        </Link>
      )}
      <section aria-label="Riepilogo della serata" className="flex flex-col gap-3 border-b border-linea px-4 py-6 md:px-12">
        <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Riepilogo</h2>
        <div className="grid grid-cols-2 border border-linea lg:grid-cols-4">
          <Numero etichetta="Incassato lordo" valore={euro(l.soldi.lordo)} nota={`${euro(l.soldi.prevendite)} PREVENDITE · ${euro(l.soldi.tavoli)} TAVOLI${l.soldi.porta ? ` · ${euro(l.soldi.porta)} PORTA (STORICO)` : ''}`} />
          <Numero etichetta="Rimborsato" valore={euro(l.soldi.rimborsato)} colore={l.soldi.rimborsato ? 'text-attesa' : undefined} nota="GIÀ RESTITUITO AI CLIENTI" bordo />
          <Numero etichetta="Netto" valore={euro(l.soldi.netto)} colore="text-ok" nota={l.soldi.daRestituire ? `DI CUI ${euro(l.soldi.daRestituire)} ANCORA DA RESTITUIRE` : 'LORDO MENO RIMBORSI'} bordo />
          <Numero etichetta="Tavoli pagati" valore={`${l.tavoli.pagati}/${l.tavoli.totale}`} nota={`${euro(l.tavoli.incassato)} INCASSATI`} bordo />
        </div>
        <div className="grid grid-cols-2 border border-linea lg:grid-cols-4">
          <Numero etichetta="Prevendite vendute" valore={String(l.inLista)} nota={l.perTipo.length > 0 ? l.perTipo.map((t) => `${t.nome.toUpperCase()} ${t.venduti}`).join(' · ') : undefined} />
          <Numero etichetta="Entrati alla porta" valore={String(l.entrati)} colore="text-ok" nota={`${l.entratiDaLista} DA PREVENDITE${l.tavoli.totale > 0 ? ` · ${l.tavoli.entrati} PERSONE DAI TAVOLI` : ''}`} bordo />
        </div>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-9 px-4 py-7 md:px-12">
          <section className="flex flex-col gap-[14px]">
            <div className="flex items-baseline justify-between">
              <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Ingressi ogni mezz&apos;ora</h2>
              <span className="font-mono text-[11px] text-osso-2">ORA {ora(new Date().toISOString())}</span>
            </div>
            <div className="grid h-[160px] items-end gap-2 md:gap-3" style={{ gridTemplateColumns: `repeat(${l.perMezzora.length}, minmax(0, 1fr))` }} role="img"
              aria-label={`Ingressi per mezz'ora: ${l.perMezzora.map((x) => `${ora(x.da)} ${x.n}`).join(', ')}`}>
              {l.perMezzora.map((x) => {
                const corrente = adesso >= new Date(x.da).getTime() && adesso < new Date(x.da).getTime() + 1_800_000;
                return (
                  <div key={x.da} className="flex h-full flex-col items-center justify-end gap-[6px]">
                    <span className={`font-mono text-[10px] leading-3 ${corrente ? 'text-arancio' : 'text-osso-3'}`}>{x.n || ''}</span>
                    <div className={`w-full ${x.n ? (corrente ? 'bg-arancio' : 'bg-barra') : 'bg-notte-3'}`} style={{ height: `${Math.max(2, (x.n / max) * 100)}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="grid gap-2 font-mono text-[10px] text-osso-3 md:gap-3" style={{ gridTemplateColumns: `repeat(${l.perMezzora.length}, minmax(0, 1fr))` }}>
              {l.perMezzora.map((x, i) => <span key={x.da} className="text-center">{i % 2 === 0 ? ora(x.da) : ''}</span>)}
            </div>
          </section>

          {l.tavoli.totale > 0 && (
            <section className="flex flex-col gap-[10px]">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Tavoli</h2>
                <span className="flex gap-x-5"><a href={`/api/admin/csv-tavoli/${e.id}`} className="link-sottolineato whitespace-nowrap py-2">CSV</a><a href={`/admin/eventi/${e.id}/modifica#tavoli`} className="link-sottolineato whitespace-nowrap py-2">Gestisci i tavoli →</a></span>
              </div>
              <div className="grid grid-cols-2 border border-linea md:grid-cols-4">
                <Numero etichetta="Pagati" valore={`${l.tavoli.pagati}/${l.tavoli.totale}`} colore="text-ok" nota={`${l.tavoli.entrati}/${l.tavoli.persone} PERSONE ENTRATE`} />
                <Numero etichetta="Incassato tavoli" valore={euro(l.tavoli.incassato)} nota="PAGATO IN ANTICIPO" bordo />
                <Numero etichetta="In attesa" valore={String(l.tavoli.inAttesa)} colore={l.tavoli.inAttesa ? 'text-attesa' : undefined} nota={`${euro(l.tavoli.atteso)} DA INCASSARE`} bordo />
                <Numero etichetta="Liberi" valore={String(l.tavoli.liberi)} nota="ANCORA DA VENDERE" bordo />
              </div>
              {l.tavoli.perLista.length > 0 && (
                <div className="mm-scroll">
                  <table className="mm-classifica mm-schede">
                    <thead><tr><th>Lista</th><th className="mm-num">Pagati</th><th className="mm-num">Incassato</th><th className="mm-num">In attesa</th><th className="mm-num">Da incassare</th></tr></thead>
                    <tbody>
                      {l.tavoli.perLista.map((r) => (
                        <tr key={r.prId ?? 'mm'}>
                          <td className="mm-pieno mm-classifica__nome">{r.nome}</td>
                          <td data-et="Pagati" className="mm-num">{r.pagati}</td>
                          <td data-et="Incassato" className="mm-num">{euro(r.incassato)}</td>
                          <td data-et="In attesa" className="mm-num">{r.inAttesa}</td>
                          <td data-et="Da incassare" className="mm-num">{euro(r.atteso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <span className="text-[13px] text-osso-3">L&apos;incasso dei tavoli è a parte: non entra in &quot;Incassato&quot; qui sopra, che conta le prevendite online.</span>
            </section>
          )}

          <section className="flex flex-col gap-[10px]">
            <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">PR della serata</h2>
            <div className="mm-scroll">
              <table className="mm-classifica mm-schede">
                <thead><tr><th>#</th><th>PR</th><th className="mm-num">In lista</th><th className="mm-num">Entrati</th><th style={{ width: '30%' }}>Resa</th><th className="mm-num">Online</th></tr></thead>
                <tbody>
                  {l.classifica.map((r, i) => {
                    const resa = r.inLista ? Math.round((r.entrati / r.inLista) * 100) : 0;
                    return (
                      <tr key={r.prId ?? 'mm'}>
                        <td className="mm-pieno mm-classifica__pos">{i + 1}</td>
                        <td className="mm-pieno mm-classifica__nome">{r.nome}</td>
                        <td data-et="In lista" className="mm-num">{r.inLista}</td>
                        <td data-et="Entrati" className="mm-num">{r.entrati}</td>
                        <td data-et="Resa" className="mm-pieno"><div className="flex items-center gap-[10px]"><div className="mm-barra flex-grow" aria-label={`${resa}%`}><span style={{ width: `${resa}%` }} /></div><span className="w-9 text-right font-mono text-[12px] text-osso-2">{resa}%</span></div></td>
                        <td data-et="Online" className="mm-num">{euro(r.incassato ?? 0)}</td>
                      </tr>
                    );
                  })}
                  {l.classifica.length === 0 && <tr><td colSpan={6} className="text-osso-2">Ancora nessuno in lista.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-[10px]">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Senza PR, per canale</h2>
              <Link href={`/gestione/canali?serata=${e.id}`} className="link-sottolineato whitespace-nowrap py-2">Dettaglio e link →</Link>
            </div>
            <span className="text-[14px] text-osso-2">
              {canali.senzaPr.numeri.inLista} in lista e {canali.senzaPr.numeri.entrati} entrati senza passare da un PR.
            </span>
            <div className="mm-scroll">
              <table className="mm-classifica mm-schede">
                <thead><tr><th>Canale</th><th className="mm-num">In lista</th><th className="mm-num">Quota</th><th className="mm-num">Entrati</th><th style={{ width: '30%' }}>Resa</th></tr></thead>
                <tbody>
                  {canali.senzaPr.canali.map((r) => {
                    const resa = r.inLista ? Math.round((r.entrati / r.inLista) * 100) : 0;
                    return (
                      <tr key={r.canale}>
                        <td className="mm-pieno mm-classifica__nome">{r.etichetta}</td>
                        <td data-et="In lista" className="mm-num">{r.inLista}</td>
                        <td data-et="Quota" className="mm-num">{r.quota}%</td>
                        <td data-et="Entrati" className="mm-num">{r.entrati}</td>
                        <td data-et="Resa" className="mm-pieno"><div className="flex items-center gap-[10px]"><div className="mm-barra flex-grow" aria-label={`${resa}%`}><span style={{ width: `${resa}%` }} /></div><span className="w-9 text-right font-mono text-[12px] text-osso-2">{resa}%</span></div></td>
                      </tr>
                    );
                  })}
                  {canali.senzaPr.canali.length === 0 && <tr><td colSpan={5} className="text-osso-2">Nessuno, per ora.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {l.rifiuti.length > 0 && (
            <section className="flex flex-col gap-[10px]">
              <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Rifiutati alla porta</h2>
              <span className="text-[14px] text-osso-2">La categoria non rispettata: l&apos;iscrizione resta valida, decidi tu se rimborsare (da <Link href={`/admin/iscrizioni?evento=${e.id}`} className="link-sottolineato">Iscrizioni</Link>).</span>
              <div className="mm-scroll">
                <table className="mm-classifica mm-schede">
                  <thead><tr><th>Persona</th><th>Categoria</th><th>Alle</th><th>Porta</th><th>Da</th></tr></thead>
                  <tbody>
                    {l.rifiuti.map((r) => (
                      <tr key={r.id}>
                        <td className="mm-pieno mm-classifica__nome">{r.nome}{r.entrato && <span className="text-osso-2"> · poi entrato</span>}</td>
                        <td data-et="Categoria">{r.categoria ?? '—'}</td>
                        <td data-et="Alle" className="mm-num">{ora(r.ora)}</td>
                        <td data-et="Porta">{r.porta}</td>
                        <td data-et="Da" className="text-[13px]">{r.da}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {l.perTipo.length > 0 && (
            <section className="flex flex-col gap-[10px]">
              <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Per tipo di prevendita</h2>
              <div className="mm-scroll">
                <table className="mm-classifica mm-schede">
                  <thead><tr><th>Tipo</th><th>Categoria</th><th className="mm-num">Venduti</th><th className="mm-num">Posti</th><th className="mm-num">Entrati</th><th className="mm-num">Incassato</th></tr></thead>
                  <tbody>
                    {l.perTipo.map((t) => (
                      <tr key={t.id}>
                        <td className="mm-pieno mm-classifica__nome">{t.nome}</td>
                        <td data-et="Categoria">{t.categoria ?? '—'}</td>
                        <td data-et="Venduti" className="mm-num">{t.venduti}</td>
                        <td data-et="Posti" className="mm-num">{t.posti ?? '∞'}</td>
                        <td data-et="Entrati" className="mm-num">{t.entrati}</td>
                        <td data-et="Incassato" className="mm-num">{euro(t.incassato)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-[14px] border-t border-linea bg-[#0a0d11] p-4 md:p-7 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Ultimi ingressi</h2>
            <AggiornamentoLive aggiornatoAt={l.aggiornatoAt} />
          </div>
          <div className="flex flex-col border-b border-linea">
            {l.ultimi.map((u) => (
              <div key={u.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-linea py-3">
                <span className="font-mono text-[12px] text-osso-2">{ora(u.ora)}</span>
                <div className="flex min-w-0 flex-col gap-[3px]"><span className="text-[15px] font-medium leading-5">{u.nome}</span><span className="font-mono text-[10px] leading-3 text-osso-3">{u.lista.toUpperCase()}</span></div>
                <span className="font-mono text-[11px] text-osso-2">{u.porta ?? ''}</span>
              </div>
            ))}
            {l.ultimi.length === 0 && <p className="border-t border-linea py-4 text-[14px] text-osso-2">Nessun ingresso, per ora.</p>}
          </div>
          <div className="mt-auto flex flex-col gap-[10px] border-t border-linea pt-[14px]">
            <span className="text-[11px] font-semibold leading-[14px] tracking-etichetta text-osso-2">STAFF PORTA</span>
            {l.porte.map((p) => {
              const minuti = Math.round((adesso - new Date(p.ultimoSync).getTime()) / 60_000);
              const online = minuti < 1;
              return (
                <div key={p.nome} className="flex justify-between text-[15px] font-medium leading-5">
                  <span>{p.nome}</span>
                  <span className={`font-mono text-[11px] leading-5 ${online ? 'text-ok' : 'text-attesa'}`}>{online ? 'ONLINE' : `OFFLINE DA ${minuti} MIN`} · {p.ingressi}</span>
                </div>
              );
            })}
            {l.porte.length === 0 && <span className="text-[14px] text-osso-2">Nessuna porta collegata. Lo staff apre /door dal telefono.</span>}
          </div>
        </aside>
      </div>
    </>
  );
}
