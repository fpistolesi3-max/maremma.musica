import Link from 'next/link';
import { richiedi } from '@/lib/sessione';
import { cruscotto, elencoSerate } from '@/lib/dati/admin';
import { serateSenzaFoto } from '@/lib/dati/foto';
import { euro, dataPunti, giornoSett, orari, parti } from '@/lib/formato';
import { dividiSerate, entratiDaMostrare, quantoManca, statoSerata } from '@/lib/elenco-serate';
import { luogoTesto } from '@/lib/luogo';
import { Numero, TestataAdmin } from '@/components/admin/ui';

export const metadata = { title: 'Serate' };

// Le serate passate senza foto sono una riga ciascuna: oltre queste, una riga sola per non riempire la home.
const MAX_SENZA_FOTO = 3;

export default async function AdminSerate() {
  const s = await richiedi(['admin'], '/admin');
  const [serate, c] = await Promise.all([elencoSerate(s), cruscotto(s)]);
  // Promemoria: serate già pubblicate e finite che non hanno ancora nessuna foto (una sola lettura per tutte; se non si leggono, niente allarmi).
  const senzaFoto = new Set((await serateSenzaFoto(s, serate.filter((x) => x.passata && x.evento.pubblicato).map((x) => x.evento.id))).ids);
  const eventiSenzaFoto = serate.filter((x) => senzaFoto.has(x.evento.id)).map((x) => x.evento); // l'elenco è dalla più recente
  // Ogni voce è una cosa sola da fare e porta dritta al punto giusto con un'azione a destra.
  type Voce = { chiave: string; testo: string; azione: string; href: string };
  const daFare: Voce[] = [
    ...c.rimborsi.map((r) => ({ chiave: `rimb-${r.eventoId}`, testo: `${r.n} ${r.n === 1 ? 'rimborso da fare' : 'rimborsi da fare'} · ${euro(r.importo)} · ${r.nome}`, azione: 'Vai ai rimborsi', href: `/admin/rimborsi?evento=${r.eventoId}` })),
    ...(c.importoSbagliato > 0 ? [{ chiave: 'importo', testo: `${c.importoSbagliato} ${c.importoSbagliato === 1 ? 'pagamento con importo sbagliato' : 'pagamenti con importo sbagliato'}: non confermati, vanno restituiti`, azione: 'Vai ai rimborsi', href: '/admin/rimborsi?motivo=importo' }] : []),
    ...c.tavoliInAttesa.map((t) => ({ chiave: t.eventoId, testo: `${t.n} ${t.n === 1 ? 'tavolo' : 'tavoli'} in attesa di pagamento · ${t.nome}`, azione: 'Vedi i tavoli', href: `/admin/eventi/${t.eventoId}/modifica#tavoli` })),
    ...c.bozze.map((b) => ({ chiave: `bozza-${b.eventoId}`, testo: `Bozza «${b.nome}»: ${b.manca.length === 1 ? 'manca 1 cosa' : `mancano ${b.manca.length} cose`} (${b.manca.map((m) => ({ tipi: 'tipi di prevendita', locandina: 'locandina', tavoli: 'tavoli' })[m.id]).join(', ')})`, azione: 'Completa', href: `/admin/eventi/${b.eventoId}/modifica#${b.manca[0].ancora}` })),
    ...eventiSenzaFoto.slice(0, MAX_SENZA_FOTO).map((e) => ({ chiave: `senza-foto-${e.id}`, testo: `${e.nome} è passata senza foto`, azione: 'Aggiungi foto', href: `/admin/eventi/${e.id}/modifica#foto` })),
  ];
  const altreSenzaFoto = eventiSenzaFoto.length - MAX_SENZA_FOTO;
  const p = c.prossima;
  const adesso = new Date().toISOString();
  const { inArrivo, passate } = dividiSerate(serate);
  const gruppi = [{ titolo: 'In arrivo', righe: inArrivo }, { titolo: 'Passate', righe: passate }].filter((g) => g.righe.length > 0);
  return (
    <>
      <TestataAdmin briciole="SERATE" titolo="Serate" azioni={<Link href="/admin/eventi/nuovo" className="mm-btn mm-btn--primario">Nuova serata</Link>} />
      {p && (
        <section aria-label="Prossima serata" className="border-b border-linea">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-5 md:px-12">
            <span className="basis-full text-[11px] font-semibold tracking-etichetta text-osso-2 md:basis-auto">PROSSIMA SERATA</span>
            <Link href={`/admin/eventi/${p.evento.id}`} className="font-display text-[22px] font-black uppercase no-underline">{p.evento.nome}</Link>
            <span className="font-mono text-[12px] text-osso-2">{giornoSett(p.evento.data)} {dataPunti(p.evento.data)}</span>
            <span className="font-mono text-[12px] font-semibold uppercase text-osso">{quantoManca(adesso, p.evento.data)}</span>
          </div>
          {/* md:px-5 + il px-7 di ogni riquadro = i px-12 del titolo: il primo numero parte dallo stesso margine. */}
          <div className="grid grid-cols-2 md:px-5 lg:grid-cols-4">
            <Numero etichetta="Iscritti" valore={String(p.inLista)} />
            {entratiDaMostrare(adesso, p.evento.data)
              ? <Numero etichetta="Entrati" valore={String(p.entrati)} colore="text-ok" bordo />
              : <Numero etichetta="Entrati" valore="la sera" colore="text-osso-3" bordo />}
            <Numero etichetta="Incassato" valore={euro(p.incassato)} />
            <Numero etichetta="Tavoli pagati" valore={String(p.tavoliPagati)} nota={p.tavoliInAttesa ? `${p.tavoliInAttesa} IN ATTESA` : undefined} bordo />
          </div>
        </section>
      )}
      <section aria-label="Da fare" className="flex flex-col gap-2 border-b border-linea px-4 py-5 md:px-12">
        <span className="text-[11px] font-semibold tracking-etichetta text-osso-2">DA FARE</span>
        {daFare.length === 0 && <span className="text-[14px] text-osso-2">Niente in sospeso: nessun rimborso, nessun tavolo da confermare, nessuna bozza incompleta, nessuna serata senza foto.</span>}
        {daFare.map((x) => (
          <Link key={x.chiave} href={x.href} className="flex flex-col gap-1 border border-linea bg-notte-2 px-4 py-3 text-[15px] no-underline md:flex-row md:items-center md:justify-between md:gap-4">
            <span className="min-w-0">{x.testo}</span>
            <span className="flex-none font-mono text-[12px] font-semibold uppercase tracking-[.04em] text-arancio">{x.azione} →</span>
          </Link>
        ))}
        {altreSenzaFoto > 0 && <span className="font-mono text-[12px] text-osso-2">+ altre {altreSenzaFoto} {altreSenzaFoto === 1 ? 'serata passata senza foto' : 'serate passate senza foto'}: le trovi nell'elenco qui sotto</span>}
      </section>
      <div className="px-4 py-6 md:px-12">
        <div className="mm-scroll">
          <table className="mm-classifica mm-schede mm-elenco">
            <thead><tr><th>Serata</th><th>Quando</th><th>Stato</th><th className="mm-num">Iscritti</th><th className="mm-num">Entrati</th><th><span className="sr-only">Azioni</span></th></tr></thead>
            {gruppi.map((g) => (
              <tbody key={g.titolo}>
                <tr className="mm-gruppo"><th colSpan={6} scope="colgroup">{g.titolo}</th></tr>
                {g.righe.map(({ evento: e, inLista, entrati, passata }) => {
                  const stato = statoSerata({ pubblicata: e.pubblicato, passata });
                  return (
                    <tr key={e.id}>
                      <td className="mm-pieno">
                        <Link href={`/admin/eventi/${e.id}`} className="mm-classifica__nome no-underline">{e.nome}</Link>
                        <div className="mt-1 font-mono text-[11px] text-osso-2">{luogoTesto(e)}{e.inCopertina && <span className="text-arancio"> · In copertina</span>}</div>
                      </td>
                      <td data-et="Quando" className="whitespace-nowrap font-mono text-[12px]">{giornoSett(e.data)} {dataPunti(e.data)}.{String(parti(e.data).anno).slice(2)}<div className="text-osso-2">{orari(e.data, e.dataFine)}</div></td>
                      <td data-et="Stato" className="whitespace-nowrap">
                        <span className={`mm-chip ${stato.classe}`}>{stato.testo}</span>
                        {senzaFoto.has(e.id) && (
                          <svg role="img" aria-label="Senza foto" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="ml-2 inline-block align-middle text-attesa">
                            <title>Senza foto</title>
                            <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /><path d="M3 3l18 18" />
                          </svg>
                        )}
                      </td>
                      <td data-et="Iscritti" className="mm-num">{inLista}</td>
                      <td data-et="Entrati" className="mm-num">{entrati}</td>
                      <td className="mm-pieno whitespace-nowrap md:text-right">
                        <Link href={`/admin/eventi/${e.id}`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>{passata ? 'Riepilogo' : 'Live'}</Link>
                        <Link href={`/admin/eventi/${e.id}/modifica`} className="mm-btn mm-btn--muto" style={{ minHeight: 36 }}>Modifica</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </>
  );
}
