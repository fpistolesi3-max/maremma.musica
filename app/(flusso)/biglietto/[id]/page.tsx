import type { Metadata } from 'next';
import Link from 'next/link';
import { bigliettoPubblico } from '@/lib/dati/pubblico';
import { numeroEvento } from '@/lib/formato';
import { BigliettoQr } from '@/components/biglietto';
import { CampoLink, RicordaBiglietto } from '@/components/client';
import { ModuloRecupero } from '@/components/modulo-recupero';
import { Monogramma } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Il tuo QR', robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ email?: string; nuovo?: string }> };

/** /biglietto/[ordine_id]?email=… — conferma dopo l'iscrizione e recupero del QR. */
export default async function PaginaBiglietto({ params, searchParams }: Props) {
  const { id } = await params;
  const { email, nuovo } = await searchParams;
  const b = await bigliettoPubblico(id, email);

  return (
    <div className="mm-grana mm-curve flex min-h-dvh flex-col bg-notte bg-[position:-1000px_-80px]">
      <header className="flex h-16 flex-none items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-[10px] no-underline">
          <Monogramma />
          <span className="font-sans text-[11px] font-semibold leading-none tracking-logo">MAREMMA MUSICA</span>
        </Link>
        {b && <span className="font-mono text-[11px] text-osso-2">{numeroEvento(b.evento.numero)}</span>}
      </header>

      {!b ? (
        <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col gap-6 px-4 pb-16 pt-6">
          <h1 className="m-0 font-display text-[64px] font-black uppercase leading-[.84]">QR non<br />trovato.</h1>
          <p className="m-0 text-[17px] leading-[26px] text-osso-2">Il link è incompleto o l&apos;email non corrisponde. Scrivi l&apos;email con cui ti sei iscritto: ti rimandiamo i tuoi QR.</p>
          <ModuloRecupero email={email ?? ''} />
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-[440px] flex-grow flex-col md:max-w-[960px] md:flex-row md:items-start md:gap-16 md:px-8 md:pt-10">
          <RicordaBiglietto id={b.iscrizione.id} email={b.iscrizione.email} evento={b.evento.nome} data={b.evento.data} nome={`${b.iscrizione.nome} ${b.iscrizione.cognome}`} />
          <div className="flex flex-col md:w-[420px] md:flex-none md:pt-6">
            <section className="flex flex-col gap-[14px] px-4 pb-8 pt-6 md:px-0">
              {nuovo ? (
                <>
                  <span className="font-mono text-[11px] leading-none tracking-[.06em] text-ok">✓ ISCRIZIONE CONFERMATA</span>
                  <h1 className="m-0 font-display text-[96px] font-black uppercase leading-[.82]">Sei<br /><span className="text-arancio">in lista.</span></h1>
                  <p className="m-0 text-[18px] leading-[27px]">
                    Ci vediamo sotto cassa, {b.iscrizione.nome}.{b.evento.dressCode ? ` Dress code: ${b.evento.dressCode.toLowerCase()}.` : ''} Alla porta mostra questo QR con un documento.
                  </p>
                </>
              ) : (
                <>
                  <span className="font-mono text-[11px] leading-none tracking-[.06em] text-arancio">✦ IL TUO QR</span>
                  <h1 className="m-0 font-display text-[72px] font-black uppercase leading-[.84]">{b.iscrizione.nome},<br />eccolo.</h1>
                  <p className="m-0 text-[17px] leading-[26px] text-osso-2">Alla porta mostralo con un documento. Luminosità al massimo.</p>
                </>
              )}
            </section>
            <section className="hidden flex-col gap-3 md:flex">
              <Azioni id={b.iscrizione.id} email={b.iscrizione.email} nuovo={Boolean(nuovo)} />
            </section>
          </div>

          <div className="flex flex-col">
            <section className="flex justify-center px-4 md:px-0"><BigliettoQr b={b} /></section>
            <section className="flex flex-col gap-3 px-4 pt-7 md:hidden">
              <Azioni id={b.iscrizione.id} email={b.iscrizione.email} nuovo={Boolean(nuovo)} />
            </section>
            <section className="mx-4 mt-9 flex flex-col gap-[14px] border border-linea bg-notte-2 px-5 py-6 md:mx-0">
              <span className="font-display text-[30px] font-black uppercase leading-[.95]">Porta la tua gente</span>
              <span className="text-[15px] leading-[22px] text-osso-2">
                Manda questo link agli amici{b.prHandle ? `: finiscono anche loro nella lista di ${b.lista}.` : ': si mettono in lista in un minuto.'}
              </span>
              <CampoLink link={b.prHandle ? `/e/${b.evento.slug}/${b.prHandle}` : `/e/${b.evento.slug}`} />
            </section>
          </div>
        </main>
      )}

      <footer className="flex justify-between px-4 py-8 font-mono text-[10px] leading-[14px] text-osso-3 md:px-8">
        <span>MAREMMAMUSICA@GMAIL.COM</span><span>@MAREMMA.MUSICA</span>
      </footer>
    </div>
  );
}

function Azioni({ id, email, nuovo }: { id: string; email: string; nuovo: boolean }) {
  const q = `?email=${encodeURIComponent(email)}`;
  return (
    <>
      {nuovo && <span className="text-[14px] leading-5 text-osso-2">Ti abbiamo mandato il QR a <span className="text-osso">{email}</span>.</span>}
      <a className="mm-btn mm-btn--linea mm-btn--pieno" href={`/api/biglietto/${id}/pdf${q}`} target="_blank" rel="noopener">Scarica PDF</a>
      {/* Fase 2: Apple/Google Wallet */}
      <button type="button" className="mm-btn mm-btn--linea mm-btn--pieno" disabled>Salva nel Wallet · in arrivo</button>
      <a className="mm-btn mm-btn--muto self-center" href={`/api/biglietto/${id}/calendario${q}`}>Aggiungi al calendario</a>
    </>
  );
}
