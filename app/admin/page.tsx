import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { elencoSerate } from '@/lib/dati/admin';
import { dataPunti, giornoSett, numeroEvento, orari, parti } from '@/lib/formato';
import { luogoTesto } from '@/lib/luogo';
import { TestataAdmin } from '@/components/admin/ui';

export const metadata = { title: 'Serate' };

export default async function AdminSerate() {
  const s = await richiedi(['admin'], '/admin');
  const serate = await elencoSerate(s);
  return (
    <>
      <TestataAdmin briciole="SERATE" titolo="Serate" azioni={<Link href="/admin/eventi/nuovo" className="mm-btn mm-btn--primario">Nuova serata</Link>} />
      <div className="px-4 py-6 md:px-12">
        <div className="mm-scroll">
          <table className="mm-classifica">
            <thead><tr><th>#</th><th>Serata</th><th>Quando</th><th>Stato</th><th className="mm-num">In lista</th><th className="mm-num">Entrati</th><th /></tr></thead>
            <tbody>
              {serate.map(({ evento: e, inLista, entrati, passata }) => (
                <tr key={e.id}>
                  <td className="font-mono text-[12px] text-osso-2">{numeroEvento(e.numero)}</td>
                  <td>
                    <Link href={`/admin/eventi/${e.id}`} className="mm-classifica__nome no-underline">{e.nome}</Link>
                    <div className="mt-1 font-mono text-[11px] text-osso-2">{luogoTesto(e)}</div>
                  </td>
                  <td className="whitespace-nowrap font-mono text-[12px]">{giornoSett(e.data)} {dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)}<div className="text-osso-2">{orari(e.data, e.dataFine)}</div></td>
                  <td>
                    <span className={`mm-chip ${passata ? 'mm-chip--libero' : e.pubblicato ? 'mm-chip--entrato' : 'mm-chip--incassare'}`}>{passata ? 'Passata' : e.pubblicato ? 'Pubblicata' : 'Bozza'}</span>
                  </td>
                  <td className="mm-num">{inLista}</td>
                  <td className="mm-num">{entrati}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/admin/eventi/${e.id}`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Live</Link>
                    <Link href={`/admin/eventi/${e.id}/modifica`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Modifica</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
