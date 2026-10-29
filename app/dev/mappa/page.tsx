import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eventoPerSlug, locationVisibile } from '@/lib/dati/pubblico';
import type { Evento } from '@/lib/dati/tipi';
import { modalitaProva } from '@/lib/prova';
import { ComeArrivare } from '@/components/come-arrivare';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mappa · prova', robots: { index: false } };

/** Le serate di prova per la mappa: la base è "Ricky Le Roy" dei dati di prova, cambiano solo il posto e la visibilità. */
const CASI: Record<string, { nome: string; cambia: Partial<Evento> }> = {
  eleonora: { nome: 'Tenuta Eleonora di Toledo', cambia: { location: 'Tenuta Eleonora di Toledo', comune: 'Campiglia M.ma', lat: 43.0179, lng: 10.6278, infoArrivo: 'Via di Bandita 6/D, Campiglia Marittima. Si parcheggia dentro la tenuta.' } },
  scirea: { nome: 'Campo G. Scirea', cambia: {} },
  milano: { nome: 'Milano', cambia: { location: 'Magazzini Generali', comune: 'Milano', lat: 45.4441, lng: 9.1967, infoArrivo: 'Via Pietrasanta 16, Milano. Metro M3 Lodi T.I.B.B. o Porta Romana.' } },
  fuori: { nome: 'Fuori Maremma (Firenze)', cambia: { location: 'Viper Theatre', comune: 'Firenze', lat: 43.7993, lng: 11.2010 } },
  segreta: { nome: 'Location segreta', cambia: { locationSegreta: true, data: '2027-06-20T22:00:00+02:00' } },
  senza: { nome: 'Senza coordinate', cambia: { lat: null, lng: null } },
};
const ZOOM: Record<string, number | undefined> = { zona: undefined, paese: 12, strada: 14 };

/** La sezione "Come arrivare" vera con serate di prova (Maremma, Milano, Firenze, location segreta, senza coordinate) e tre livelli di zoom. Solo sviluppo. */
export default async function ProvaMappaUnica({ searchParams }: { searchParams: Promise<{ slug?: string; zoom?: string; nudo?: string }> }) {
  if (!modalitaProva()) notFound();
  const q = await searchParams;
  const caso = q.slug ?? 'eleonora';
  const base = await eventoPerSlug(CASI[caso] ? 'ricky-le-roy-monteverdi' : caso);
  if (!base) notFound();
  const e: Evento = { ...base.evento, ...CASI[caso]?.cambia };
  const visibile = locationVisibile(e);
  const coordinate = visibile && e.lat != null && e.lng != null ? `${e.lat.toFixed(4)} N ${e.lng.toFixed(4)} E` : null;
  const zoom = q.zoom ? (q.zoom in ZOOM ? ZOOM[q.zoom] : Number(q.zoom) || undefined) : undefined;
  const link = (cambia: Record<string, string>) => `/dev/mappa?${new URLSearchParams({ slug: caso, ...(q.zoom ? { zoom: q.zoom } : {}), ...cambia })}`;
  const scelta = (attivo: boolean) => `border px-2 py-1 no-underline ${attivo ? 'border-arancio text-arancio' : 'border-linea text-osso-2'}`;

  return (
    <div className="flex min-h-dvh flex-col gap-6 pt-6">
      {!q.nudo && (
        <div className="contenitore flex flex-col gap-2 font-mono text-[11px]">
          <span className="text-arancio">✦ SOLO SVILUPPO · MAPPA DI COME ARRIVARE</span>
          <div className="flex flex-wrap gap-2">{Object.entries(CASI).map(([k, c]) => <a key={k} href={link({ slug: k })} className={scelta(k === caso)}>{c.nome}</a>)}</div>
          <div className="flex flex-wrap gap-2">{Object.keys(ZOOM).map((z) => <a key={z} href={link({ zoom: z })} className={scelta((q.zoom ?? 'zona') === z)}>{z}</a>)}</div>
        </div>
      )}
      <ComeArrivare e={e} coordinate={coordinate} visibile={visibile} zoom={zoom} />
    </div>
  );
}
