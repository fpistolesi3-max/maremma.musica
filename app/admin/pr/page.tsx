import { richiedi } from '@/lib/sessione';
import { tuttiIPr } from '@/lib/dati/admin';
import { Suspense } from 'react';
import { NavGestione } from '@/components/gestione-nav';
import { TestataAdmin } from '@/components/admin/ui';
import { NuovoPr, StatoPr } from '@/components/admin/azioni-client';

export const metadata = { title: 'Account PR' };

export default async function AdminPr() {
  const s = await richiedi(['admin'], '/admin/pr');
  const pr = await tuttiIPr(s);
  return (
    <>
      <Suspense><NavGestione admin /></Suspense>
      <TestataAdmin briciole="PR / ACCOUNT" titolo="Account PR" sotto={`${pr.filter((p) => p.pr.stato === 'attivo').length} ATTIVI · CLASSIFICA COMPLESSIVA`} />
      <div className="flex flex-col gap-8 px-4 py-6 md:px-12">
        <NuovoPr />
        <div className="mm-scroll">
          <table className="mm-classifica mm-schede">
            <thead><tr><th>#</th><th>PR</th><th>Link</th><th>Email</th><th className="mm-num">Iscritti</th><th className="mm-num">Entrati</th><th /></tr></thead>
            <tbody>
              {pr.slice().sort((a, b) => b.iscritti - a.iscritti).map((p, i) => (
                <tr key={p.pr.id} style={p.pr.stato === 'sospeso' ? { opacity: 0.55 } : undefined}>
                  <td className="mm-classifica__pos mm-pieno">{i + 1}</td>
                  <td className="mm-pieno"><span className="mm-classifica__nome">{p.pr.nomeDisplay}</span>{p.pr.stato === 'sospeso' && <span className="mm-chip mm-chip--annullato ml-2">Sospeso</span>}</td>
                  <td data-et="Link" className="font-mono text-[12px] text-osso-2">/pr/{p.pr.handle}</td>
                  <td data-et="Email" className="font-mono text-[12px] text-osso-2">{p.email ?? '—'}</td>
                  <td data-et="Iscritti" className="mm-num">{p.iscritti}</td>
                  <td data-et="Entrati" className="mm-num">{p.entrati}</td>
                  <td className="mm-pieno md:text-right"><StatoPr id={p.pr.id} attivo={p.pr.stato === 'attivo'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
