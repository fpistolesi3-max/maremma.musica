import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { elencoSerate } from '@/lib/dati/admin';
import { dataPunti, giornoSett, numeroEvento, orari, parti } from '@/lib/formato';
import { luogoTesto } from '@/lib/luogo';
import { TestataAdmin } from '@/components/admin/ui';
import { ChipSerata } from '@/components/ui';

export const metadata = { title: 'Serate' };

export default async function AdminSerate() {
  const s = await richiedi(['admin'], '/admin');
  const serate = await elencoSerate(s);
  return (
    <>
      <TestataAdmin briciole="SERATE" titolo="Serate" azioni={<Link href="/admin/eventi/nuovo" className="mm-btn mm-btn--primario">Nuova serata</Link>} />
      <div className="px-4 py-6 md:px-12">
        <div className="mm-scroll">
          <table className="mm-classifica mm-schede">
            <thead><tr><th>#</th><th>Serata</th><th>Quando</th><th>Stato</th><th className="mm-num">In lista</th><th className="mm-num">Entrati</th><th /></tr></thead>
            <tbody>
              {serate.map(({ evento: e, inLista, entrati, passata }) => (
                <tr key={e.id}>
                  <td data-et="Numero" className="font-mono text-[12px] text-osso-2">{numeroEvento(e.numero)}</td>
                  <td className="mm-pieno">
                    <Link href={`/admin/eventi/${e.id}`} className="mm-classifica__nome no-underline">{e.nome}</Link>
                    <div className="mt-1 font-mono text-[11px] text-osso-2">{luogoTesto(e)}</div>
                  </td>
                  <td data-et="Quando" className="whitespace-nowrap font-mono text-[12px]">{giornoSett(e.data)} {dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)}<div className="text-osso-2">{orari(e.data, e.dataFine)}</div></td>
                  <td data-et="Stato">
                    <ChipSerata pubblicata={e.pubblicato} passata={passata} />
                    {e.inCopertina && <span className="mm-chip mm-chip--libero ml-2">Copertina</span>}
                  </td>
                  <td data-et="In lista" className="mm-num">{inLista}</td>
                  <td data-et="Entrati" className="mm-num">{entrati}</td>
                  <td className="mm-pieno whitespace-nowrap md:text-right">
                    <Link href={`/admin/eventi/${e.id}`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Live</Link>
                    <Link href={`/admin/eventi/${e.id}/modifica`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Modifica</Link>
                    {/* <a> e non <Link>: con il caricamento normale il browser scende da solo alla sezione */}
                    <a href={`/admin/eventi/${e.id}/modifica#tavoli`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Tavoli</a>
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
