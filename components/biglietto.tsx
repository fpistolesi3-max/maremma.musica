import type { Biglietto } from '@/lib/dati/pubblico';
import { dataPunti, euro, giorno2, giornoSett, meseCorto, nascita, numeroEvento, ora, orari } from '@/lib/formato';
import { mostraCodice } from '@/lib/qr-token';
import { luogoTesto } from '@/lib/luogo';
import { ChipIscrizione } from './ui';
import { QrBiglietto } from './client';

/** Il biglietto (Ticket del DS): evento, strappo, QR, codice, titolare, piede con quanto pagare alla porta. */
export function BigliettoQr({ b }: { b: Biglietto }) {
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
      <div className="mm-biglietto__qr" style={annullato ? { opacity: 0.25 } : undefined}>
        <QrBiglietto valore={i.tokenQr} etichetta={`Codice QR di ${i.nome} ${i.cognome}`} />
      </div>
      <div className="mm-biglietto__codice" aria-label={`Codice ${mostraCodice(i.codice).split('').join(' ')}`}>{mostraCodice(i.codice)}</div>
      <dl className="mm-biglietto__dati">
        <div className="mm-biglietto__largo"><dt>Titolare</dt><dd>{i.nome} {i.cognome}</dd></div>
        <div><dt>Nascita</dt><dd>{nascita(i.dataNascita)}</dd></div>
        <div><dt>Lista</dt><dd>{b.lista}</dd></div>
      </dl>
      <div className="mm-biglietto__porta">
        <ChipIscrizione stato={i.stato} testo={i.stato === 'entrato' && i.oraCheckIn ? `Entrato ${ora(i.oraCheckIn)}` : undefined} />
        <span className="mm-biglietto__prezzo uppercase">
          {annullato ? 'Non valido' : i.stato === 'in_lista' && i.importo > 0 ? `${euro(i.importo)} alla porta` : i.importo > 0 ? 'Pagato' : 'Ingresso libero'}
        </span>
      </div>
    </article>
  );
}

export function titoloEvento(b: Biglietto) {
  return `${b.evento.nome} ${dataPunti(b.evento.data)}`;
}
