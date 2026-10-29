import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { eventoPerSlug, prValido, prevenditaOnlineAttiva, usatiPerLotto } from '@/lib/dati/pubblico';
import { leggi } from '@/lib/dati/archivio';
import { dataPunti, euro, giorno2, giornoSett, meseCorto, numeroEvento, ora, orari } from '@/lib/formato';
import { chipLista, limiteIngresso, tipiVista } from '@/lib/regole';
import { luogoTesto } from '@/lib/luogo';
import { CampoLista, IconaIndietro, Monogramma } from './ui';
import { ModuloPrevendita } from './modulo-prevendita';

// Prevendita (PresaleSheet del DS): la locandina sfocata e velata fa da sfondo, il pannello resta neutro.
// La Lista è bloccata: dal link PR (URL o cookie di 3 giorni, vince l'ultimo link visitato)
// oppure "Maremma Musica" per chi arriva senza link.

import { COOKIE_PR } from '@/lib/costanti';

export async function PaginaPrevendita({ slug, handleDaUrl }: { slug: string; handleDaUrl: string | null }) {
  const base = await eventoPerSlug(slug);
  if (!base) notFound();
  const e = base.evento;

  const handleCookie = (await cookies()).get(COOKIE_PR)?.value ?? null;
  const pr = (await prValido(handleDaUrl, e)) ?? (await prValido(handleCookie, e));
  const ep = pr ? (await eventoPerSlug(slug, true, pr.id))! : base;

  // A pagamento si vende solo con il pagamento online attivo (sul sito vero serve la chiave di Stripe).
  const inArrivo = ep.stato.tipo === 'aperta' && !prevenditaOnlineAttiva();
  const aperta = (ep.stato.tipo === 'aperta' && !inArrivo) || ep.stato.tipo === 'libero';
  const aPagamento = ep.stato.tipo === 'aperta';
  const totaleEtichetta = aPagamento ? 'Paghi ora online' : 'Ingresso';
  const totaleValore = ep.stato.tipo === 'aperta' ? euro(ep.stato.prezzo) : 'Libero';
  const tipo = ep.stato.tipo === 'aperta' || ep.stato.tipo === 'libero' ? ep.stato.lotto : null;
  const usati = usatiPerLotto(await leggi(), e.id);
  const prossimo = tipo ? tipiVista(e, ep.lotti, usati, { daPr: Boolean(pr), prId: pr?.id }).find((t) => t.stato === 'presto' || t.stato === 'dopo_precedente') : null;
  const dataBreve = `${giornoSett(e.data)} ${giorno2(e.data)} ${meseCorto(e.data).toUpperCase()}`;

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-notte">
      {/* sfondo: locandina sfocata + velo */}
      {e.locandinaUrl && (
        <div aria-hidden="true" className="absolute -inset-[60px] -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${e.locandinaUrl})`, filter: 'blur(var(--blur-locandina)) saturate(1.15)' }} />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(12,15,20,.55)_0%,rgba(12,15,20,.72)_30%,#0c0f14_52%)] md:bg-velo" />

      <header className="flex h-16 items-center gap-1 pl-1 pr-2 md:h-20 md:px-8">
        <Link href={`/e/${e.slug}`} aria-label="Torna alla serata" className="grid h-11 w-11 place-items-center text-osso"><IconaIndietro /></Link>
        <span className="flex-grow font-mono text-[11px] leading-none tracking-[.04em]">{numeroEvento(e.numero)} · LISTA</span>
        <Link href="/" aria-label="Maremma Musica, home" className="mr-[10px]"><Monogramma className="h-[28px] w-[26px]" /></Link>
      </header>

      <div className="md:grid md:place-items-center md:px-4 md:pb-16 md:pt-4">
        <div className="md:w-full md:max-w-[440px] md:border md:border-linea md:bg-notte-2 md:shadow-pannello">
          {/* testata evento */}
          <div className="grid grid-cols-[96px_minmax(0,1fr)] items-end gap-4 px-4 pb-7 pt-3 md:grid-cols-[64px_minmax(0,1fr)] md:px-8 md:pb-6 md:pt-8">
            {e.locandinaUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={e.locandinaUrl} alt="" className="h-[144px] w-[96px] object-cover shadow-pannello md:h-[85px] md:w-[64px] md:shadow-none" />
              : <div className="h-[144px] w-[96px] bg-notte-3 md:h-[85px] md:w-[64px]" />}
            <div className="flex min-w-0 flex-col gap-[10px] md:gap-2">
              <h1 className="m-0 font-display text-[48px] font-black uppercase leading-[.86] [overflow-wrap:anywhere] md:text-[36px] md:leading-[.9]">{e.nome}</h1>
              <span className="font-mono text-[11px] leading-4 md:text-[13px] md:leading-[18px] md:text-osso-2">
                {dataBreve} · {orari(e.data, e.dataFine)}<br />
                {e.dressCode ? `DRESS CODE: ${e.dressCode.toUpperCase()}` : luogoTesto(e).toUpperCase()}
              </span>
            </div>
          </div>

          <div className="border-t border-linea bg-notte-2 px-4 pb-8 pt-6 md:border-t md:px-8 md:pb-8">
            {aperta ? (
              <ModuloPrevendita slug={e.slug} prHandle={pr?.handle ?? null} totaleEtichetta={totaleEtichetta} totaleValore={totaleValore} etaMinima={e.etaMinima} senzaTelefono={e.senzaTelefono}
                aPagamento={aPagamento} validaFino={limiteIngresso(e) ? ora(limiteIngresso(e)!) : null}
                tipo={tipo && (tipo.categoria || ep.lotti.length > 1) ? { nome: tipo.nome, categoria: tipo.categoria, conferma: tipo.confermaCategoria, prossimo: prossimo ? `${prossimo.lotto.nome}${prossimo.dal ? ` dal ${dataPunti(prossimo.dal.toISOString())}` : ' quando finiscono i posti'}` : null } : null}>
                {pr
                  ? <CampoLista nome={pr.nomeDisplay} ufficiale={false} nota={`Sei entrato dal link di ${pr.nomeDisplay}: resti nella sua lista.`} />
                  : <CampoLista nome="Maremma Musica" ufficiale />}
              </ModuloPrevendita>
            ) : (
              <div className="flex flex-col gap-5">
                <span className={(inArrivo ? 'mm-chip mm-chip--pagato' : chipLista(ep.stato).classe) + ' self-start'}>{inArrivo ? 'Prevendita in arrivo' : chipLista(ep.stato).testo}</span>
                <p className="m-0 text-[17px] leading-[26px]">
                  {inArrivo ? 'La prevendita online apre a breve: torna qui nei prossimi giorni.'
                    : ep.stato.tipo === 'dal' ? (ep.stato.dal ? `La lista apre il ${dataPunti(ep.stato.dal)}. Torna qui quel giorno.` : 'Il prossimo tipo di prevendita esce quando finiscono i posti di quello attuale.')
                    : ep.stato.tipo === 'piena' ? 'I posti in lista sono finiti. Tieni d’occhio Instagram: a volte se ne liberano.'
                      : 'La lista per questa serata è chiusa.'}
                </p>
                <Link href={`/e/${e.slug}`} className="mm-btn mm-btn--clip mm-btn--linea mm-btn--pieno">Torna alla serata</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
