import { notFound } from 'next/navigation';
import { richiedi } from '@/lib/sessione';
import { eventoAdmin } from '@/lib/dati/admin';
import { dataCompleta, dataIso, giorniTra, numeroEvento, spostaGiorni } from '@/lib/formato';
import { TestataAdmin } from '@/components/admin/ui';
import { DuplicaSerata } from '@/components/admin/duplica-serata';

export const metadata = { title: 'Duplica serata' };

type Props = { params: Promise<{ id: string }> };

export default async function DuplicaSerataPagina({ params }: Props) {
  const { id } = await params;
  const s = await richiedi(['admin'], `/admin/eventi/${id}/duplica`);
  const x = await eventoAdmin(s, id);
  if (!x) notFound();
  const e = x.evento;
  // Si propone la settimana dopo; se la serata è passata da un po', lo stesso giorno della settimana a partire da oggi.
  const giornoProposto = dataIso(spostaGiorni(e.data, Math.max(7, Math.ceil(giorniTra(e.data, new Date().toISOString()) / 7) * 7)));
  return (
    <>
      <TestataAdmin briciole={`SERATE / ${numeroEvento(e.numero)}`} titolo="Duplica serata" sotto={`${e.nome.toUpperCase()} · ${dataCompleta(e.data)}`} />
      <div className="flex flex-col gap-2 px-4 pt-8 md:px-12">
        <p className="m-0 max-w-[560px] text-[15px] leading-6">
          Copia la serata con tutto quello che serve: i dati, i PR abilitati, le impostazioni della porta, {x.lotti.length} {x.lotti.length === 1 ? 'tipo' : 'tipi'} di prevendita
          (le uscite seguono la nuova data) e {x.tavoli.length} {x.tavoli.length === 1 ? 'tavolo' : 'tavoli'}{e.piantinaUrl ? ' con la piantina' : ''}.
        </p>
        <p className="m-0 max-w-[560px] text-[14px] leading-5 text-osso-2">La copia nasce in bozza, con un altro numero e un altro indirizzo, e non è in copertina. Non vengono copiate iscrizioni, prenotazioni e incassi.</p>
      </div>
      <DuplicaSerata id={e.id} giornoProposto={giornoProposto} />
    </>
  );
}
