import type { Metadata } from 'next';
import { richiedi } from '@/lib/sessione';
import { GuscioArea } from '@/components/area/guscio';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin Maremma Musica' }, robots: { index: false } };

/** Area admin: stesso guscio dello staff (barra laterale da desktop, barra in basso su telefono). */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const s = await richiedi(['admin'], '/admin');
  return <GuscioArea ruolo={s.utente.ruolo} email={s.utente.email}>{children}</GuscioArea>;
}
