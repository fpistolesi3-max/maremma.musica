import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { destinazionePer, puoAprire, sessioneCorrente } from '@/lib/sessione';
import { esci } from '@/app/azioni/accesso';
import { ModuloAccesso } from '@/components/modulo-accesso';
import { leggi } from '@/lib/dati/archivio';
import { MarchioLink } from '@/components/ui';
import { modalitaProva } from '@/lib/prova';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accedi', robots: { index: false } };

type Props = { searchParams: Promise<{ dopo?: string; errore?: string }> };

/** Accesso per PR, staff porta e admin: link magico o codice via email, nessuna password. */
export default async function Accedi({ searchParams }: Props) {
  const { dopo, errore } = await searchParams;
  const s = await sessioneCorrente();
  const dopoSicuro = dopo && dopo.startsWith('/') && !dopo.startsWith('//') ? dopo : undefined;
  // Già dentro e con il ruolo giusto: si va diretti. Con il ruolo sbagliato si resta qui (niente giri infiniti).
  const altroRuolo = s && dopoSicuro && dopoSicuro !== '/pr' && !puoAprire(s.utente.ruolo, dopoSicuro);
  if (s && !altroRuolo) redirect(destinazionePer(s.utente, s.pr, dopoSicuro));
  const sviluppo = modalitaProva();
  const d = sviluppo ? await leggi() : null;
  const RUOLI = { admin: 'Admin', staff: 'Staff porta', pr: 'PR' } as const;
  const accountProva = d ? d.utenti
    .filter((u) => u.email.endsWith('.test'))
    .map((u) => ({ email: u.email, etichetta: `${RUOLI[u.ruolo]}${u.prId ? ` · ${d.pr.find((p) => p.id === u.prId)?.nomeDisplay ?? ''}` : ''}` })) : [];
  return (
    <div className="mm-grana mm-curve flex min-h-dvh flex-col bg-[position:-900px_-200px]">
      <header className="flex h-16 items-center px-4 md:h-24 md:px-10"><MarchioLink /></header>
      <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col gap-8 px-4 pb-16 pt-6 md:pt-12">
        <div className="flex flex-col gap-4">
          <span className="font-mono text-[11px] tracking-[.06em] text-arancio">✦ AREA PR · PORTA · ADMIN</span>
          <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84] md:text-[80px]">Entra.</h1>
          <p className="m-0 text-[17px] leading-[26px] text-osso-2">Scrivi l’email con cui la crew ti ha dato l’accesso.</p>
        </div>
        {altroRuolo && (
          <div role="alert" className="flex flex-col gap-3 border border-attesa p-4 text-[14px] leading-5 text-attesa">
            Sei entrato come {s!.utente.email}: questa pagina serve a un altro accesso.
            <form action={esci}><button type="submit" className="mm-btn mm-btn--linea" style={{ minHeight: 40 }}>Esci e cambia accesso</button></form>
          </div>
        )}
        {errore && <p role="alert" className="m-0 border border-stop-testo px-4 py-3 text-[14px] leading-5 text-stop-testo">Il link è scaduto o è già stato usato. Chiedine uno nuovo.</p>}
        <ModuloAccesso dopo={dopoSicuro} sviluppo={sviluppo} accountProva={accountProva} />
        <Link href="/" className="link-sottolineato self-start py-2 text-osso-2">← Torna al sito</Link>
      </main>
    </div>
  );
}
