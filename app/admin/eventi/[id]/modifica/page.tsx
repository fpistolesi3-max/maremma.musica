import Link from 'next/link';
import { notFound } from 'next/navigation';
import { richiedi } from '@/lib/sessione';
import { eventoAdmin } from '@/lib/dati/admin';
import { dataIso, euro, ora } from '@/lib/formato';
import { TestataAdmin } from '@/components/admin/ui';
import { FormSerata } from '@/components/admin/form-serata';
import { Lotti } from '@/components/admin/lotti';
import { Tavoli } from '@/components/admin/tavoli';
import { MappaTavoli } from '@/components/admin/mappa-tavoli';
import { Sezione } from '@/components/admin/sezione';

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
      <div className="border-b border-linea px-4 md:px-12">
        <Sezione id="lotti" n="05" titolo="Lotti" nota={`${x.lotti.length} ${x.lotti.length === 1 ? 'LOTTO' : 'LOTTI'}`}>
          <span className="text-[14px] text-osso-2">Si prende il primo lotto aperto, con posti liberi, nell&apos;ordine qui sotto. Il prezzo si paga alla porta.</span>
          <Lotti eventoId={e.id} lotti={x.lotti.map((l) => ({
            id: l.id, nome: l.nome, prezzo: l.prezzo, quantita: l.quantita, usati: x.usati[l.id] ?? 0,
            dataInizio: locale(l.dataInizio), dataFine: locale(l.dataFine), visibileDaPr: l.visibileDaPr, ordine: l.ordine,
          }))} />
        </Sezione>
        <Sezione id="tavoli" n="06" titolo="Tavoli" nota={x.tavoli.length === 0 ? 'NESSUN TAVOLO' : (
          <>{x.tavoli.length} TAVOLI · {x.tavoli.filter((t) => t.stato === 'libero').length} LIBERI · {x.tavoli.reduce((n, t) => n + (t.posti ?? 0), 0)} POSTI · {euro(x.tavoli.filter((t) => t.stato === 'riservato' || t.stato === 'confermato').reduce((n, t) => n + t.spesaMinima, 0))} RISERVATI</>
        )}>
          <span className="text-[14px] text-osso-2">Ogni tavolo si prende con una spesa minima. Per ora lo stato lo segni tu: la richiesta da cliente e PR arriva dopo.</span>
          <MappaTavoli eventoId={e.id} piantinaUrl={e.piantinaUrl} tavoli={x.tavoli.map((t) => ({
            id: t.id, nome: t.nome, zona: t.zona ?? '', posti: t.posti, spesaMinima: t.spesaMinima, stato: t.stato, x: t.x, y: t.y,
          }))} />
          <Tavoli eventoId={e.id} tavoli={x.tavoli.map((t) => ({
            id: t.id, nome: t.nome, zona: t.zona ?? '', posti: t.posti, spesaMinima: t.spesaMinima, stato: t.stato,
            nota: t.nota ?? '', visibileDaPr: t.visibileDaPr, ordine: t.ordine,
          }))} />
        </Sezione>
      </div>
    </>
  );
}
