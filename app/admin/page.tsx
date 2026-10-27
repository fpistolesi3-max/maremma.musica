import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { cruscotto, elencoSerate } from '@/lib/dati/admin';
import { euro, dataPunti, giornoSett, numeroEvento, orari, parti } from '@/lib/formato';
import { luogoTesto } from '@/lib/luogo';
import { Numero, TestataAdmin } from '@/components/admin/ui';
import { ChipSerata } from '@/components/ui';

export const metadata = { title: 'Serate' };

export default async function AdminSerate() {
  const s = await richiedi(['admin'], '/admin');
  const [serate, c] = await Promise.all([elencoSerate(s), cruscotto(s)]);
  const daFare = [
    c.daRimborsare > 0 && { chiave: 'rimb', testo: `${c.daRimborsare} ${c.daRimborsare === 1 ? 'pagamento da rimborsare' : 'pagamenti da rimborsare'}`, href: '/admin/iscrizioni?stato=da_rimborsare' },
    ...c.tavoliDaRimborsare.map((t) => ({ chiave: `rt-${t.eventoId}`, testo: `${t.n} ${t.n === 1 ? 'tavolo da rimborsare' : 'tavoli da rimborsare'} · ${t.nome}`, href: `/admin/eventi/${t.eventoId}/modifica#tavoli` })),
    ...c.tavoliInAttesa.map((t) => ({ chiave: t.eventoId, testo: `${t.n} ${t.n === 1 ? 'tavolo' : 'tavoli'} in attesa di pagamento · ${t.nome}`, href: `/admin/eventi/${t.eventoId}/modifica#tavoli` })),
  ].filter((x): x is { chiave: string; testo: string; href: string } => Boolean(x));
  const p = c.prossima;
  return (
    <>
      <TestataAdmin briciole="SERATE" titolo="Serate" azioni={<Link href="/admin/eventi/nuovo" className="mm-btn mm-btn--primario">Nuova serata</Link>} />
      {p && (
        <section aria-label="Prossima serata" className="border-b border-linea">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-5 md:px-12">
            <span className="basis-full text-[11px] font-semibold tracking-etichetta text-osso-2 md:basis-auto">PROSSIMA SERATA</span>
            <Link href={`/admin/eventi/${p.evento.id}`} className="font-display text-[22px] font-black uppercase no-underline">{p.evento.nome}</Link>
            <span className="font-mono text-[12px] text-osso-2">{giornoSett(p.evento.data)} {dataPunti(p.evento.data)}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4">
            <Numero etichetta="In lista" valore={String(p.inLista)} nota="SENZA LA CASSA" />
            <Numero etichetta="Entrati" valore={String(p.entrati)} colore="text-ok" nota={p.entratiCassa ? `DI CUI ${p.entratiCassa} IN CASSA` : undefined} bordo />
            <Numero etichetta="Incassato" valore={euro(p.incassato)} />
            <Numero etichetta="Tavoli pagati" valore={String(p.tavoliPagati)} nota={p.tavoliInAttesa ? `${p.tavoliInAttesa} IN ATTESA` : undefined} bordo />
          </div>
        </section>
      )}
      <section aria-label="Da fare" className="flex flex-col gap-2 border-b border-linea px-4 py-5 md:px-12">
        <span className="text-[11px] font-semibold tracking-etichetta text-osso-2">DA FARE</span>
        {daFare.length === 0 && <span className="text-[14px] text-osso-2">Niente in sospeso: nessun rimborso e nessun tavolo da confermare.</span>}
        {daFare.map((x) => (
          <Link key={x.chiave} href={x.href} className="flex items-center justify-between gap-3 border border-linea bg-notte-2 px-4 py-3 text-[15px] no-underline">
            <span><span className="mm-chip mm-chip--incassare mr-3">Da fare</span>{x.testo}</span><span aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
      <div className="px-4 py-6 md:px-12">
        <div className="mm-scroll">
          <table className="mm-classifica mm-schede">
            <thead><tr><th>#</th><th>Serata</th><th>Quando</th><th>Stato</th><th className="mm-num">In lista</th><th className="mm-num">Entrati</th><th /></tr></thead>
            <tbody>
              {serate.map(({ evento: e, inLista, entrati, passata }) => (
                <tr key={e.id}>
                  <td className="mm-pieno font-mono text-[12px] text-osso-2">{numeroEvento(e.numero)}</td>
                  <td className="mm-pieno">
                    <Link href={`/admin/eventi/${e.id}`} className="mm-classifica__nome no-underline">{e.nome}</Link>
                    <div className="mt-1 font-mono text-[11px] text-osso-2">{luogoTesto(e)}</div>
                  </td>
                  <td data-et="Quando" className="whitespace-nowrap font-mono text-[12px]">{giornoSett(e.data)} {dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)}<div className="text-osso-2">{orari(e.data, e.dataFine)}</div></td>
                  <td data-et="Stato">
                    <ChipSerata pubblicata={e.pubblicato} passata={passata} />
                    {e.inCopertina && <span className="mm-chip mm-chip--libero ml-2">Copertina</span>}
                  </td>
                  <td data-et="In lista" className="mm-num">{inLista}</td>
                  <td data-et="Entrati" className="mm-num">{entrati}</td>
                  <td className="mm-pieno whitespace-nowrap md:text-right">
                    <Link href={`/admin/eventi/${e.id}`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Live</Link>
                    <Link href={`/admin/eventi/${e.id}/modifica`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Modifica</Link>
                    {/* <a> e non <Link>: con il caricamento normale il browser scende da solo alla sezione */}
                    <a href={`/admin/eventi/${e.id}/modifica#tavoli`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Tavoli</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
