import type { Metadata } from 'next';
import { PaginaPrevendita } from '@/components/prevendita';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mettiti in lista', robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pr?: string }> };

/** /e/[slug]/prevendita?pr=[handle-pr] */
export default async function Prevendita({ params, searchParams }: Props) {
  const { slug } = await params;
  const { pr } = await searchParams;
  return <PaginaPrevendita slug={slug} handleDaUrl={pr ?? null} />;
}
