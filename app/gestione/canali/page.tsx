import { richiedi } from '@/lib/sessione';
import { canaliSerata, type RigaCanale } from '@/lib/dati/gestione-pr';
import { CANALI, CANALI_CONDIVISIBILI } from '@/lib/canali';
import { dataPunti, giornoSett } from '@/lib/formato';
import { Resa, Riquadro, SceltaSerata } from '@/components/gestione';
import { AggiornamentoLive } from '@/components/admin/live';
import { LinkCanale } from '@/components/gestione-client';

export const metadata = { title: 'Canali' };

type Props = { searchParams: Promise<{ serata?: string }> };

/**
 * Chi si mette in lista senza passare da un PR: da quale social o link arriva, quanti entrano.
 * L'admin lo usa per capire quanto rendono i social della crew.
 */
export default async function Canali({ searchParams }: Props) {
  const s = await richiedi(['admin'], '/gestione/canali');
  const { serata } = await searchParams;
  const c = await canaliSerata(s, (serata as string) ?? null);
  const tot = c.senzaPr.numeri.inLista + c.conPr.numeri.inLista;
  const social = c.senzaPr.canali.filter((r) => !['diretto', 'sito'].includes(r.canale)).reduce((t, r) => t + r.inLista, 0);

  return (
    <>
      <div className="flex flex-col gap-4 border-b border-linea px-4 pb-6 pt-6 md:flex-row md:items-end md:justify-between md:px-10">
        <div className="flex flex-col gap-[10px]">
          <span className="font-mono text-[11px] text-osso-2">GESTIONE / CANALI</span>
          <h1 className="m-0 font-display text-[44px] font-black uppercase leading-[.85] md:text-[64px]">Senza PR</h1>
          <span className="font-mono text-[12px] text-osso-2">
            {c.evento ? `${giornoSett(c.evento.data)} ${dataPunti(c.evento.data)} · ${c.evento.nome.toUpperCase()}` : 'TUTTE LE SERATE'} · DA DOVE ARRIVA CHI SI ISCRIVE DA SOLO
          </span>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <SceltaSerata azione="/gestione/canali" eventi={c.eventi} scelto={c.evento?.id ?? 'tutte'} />
          <AggiornamentoLive ogniSecondi={10} aggiornatoAt={new Date().toISOString()} />
        </div>
      </div>

      <div className="grid grid-cols-2 border-l border-linea lg:grid-cols-4">
        <Riquadro etichetta="In lista senza PR" valore={c.senzaPr.numeri.inLista} nota={tot ? `${Math.round((c.senzaPr.numeri.inLista / tot) * 100)}% DEL TOTALE · +${c.senzaPr.numeri.nuovi24h} IN 24H` : undefined} />
        <Riquadro etichetta="Entrati senza PR" valore={c.senzaPr.numeri.entrati} colore="text-ok" nota={c.senzaPr.numeri.resa != null ? `RESA ${c.senzaPr.numeri.resa}%` : 'LA PORTA NON È ANCORA APERTA'} />
        <Riquadro etichetta="Dai social" valore={social} nota={c.senzaPr.numeri.inLista ? `${Math.round((social / c.senzaPr.numeri.inLista) * 100)}% DI CHI ARRIVA SENZA PR` : undefined} />
        <Riquadro etichetta="Dai PR, per confronto" valore={c.conPr.numeri.inLista} nota={c.conPr.numeri.resa != null ? `RESA ${c.conPr.numeri.resa}%` : `${c.conPr.numeri.entrati} ENTRATI`} />
      </div>

      <div className="grid gap-x-12 px-4 md:px-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <Tabella titolo="Per canale · senza PR" righe={c.senzaPr.canali} vuoto="Ancora nessuno si è iscritto da solo." />
          <Tabella titolo="Come vengono aperti i link dei PR" righe={c.conPr.canali} vuoto="Nessuna iscrizione dai PR." piccola />
          <p className="m-0 pb-8 text-[13px] leading-5 text-osso-3">
            Il canale si riconosce da solo: dal social da cui arriva la persona (Instagram, Facebook e TikTok aprono il sito nel loro browser)
            o dal link etichettato. &quot;Diretto&quot; è chi ha scritto l&apos;indirizzo o ha aperto un link senza etichetta, per esempio da WhatsApp.
          </p>
        </div>
        <aside className="flex min-w-0 flex-col gap-2 border-t border-linea py-6 lg:border-t-0">
          <h2 className="m-0 font-display text-[26px] font-black uppercase leading-none">Link da usare</h2>
          <span className="pb-2 text-[14px] leading-5 text-osso-2">
            Per contare bene chi arriva da un post, una storia o la locandina, usa il link del canale giusto.
            {c.evento ? '' : ' Scegli una serata per avere i link.'}
          </span>
          {c.evento && CANALI_CONDIVISIBILI.map((k) => (
            <LinkCanale key={k} etichetta={CANALI[k]} percorso={`/e/${c.eventi.find((e) => e.id === c.evento!.id)?.slug}?da=${k}`} />
          ))}
        </aside>
      </div>
    </>
  );
}

function Tabella({ titolo, righe, vuoto, piccola }: { titolo: string; righe: RigaCanale[]; vuoto: string; piccola?: boolean }) {
  return (
    <section className="flex flex-col gap-[10px] py-6">
      <h2 className={`m-0 font-display font-black uppercase leading-none ${piccola ? 'text-[20px]' : 'text-[26px]'}`}>{titolo}</h2>
      <div className="mm-scroll">
        <table className="mm-classifica">
          <thead><tr><th>Canale</th><th className="mm-num">In lista</th><th className="mm-num">Quota</th><th className="mm-num">24h</th><th className="mm-num">Entrati</th><th style={{ width: '26%' }}>Resa</th></tr></thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.canale}>
                <td className="mm-classifica__nome">{r.etichetta}</td>
                <td className="mm-num">{r.inLista}</td>
                <td><div className="flex items-center justify-end gap-2"><div className="mm-barra" style={{ minWidth: 48, width: 48 }}><span style={{ width: `${r.quota}%` }} /></div><span className="w-9 text-right font-mono text-[12px] text-osso-2">{r.quota}%</span></div></td>
                <td className="mm-num text-arancio">+{r.nuovi24h}</td>
                <td className="mm-num">{r.entrati}</td>
                <td><Resa valore={r.resa} /></td>
              </tr>
            ))}
            {righe.length === 0 && <tr><td colSpan={6} className="text-osso-2">{vuoto}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
