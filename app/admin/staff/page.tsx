import { richiedi } from '@/lib/sessione';
import { utentiStaff } from '@/lib/dati/admin';
import { TestataAdmin } from '@/components/admin/ui';
import { NuovoStaff, RimuoviStaff } from '@/components/admin/azioni-client';

export const metadata = { title: 'Staff' };

/** Chi può aprire lo scanner (/door) o l'admin. Nessuna password: si entra con il link via email. */
export default async function AdminStaff() {
  const s = await richiedi(['admin'], '/admin/staff');
  const utenti = await utentiStaff(s);
  return (
    <>
      <TestataAdmin briciole="STAFF" titolo="Staff" sotto="LO STAFF APRE /DOOR DAL TELEFONO E ENTRA CON LA SUA EMAIL" />
      <div className="flex flex-col gap-8 px-4 py-6 md:px-12">
        <NuovoStaff />
        <div className="mm-scroll">
          <table className="mm-classifica">
            <thead><tr><th>Email</th><th>Ruolo</th><th /></tr></thead>
            <tbody>
              {utenti.map((u) => (
                <tr key={u.id}>
                  <td className="font-mono text-[13px]">{u.email}{u.id === s.utente.id && <span className="mm-classifica__tu">TU</span>}</td>
                  <td><span className={`mm-chip ${u.ruolo === 'admin' ? 'mm-chip--lista' : 'mm-chip--pagato'}`}>{u.ruolo === 'admin' ? 'Admin' : 'Staff porta'}</span></td>
                  <td>{u.id !== s.utente.id && <RimuoviStaff id={u.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
