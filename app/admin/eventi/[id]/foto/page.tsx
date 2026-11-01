import Link from 'next/link';
import { notFound } from 'next/navigation';
import { richiedi } from '@/lib/sessione';
import { fotoAdmin } from '@/lib/dati/foto';
import { dataPunti, numeroEvento } from '@/lib/formato';
import { TestataAdmin } from '@/components/admin/ui';
import { FotoSerata } from '@/components/admin/foto-serata';

export const metadata = { title: 'Foto della serata' };

type Props = { params: Promise<{ id: string }> };

/** Foto della serata: carica, sceglie quelle in evidenza, ordina, nasconde, elimina. */
export default async function PaginaFoto({ params }: Props) {
  const { id } = await params;
  const s = await richiedi(['admin'], `/admin/eventi/${id}/foto`);
  let errore: string | null = null;
  const f = await fotoAdmin(s, id).catch((e: unknown) => {
    if (e instanceof Error && e.message === 'Serata non trovata') return null;
    console.error('[foto] pagina Foto non letta', e);
    errore = e instanceof Error ? e.message : 'Errore sconosciuto';
    return null;
  });
  if (!f && !errore) notFound();
  if (!f) {
    return (
      <div className="px-4 py-6 md:px-12">
        <h1 className="m-0 font-display text-[26px] font-black uppercase leading-none">Foto non disponibili</h1>
        <p className="mt-4 max-w-[640px] text-[14px] text-osso-2">Non riesco a leggere le foto di questa serata: {errore}. Se è la prima volta dopo l&apos;aggiornamento, controlla che la migrazione delle foto sia stata applicata su Supabase.</p>
        <Link className="mm-btn mm-btn--muto mt-4 inline-block" href={`/admin/eventi/${id}`}>← Torna alla serata</Link>
      </div>
    );
  }
  const e = f.evento;
  return (
    <>
      <TestataAdmin
        briciole={`SERATE / ${e.numero ? numeroEvento(e.numero) : e.slug} / FOTO`}
        titolo="Foto"
        sotto={`${e.nome.toUpperCase()} · ${dataPunti(e.data)}`}
        azioni={<Link className="mm-btn mm-btn--muto" href={`/admin/eventi/${e.id}`}>← Torna alla serata</Link>}
      />
      <div className="px-4 py-6 md:px-12">
        <FotoSerata eventoId={e.id} foto={f.foto} credito={f.credito} byteSerata={f.byteSerata} byteTotali={f.byteTotali} />
        <p className="mb-0 mt-8 max-w-[640px] font-mono text-[12px] leading-4 text-osso-3">
          Sul sito le foto si vedono solo quando la serata è pubblicata e finita. Una foto nascosta sparisce dal sito, ma chi ha già il suo link può ancora aprirla: per una richiesta di rimozione usa Elimina.
        </p>
      </div>
    </>
  );
}
