import type { Biglietto } from '@/lib/dati/pubblico';
import { dataPunti, euro, giorno2, giornoSett, meseCorto, nascita, numeroEvento, ora, orari } from '@/lib/formato';
import { mostraCodice } from '@/lib/qr-token';
import { luogoTesto } from '@/lib/luogo';
import { ChipIscrizione } from './ui';
import { QrBiglietto } from './client';

/** Il biglietto (Ticket del DS): evento, strappo, QR, codice, titolare, piede con lo stato del pagamento. */
export function BigliettoQr({ b, appenaPagato = false }: { b: Biglietto; appenaPagato?: boolean }) {
  const { iscrizione: i, evento: e } = b;
  const annullato = i.stato === 'annullato' || i.stato === 'rimborsato';
  return (
    <article className="mm-biglietto" aria-label="Il tuo QR" style={{ maxWidth: 380 }}>
      <div className="mm-biglietto__testa">
        <span className="font-mono text-[11px] leading-[14px] tracking-[.04em] text-osso-2">{numeroEvento(e.numero)} · LISTA</span>
        <h2 className="mm-biglietto__titolo" style={{ fontSize: 44 }}>{e.nome}</h2>
        <span className="mm-biglietto__meta">{giornoSett(e.data)} {giorno2(e.data)} {meseCorto(e.data).toUpperCase()} · {orari(e.data, e.dataFine)} · {luogoTesto(e)}</span>
      </div>
      <div className="mm-biglietto__strappo" aria-hidden="true" />
      {e.senzaTelefono ? (
        <div className="px-6 py-8 text-center" style={annullato ? { opacity: 0.25 } : undefined}>
          <strong className="font-display text-[28px] font-black uppercase leading-none">Porta un documento</strong>
          <p className="mx-0 mb-0 mt-3 text-[15px] leading-[22px]">Serata senza telefono: alla porta lo staff controlla che nome, cognome e data di nascita qui sotto corrispondano al documento.</p>
        </div>
      ) : (
        <>
          <div className="mm-biglietto__qr" style={annullato ? { opacity: 0.25 } : undefined}>
            <QrBiglietto valore={i.tokenQr} etichetta={`Codice QR di ${i.nome} ${i.cognome}`} stampa={appenaPagato} />
          </div>
          <div className="mm-biglietto__codice" aria-label={`Codice ${mostraCodice(i.codice).split('').join(' ')}`}>{mostraCodice(i.codice)}</div>
        </>
      )}
      <dl className="mm-biglietto__dati">
        <div className="mm-biglietto__largo"><dt>Titolare</dt><dd>{i.nome} {i.cognome}</dd></div>
        <div><dt>Nascita</dt><dd>{nascita(i.dataNascita)}</dd></div>
        <div><dt>Lista</dt><dd>{b.lista}</dd></div>
        {i.categoria && <div className="mm-biglietto__largo"><dt>Prevendita riservata</dt><dd>{i.categoria} · documento alla porta</dd></div>}
      </dl>
      <div className="mm-biglietto__porta">
        <ChipIscrizione stato={i.stato} testo={i.stato === 'entrato' && i.oraCheckIn ? `Entrato ${ora(i.oraCheckIn)}` : undefined} />
        <span className="mm-biglietto__prezzo uppercase">
          {annullato ? 'Non valido' : i.importo > 0 ? `${euro(i.importo)} pagati` : 'Ingresso libero'}
        </span>
      </div>
    </article>
  );
}

export function titoloEvento(b: Biglietto) {
  return `${b.evento.nome} ${dataPunti(b.evento.data)}`;
}
