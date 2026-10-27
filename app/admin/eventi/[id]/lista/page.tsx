import Link from 'next/link';
import { notFound } from 'next/navigation';
import { richiedi } from '@/lib/sessione';
import { listaStampabile } from '@/lib/dati/porta';
import { dataPunti, giornoSett, nascita, ora } from '@/lib/formato';

export const metadata = { title: 'Lista della serata' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

/** Lista di riserva per le serate senza telefono: si stampa (Ctrl+P) e serve se il telefono della porta non funziona. */
export default async function ListaSerata({ params }: Props) {
  const { id } = await params;
  const s = await richiedi(['admin'], `/admin/eventi/${id}/lista`);
  const lista = await listaStampabile(s, id);
  if (!lista) notFound();
  const { evento: e, righe } = lista;
  return (
    <div className="flex flex-col gap-5 px-4 py-7 md:px-12 print:bg-white print:text-black">
      <div className="flex flex-wrap items-baseline justify-between gap-3 print:hidden">
        <Link href={`/admin/eventi/${e.id}`} className="text-osso underline decoration-arancio underline-offset-[3px]">← Torna alla serata</Link>
        <span className="font-mono text-[12px] text-osso-2">STAMPA CON CTRL+P · I DATI SI CANCELLANO 30 GIORNI DOPO LA SERATA</span>
      </div>
      <h1 className="m-0 font-display text-[36px] font-black uppercase leading-none">{e.nome}</h1>
      <p className="m-0 font-mono text-[13px]">{giornoSett(e.data)} {dataPunti(e.data)} · {righe.length} IN LISTA · {righe.filter((r) => r.entrato).length} ENTRATI · STAMPATA ALLE {ora(new Date().toISOString())}</p>
      <table className="w-full border-collapse text-left text-[15px]">
        <thead>
          <tr className="border-b border-current font-mono text-[11px] uppercase">
            <th className="py-2 pr-3">Cognome</th><th className="pr-3">Nome</th><th className="pr-3">Nato/a il</th><th className="pr-3">Tipo</th><th className="w-16 text-center">Entrato</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id} className="border-b border-linea print:border-black/30">
              <td className="py-2 pr-3 font-semibold uppercase">{r.cognome}</td>
              <td className="pr-3">{r.nome}</td>
              <td className="pr-3 font-mono">{nascita(r.dataNascita)}</td>
              <td className="pr-3">{r.categoria ?? ''}</td>
              <td className="text-center">{r.entrato ? `✓ ${r.oraCheckIn ? ora(r.oraCheckIn) : ''}` : '☐'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!righe.length && <p className="m-0 text-osso-2">Nessuna prevendita valida per questa serata.</p>}
    </div>
  );
}
