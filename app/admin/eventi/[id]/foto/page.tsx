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
  const f = await fotoAdmin(s, id).catch(() => null);
  if (!f) notFound();
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
          Sul sito le foto si vedono solo quando la serata è pubblicata e finita. Quelle nascoste non le vede nessuno. Chi chiede di togliere una foto: eliminala da qui.
        </p>
      </div>
    </>
  );
}
