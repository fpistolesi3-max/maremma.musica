import Link from 'next/link';
import { origineRichiesta, richiedi } from '@/lib/sessione';
import { panoramicaPr } from '@/lib/dati/gestione-pr';
import { dataPunti, euro, giornoSett } from '@/lib/formato';
import { Riquadro } from '@/components/gestione';
import { SceltaSerata } from '@/components/gestione-client';
import { AggiornamentoLive } from '@/components/admin/live';
import { TestataAdmin } from '@/components/admin/ui';
import { InvioLinkSerata, LinkPr, NuovoPr } from '@/components/admin/pr-client';
import { abilitatoPerSerata, destinatariLinkSerata, motivoNoInvioLink, testoLinkPerPr, testoUltimoInvio } from '@/lib/link-serata';
import { leggi } from '@/lib/dati/archivio';
import { emailVereAttive } from '@/lib/posta';

export const metadata = { title: 'PR' };

type Props = { searchParams: Promise<{ serata?: string }> };

/**
 * Tutti i PR in una pagina (solo admin): si aggiunge un PR e gli si manda l'invito, e per ognuno si vedono stato, numeri
 * della serata scelta, link da dare ai clienti e le azioni (sospendi, rimanda l'invito, dettaglio).
 */
export default async function PaginaPr({ searchParams }: Props) {
  const s = await richiedi(['admin'], '/admin/pr');
  const { serata } = await searchParams;
  const p = await panoramicaPr(s, serata ?? null);
  const origine = await origineRichiesta();
  const q = `?serata=${p.evento?.id ?? 'tutte'}`;
  const totaleLista = p.totali.inLista + p.diretta.inLista;
  const nomeSerata = p.evento ? `${giornoSett(p.evento.data)} ${dataPunti(p.evento.data)} · ${p.evento.nome.toUpperCase()}` : 'TUTTE LE SERATE';
  // Il link da dare ai clienti: quello della serata scelta; con "tutte le serate" quello che le mostra tutte.
  const destinatari = p.evento ? destinatariLinkSerata(await leggi(), p.evento) : [];
  const linkClienti = (handle: string) => (p.evento ? `${origine}/e/${p.evento.slug}/${handle}` : `${origine}/pr/${handle}`);

  return (
    <>
      <TestataAdmin briciole="CANALI / PR" titolo="PR" sotto={`${p.prAttivi} PR ATTIVI · ${nomeSerata}`}
        azioni={<div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
          <SceltaSerata azione="/admin/pr" eventi={p.eventi} scelto={p.evento?.id ?? 'tutte'} />
          <AggiornamentoLive ogniSecondi={10} aggiornatoAt={new Date().toISOString()} />
        </div>} />

      <div className="flex flex-col gap-8 px-4 py-6 md:px-12">
        {/* Azioni chiuse in due pulsanti: ognuno apre il suo riquadro, che prende tutta la riga. */}
        <div className="flex flex-wrap items-start gap-3">
          <NuovoPr />
          {p.evento && (
            <InvioLinkSerata eventoId={p.evento.id} nomeSerata={`${p.evento.nome} (${dataPunti(p.evento.data)})`}
              destinatari={destinatari.filter((x) => x.email).length} senzaEmail={destinatari.filter((x) => !x.email).length}
              ultimo={p.evento.invioLinkPr ? testoUltimoInvio(p.evento.invioLinkPr) : null} bloccato={motivoNoInvioLink(p.evento)} emailVere={emailVereAttive()} />
          )}
        </div>

        <div className="grid grid-cols-2 border-l border-t border-linea lg:grid-cols-4">
          <Riquadro etichetta="In lista dai PR" valore={p.totali.inLista}
            nota={totaleLista ? `${Math.round((p.totali.inLista / totaleLista) * 100)}% DEL TOTALE · +${p.totali.nuovi24h} IN 24H` : undefined} />
          <Riquadro etichetta="Entrati dai PR" valore={p.totali.entrati} colore="text-ok" nota={p.totali.resa != null ? `RESA ${p.totali.resa}%` : 'LA PORTA NON È ANCORA APERTA'} />
          <Riquadro etichetta="Prevendita dai PR" valore={euro(p.totali.incassatoOnline)} nota="PAGATA ONLINE SUL SITO" />
          <Riquadro etichetta="Senza PR" valore={p.diretta.inLista} nota={<Link href={`/admin/pr/canali${q}`} className="text-osso-2">DA SOCIAL E SITO · VEDI →</Link>} />
        </div>

        <section aria-labelledby="elenco-pr" className="flex flex-col gap-1">
          <h2 id="elenco-pr" className="m-0 font-display text-[26px] font-black uppercase leading-none">I PR</h2>
          <p className="m-0 pb-3 text-[13px] leading-5 text-osso-3">Tocca il nome di un PR per anagrafica e numeri.</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {p.righe.map((r) => {
              const sospeso = r.pr.stato === 'sospeso';
              const valido = p.evento ? abilitatoPerSerata(r.pr, p.evento) : !sospeso; // il suo link vale per la serata scelta
              return (
                <li key={r.pr.id} className="flex flex-col gap-4 border border-linea bg-notte-2 p-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:items-center md:gap-10 md:p-5">
                  <div className={`flex min-w-0 flex-col gap-3 ${sospeso ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link href={`/admin/pr/${r.pr.handle}${q}`} className="group font-display text-[26px] font-extrabold uppercase leading-none text-osso no-underline hover:text-osso" aria-label={`${r.pr.nomeDisplay}: anagrafica e numeri`}>
                        {r.pr.nomeDisplay} <span aria-hidden="true" className="text-osso-3 group-hover:text-arancio">›</span>
                      </Link>
                      <span className={`mm-chip ${sospeso ? 'mm-chip--annullato' : 'mm-chip--entrato'}`}>{sospeso ? 'Sospeso' : 'Attivo'}</span>
                    </div>
                    <span className="break-all font-mono text-[12px] leading-4 text-osso-2">{r.email ?? 'Nessuna email'}</span>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-osso-2">
                      <span><b className="block font-display text-[26px] font-black leading-none text-osso">{r.inLista}</b>IN LISTA</span>
                      <span><b className="block font-display text-[26px] font-black leading-none text-osso">{r.pagati}</b>PAGATI</span>
                      <span><b className="block font-display text-[26px] font-black leading-none text-ok">{r.entrati}</b>ENTRATI</span>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-3">
                    {valido ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold leading-[14px] tracking-[.12em] text-osso-2">LINK DA DARE AI CLIENTI</span>
                        <LinkPr url={linkClienti(r.pr.handle)} nomePr={r.pr.nomeDisplay}
                          testoWhatsApp={p.evento && !motivoNoInvioLink(p.evento) ? testoLinkPerPr(r.pr.nomeDisplay, p.evento, linkClienti(r.pr.handle)) : undefined} />
                      </div>
                    ) : (
                      // Un link che non vale non si copia: chi lo aprisse vedrebbe l'avviso invece della lista del PR.
                      <p className="m-0 flex flex-col gap-1">
                        <b className="font-display text-[22px] font-extrabold uppercase leading-none text-attesa">{sospeso ? 'Sospeso' : 'Non in questa serata'}</b>
                        <span className="text-[13px] leading-5 text-osso-3">{sospeso ? 'Il suo link non funziona finché non lo riattivi.' : 'La serata non è aperta a questo PR: il suo link non vale e non c’è niente da copiare.'}</span>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
            {p.righe.length === 0 && <li className="border border-linea p-4 text-osso-2">Ancora nessun PR: aggiungine uno qui sopra.</li>}
          </ul>
          <p className="m-0 pt-3 text-[13px] leading-5 text-osso-3">
            La prevendita si paga solo online: i soldi non passano dai PR. Contano solo le prevendite pagate (&quot;pagati&quot; sono quelle pagate online, le altre in lista sono gratuite).
          </p>
        </section>
      </div>
    </>
  );
}
