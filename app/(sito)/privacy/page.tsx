import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legale';

export const metadata: Metadata = { title: 'Privacy' };

export default function Privacy() {
  return (
    <PaginaLegale titolo="Privacy" aggiornata="30.09.2026">
      <h2>Chi tratta i tuoi dati</h2>
      <p>Titolare del trattamento: [RAGIONE SOCIALE, SEDE, P.IVA] — Maremma Musica. Contatto: maremmamusica@gmail.com.</p>
      <h2>Quali dati</h2>
      <ul>
        <li>Nome, cognome, data di nascita ed email che scrivi per metterti in lista.</li>
        <li>La lista (il PR) da cui arrivi, l&apos;orario dell&apos;iscrizione e dell&apos;ingresso alla porta.</li>
        <li>Se lo scegli, il consenso a ricevere email sulle prossime serate.</li>
      </ul>
      <h2>Perché</h2>
      <ul>
        <li>Metterti in lista, mandarti il QR e farti entrare: base giuridica, l&apos;esecuzione della tua richiesta.</li>
        <li>Controllare l&apos;età minima della serata e che il QR sia tuo: obbligo di legge e sicurezza dell&apos;evento.</li>
        <li>Avvisarti delle prossime serate, solo se hai spuntato la casella: consenso, revocabile quando vuoi.</li>
      </ul>
      <h2>Chi li vede</h2>
      <p>La crew di Maremma Musica, lo staff della porta la sera dell&apos;evento e il PR della lista da cui ti sei iscritto (solo nome, stato dell&apos;iscrizione e orario). Gli altri PR vedono solo numeri totali, mai i tuoi dati. Il servizio di email e l&apos;hosting del sito trattano i dati per nostro conto.</p>
      <h2>Per quanto</h2>
      <p>Nome, cognome, data di nascita ed email della lista li cancelliamo 30 giorni dopo la serata. Restano solo dati anonimi, come l’età alla serata e il tipo di prevendita, per le statistiche. Il consenso alle email vale finché non lo revochi.</p>
      <h2>La mappa della serata</h2>
      <p>Nella pagina di una serata «Come arrivare» mostra prima una cartina illustrata della Maremma, che è un’immagine del nostro sito e non chiama nessun servizio esterno. Solo se tocchi «Vedi la mappa» (o se la serata è fuori dalla Maremma, quando la sezione sta per comparire) la mappa vera si carica da OpenFreeMap, un servizio esterno. Come ogni servizio esterno riceve il tuo indirizzo IP, e non usa cookie.</p>
      <h2>I tuoi diritti</h2>
      <p>Puoi chiedere accesso, correzione, cancellazione, limitazione e portabilità dei tuoi dati, o opporti al trattamento, scrivendo a maremmamusica@gmail.com. Puoi anche rivolgerti al Garante per la protezione dei dati personali.</p>
    </PaginaLegale>
  );
}
