import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { COOKIE_PR } from '@/lib/costanti';
import { sessioneCorrente } from '@/lib/sessione';
import { tavoliPubblici } from '@/lib/dati/tavoli';
import { MINUTI_PAGAMENTO_ONLINE, scadenzaPagamento, scadenzaPagamentoOnline } from '@/lib/regole';
import { modoPagamentoTavoli } from '@/lib/pagamenti';
import { quandoScade } from '@/lib/tavolo-email';
import { dataPunti, giorno2, giornoSett, meseCorto, numeroEvento, orari } from '@/lib/formato';
import { luogoTesto } from '@/lib/luogo';
import { PrenotaTavolo } from '@/components/tavoli-cliente';
import { CampoLista, Monogramma } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ pr?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await tavoliPubblici((await params).slug);
  return { title: x ? `Tavoli · ${x.evento.nome} ${dataPunti(x.evento.data)}` : 'Serata non trovata', robots: { index: false } };
}

/**
 * /tavoli/[slug] — scelta e richiesta di un tavolo. Con ?pr=handle (o dopo essere passati dal link di un PR)
 * la prenotazione è attribuita a lui, qualunque tavolo scelga il cliente. Il PR con la sessione aperta
 * vede solo i tavoli affidati a lui e inserisce la richiesta a nome del cliente.
 */
export default async function PaginaTavoli({ params, searchParams }: Props) {
  const { slug } = await params;
  const s = await sessioneCorrente();
  const comePr = s?.utente.ruolo === 'pr' && s.pr ? s.pr : null;
  const handle = comePr?.handle ?? (await searchParams).pr ?? (await cookies()).get(COOKIE_PR)?.value ?? null;
  const x = await tavoliPubblici(slug, handle, Boolean(comePr));
  if (!x) notFound();
  const e = x.evento;
  const online = modoPagamentoTavoli() !== null;

  return (
    <div className="mm-grana flex min-h-dvh flex-col">
      <header className="flex h-16 flex-none items-center justify-between border-b border-linea px-4 md:px-8">
        <Link href="/" className="flex items-center gap-[10px] no-underline">
          <Monogramma />
          <span className="font-sans text-[11px] font-semibold leading-none tracking-logo">MAREMMA MUSICA</span>
        </Link>
        <Link href={comePr ? `/pr/${comePr.handle}?serata=${e.slug}` : `/e/${e.slug}`} className="font-mono text-[11px] text-osso-2 no-underline">← {comePr ? 'AREA PR' : 'LA SERATA'}</Link>
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 pb-16 pt-8">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] leading-none tracking-[.06em] text-arancio">✦ {giornoSett(e.data)} {giorno2(e.data)} {meseCorto(e.data).toUpperCase()} · {orari(e.data, e.dataFine)} · {numeroEvento(e.numero)}</span>
          <h1 className="m-0 font-display text-[56px] font-black uppercase leading-[.86] md:text-[80px]">Prenota <span className="text-arancio">un tavolo</span></h1>
          <span className="font-mono text-[11px] leading-4 text-osso-2">{e.nome.toUpperCase()} · {luogoTesto(e).toUpperCase()}</span>
          <p className="m-0 text-[16px] leading-6 text-osso-2">
            {online
              ? 'Il tavolo si prende con una spesa minima, pagata subito online: scegli il tavolo, paga e ti arriva il QR per tutto il gruppo. Alla porta basta mostrarlo.'
              : 'Il tavolo si prende con una spesa minima, da pagare in anticipo. Dopo la richiesta resta fermo a tuo nome: se il pagamento non arriva in tempo torna libero.'}
          </p>
          {x.pr && <CampoLista nome={x.pr.nomeDisplay} ufficiale={false} nota={comePr ? 'Vedi solo i tavoli affidati a te: la prenotazione resta nella tua lista.' : `Sei entrato dal link di ${x.pr.nomeDisplay}.`} />}
        </div>
        <PrenotaTavolo tavoli={x.tavoli} piantinaUrl={e.piantinaUrl} prHandle={x.pr?.handle ?? null} perCliente={Boolean(comePr)} chiuse={!x.aperte} online={online}
          scadenza={!online ? quandoScade(scadenzaPagamento(new Date(), e)) : comePr ? quandoScade(scadenzaPagamentoOnline(new Date(), e, true)) : `${MINUTI_PAGAMENTO_ONLINE} minuti`} />
      </main>
    </div>
  );
}
