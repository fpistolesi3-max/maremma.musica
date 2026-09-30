import type { Metadata } from 'next';
import { PaginaPrevendita } from '@/components/prevendita';
import { eventoPerSlug } from '@/lib/dati/pubblico';
import { dataPunti } from '@/lib/formato';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string; handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ep = await eventoPerSlug((await params).slug);
  if (!ep) return { title: 'Serata non trovata' };
  return {
    title: `${ep.evento.nome} · ${dataPunti(ep.evento.data)} · Mettiti in lista`,
    openGraph: ep.evento.locandinaUrl ? { images: [ep.evento.locandinaUrl] } : undefined,
    robots: { index: false },
  };
}

/** Link del PR per una serata: /e/[slug]/[handle-pr] → prevendita con la sua Lista bloccata. */
export default async function LinkPr({ params }: Props) {
  const { slug, handle } = await params;
  return <PaginaPrevendita slug={slug} handleDaUrl={handle} />;
}
