import type { Metadata } from 'next';
import { BigliettiRicordati } from '@/components/client';
import { ModuloRecupero } from '@/components/modulo-recupero';

export const metadata: Metadata = { title: 'Il mio QR', description: 'Recupera il QR della lista: ti rimandiamo il link per email.' };

type Props = { searchParams: Promise<{ email?: string }> };

export default async function IlMioQr({ searchParams }: Props) {
  const { email } = await searchParams;
  return (
    <section className="contenitore flex flex-col gap-8 pb-16 pt-8 md:pt-14" style={{ maxWidth: 640 }}>
      <div className="flex flex-col gap-4">
        <span className="font-mono text-[11px] tracking-[.06em] text-arancio">✦ IL MIO QR</span>
        <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84] md:text-[96px]">Hai perso<br />il QR?</h1>
        <p className="m-0 text-[17px] leading-[26px] text-osso-2">Niente panico. Se ti sei iscritto da questo telefono lo trovi qui sotto, altrimenti te lo rimandiamo per email.</p>
      </div>
      <BigliettiRicordati />
      <ModuloRecupero email={email ?? ''} />
      <p className="m-0 text-[14px] leading-5 text-osso-2">Alla porta basta anche il codice di 8 caratteri scritto sotto il QR, con un documento.</p>
    </section>
  );
}
