import type { Metadata, Viewport } from 'next';
import { richiedi } from '@/lib/sessione';
import { eventiPorta } from '@/lib/dati/porta';
import { esci } from '@/app/azioni/accesso';
import { Porta } from '@/components/porta/porta';
import { RegistraServiceWorker } from '@/components/porta/sw';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Porta', robots: { index: false }, manifest: '/porta.webmanifest' };
export const viewport: Viewport = { themeColor: '#050505' };

/** Scanner della porta per lo staff (accesso con link via email). */
export default async function PaginaPorta() {
  const s = await richiedi(['staff', 'admin'], '/door');
  const eventi = await eventiPorta(s);
  return (
    <>
      <RegistraServiceWorker />
      <Porta eventi={eventi} email={s.utente.email} admin={s.utente.ruolo === 'admin'} esci={esci} />
    </>
  );
}
