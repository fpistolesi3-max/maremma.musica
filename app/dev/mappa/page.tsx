import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ComeArrivare, type VarianteMappa } from '@/components/come-arrivare';
import { eventoPerSlug } from '@/lib/dati/pubblico';
import { modalitaProva } from '@/lib/prova';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mappa: proposte', robots: { index: false } };

const VARIANTI: { v: VarianteMappa; nome: string }[] = [
  { v: 'attuale', nome: 'Attuale' }, { v: '1', nome: '1 · Locandina' }, { v: '2', nome: '2 · Cartina' }, { v: '3', nome: '3 · Le due insieme' },
];
const LUOGHI = [
  { chiave: 'scirea', nome: 'Campo G. Scirea', q: '' },
  { chiave: 'eleonora', nome: 'Tenuta Eleonora di Toledo', q: 'lat=43.0179&lng=10.6278&luogo=Tenuta+Eleonora+di+Toledo&comune=Campiglia+Marittima' },
  { chiave: 'fuori', nome: 'Fuori zona (Firenze)', q: 'lat=43.7696&lng=11.2558&luogo=Piazzale+Michelangelo&comune=Firenze' },
];

/**
 * Proposte per la mappa di "Come arrivare": /dev/mappa?variante=1|2|3&slug=...
 * Usa la sezione vera della pagina serata. Con `lat`, `lng`, `luogo` e `comune` si sposta la serata altrove per provare.
 * Solo in sviluppo (come /dev/posta).
 */
export default async function ProposteMappa({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!modalitaProva()) notFound();
  const q = await searchParams;
  const variante = VARIANTI.find((x) => x.v === q.variante)?.v ?? '1';
  const ep = await eventoPerSlug(q.slug ?? 'ricky-le-roy-monteverdi');
  if (!ep) notFound();
  const lat = Number(q.lat), lng = Number(q.lng);
  const sposta = q.lat && q.lng && Number.isFinite(lat) && Number.isFinite(lng);
  const e = { ...ep.evento, locationSegreta: false, ...(sposta ? { lat, lng, location: q.luogo ?? null, comune: q.comune ?? null } : {}) };
  const coordinate = e.lat != null && e.lng != null ? `${e.lat.toFixed(4)} N ${e.lng.toFixed(4)} E` : null;
  const luogoQuery = (chiave: string) => LUOGHI.find((l) => l.chiave === chiave)?.q ?? '';
  const attivo = LUOGHI.find((l) => l.q && l.q === `lat=${q.lat}&lng=${q.lng}&luogo=${(q.luogo ?? '').replaceAll(' ', '+')}&comune=${(q.comune ?? '').replaceAll(' ', '+')}`)?.chiave ?? 'scirea';
  const href = (v: string, chiave: string) => `/dev/mappa?variante=${v}${luogoQuery(chiave) ? `&${luogoQuery(chiave)}` : ''}${q.slug ? `&slug=${q.slug}` : ''}`;

  return (
    <div>
      <div className="contenitore flex flex-col gap-3 border-b border-linea py-4">
        <span className="font-mono text-[11px] text-arancio">✦ SOLO SVILUPPO</span>
        <nav className="flex flex-wrap gap-2 font-mono text-[11px]">
          {VARIANTI.map((x) => <Link key={x.v} href={href(x.v, attivo)} className={`border px-3 py-2 no-underline ${x.v === variante ? 'border-arancio text-arancio' : 'border-linea text-osso-2'}`}>{x.nome}</Link>)}
        </nav>
        <nav className="flex flex-wrap gap-2 font-mono text-[11px]">
          {LUOGHI.map((l) => <Link key={l.chiave} href={href(variante, l.chiave)} className={`border px-3 py-2 no-underline ${l.chiave === attivo ? 'border-osso text-osso' : 'border-linea text-osso-2'}`}>{l.nome}</Link>)}
        </nav>
      </div>
      <div className="pt-8">
        <ComeArrivare e={e} coordinate={coordinate} variante={variante} visibile />
      </div>
    </div>
  );
}
