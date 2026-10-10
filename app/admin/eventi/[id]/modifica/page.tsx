import Link from 'next/link';
import { notFound } from 'next/navigation';
import { richiedi } from '@/lib/sessione';
import { eventoAdmin } from '@/lib/dati/admin';
import { dataIso, euro, ora } from '@/lib/formato';
import { TestataAdmin } from '@/components/admin/ui';
import { FormSerata } from '@/components/admin/form-serata';
import { Lotti } from '@/components/admin/lotti';
import { Tavoli } from '@/components/admin/tavoli';

export const metadata = { title: 'Modifica serata' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ salvato?: string }> };
const locale = (iso: string | null) => (iso ? `${dataIso(iso)}T${ora(iso)}` : '');

export default async function ModificaSerata({ params, searchParams }: Props) {
  const { id } = await params;
  const s = await richiedi(['admin'], `/admin/eventi/${id}/modifica`);
  const x = await eventoAdmin(s, id);
  if (!x) notFound();
  const e = x.evento;
  const { salvato } = await searchParams;
  return (
    <>
      <TestataAdmin briciole={`SERATE / ${e.slug}`} titolo={e.nome}
        chip={<span className={`mm-chip ${e.pubblicato ? 'mm-chip--entrato' : 'mm-chip--incassare'}`}>{e.pubblicato ? 'Pubblicata' : 'Bozza'}</span>}
        sotto={salvato ? 'SALVATA ✓' : undefined}
        azioni={<><a className="mm-btn mm-btn--muto" href="#lotti">Lotti</a><a className="mm-btn mm-btn--muto" href="#tavoli">Tavoli</a><Link className="mm-btn mm-btn--muto" href={`/admin/eventi/${e.id}`}>Serata live</Link><Link className="mm-btn mm-btn--muto" href={`/e/${e.slug}`} target="_blank">Vedi pagina</Link></>} />
      <FormSerata key={e.updatedAt} pr={x.pr.map((p) => ({ id: p.id, nome: p.nomeDisplay, stato: p.stato }))} v={{
        id: e.id, numero: e.numero == null ? '' : String(e.numero), nome: e.nome, slug: e.slug,
        giorno: dataIso(e.data), apertura: ora(e.data), chiusura: e.dataFine ? ora(e.dataFine) : '',
        lineup: e.lineup.join('\n'), highlight: e.highlight ?? '', dressCode: e.dressCode ?? '', descrizione: e.descrizione ?? '',
        location: e.location ?? '', comune: e.comune ?? '', lat: e.lat == null ? '' : String(e.lat), lng: e.lng == null ? '' : String(e.lng),
        locationSegreta: e.locationSegreta, infoArrivo: e.infoArrivo ?? '',
        tipoIngresso: e.tipoIngresso === 'libero' ? 'libero' : 'lista', prezzoLista: String(e.prezzoLista), prezzoCassa: e.prezzoCassa == null ? '' : String(e.prezzoCassa), etaMinima: String(e.etaMinima),
        locandinaUrl: e.locandinaUrl ?? '', pubblicato: e.pubblicato, prAbilitati: e.prAbilitati,
      }} />
      <section id="lotti" className="flex scroll-mt-4 flex-col gap-4 border-t border-linea px-4 py-8 md:px-12">
        <div className="flex flex-col gap-[6px]">
          <span className="font-mono text-[11px] text-arancio">05</span>
          <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Lotti</h2>
          <span className="text-[14px] text-osso-2">Si prende il primo lotto aperto, con posti liberi, nell&apos;ordine qui sotto. Il prezzo si paga alla porta.</span>
        </div>
        <Lotti eventoId={e.id} lotti={x.lotti.map((l) => ({
          id: l.id, nome: l.nome, prezzo: l.prezzo, quantita: l.quantita, usati: x.usati[l.id] ?? 0,
          dataInizio: locale(l.dataInizio), dataFine: locale(l.dataFine), visibileDaPr: l.visibileDaPr, ordine: l.ordine,
        }))} />
      </section>
      <section id="tavoli" className="flex scroll-mt-4 flex-col gap-4 border-t border-linea px-4 py-8 md:px-12">
        <div className="flex flex-col gap-[6px]">
          <span className="font-mono text-[11px] text-arancio">06</span>
          <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Tavoli</h2>
          <span className="text-[14px] text-osso-2">Ogni tavolo si prende con una spesa minima. Per ora lo stato lo segni tu: la richiesta da cliente e PR arriva dopo.</span>
          {x.tavoli.length > 0 && (
            <span className="font-mono text-[11px] text-osso-2">
              {x.tavoli.length} TAVOLI · {x.tavoli.filter((t) => t.stato === 'libero').length} LIBERI · {x.tavoli.reduce((n, t) => n + (t.posti ?? 0), 0)} POSTI · {euro(x.tavoli.filter((t) => t.stato === 'riservato' || t.stato === 'confermato').reduce((n, t) => n + t.spesaMinima, 0))} RISERVATI
            </span>
          )}
        </div>
        <Tavoli eventoId={e.id} tavoli={x.tavoli.map((t) => ({
          id: t.id, nome: t.nome, zona: t.zona ?? '', posti: t.posti, spesaMinima: t.spesaMinima, stato: t.stato,
          nota: t.nota ?? '', visibileDaPr: t.visibileDaPr, ordine: t.ordine,
        }))} />
      </section>
    </>
  );
}
