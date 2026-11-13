import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legale';
import { EMAIL_CONTATTI, TITOLARE } from '@/lib/costanti';

export const metadata: Metadata = { title: 'Termini e condizioni' };

// Testo adattato dal Pacchetto legale (13.11.2026): documenti-legali/05-termini-e-condizioni-di-vendita.md.
// Bozza in attesa di revisione legale. TODO: cliente — sede, REA, PEC; scelte su rinvio, tavoli, categorie, rientro, biglietteria fiscale.
export default function Condizioni() {
  return (
    <PaginaLegale titolo="Termini e condizioni" aggiornata="13.11.2026">
      <p>Regole d’uso del sito e di vendita di prevendite e tavoli. Vale la versione pubblicata al momento dell’ordine, richiamata nell’email di conferma.</p>

      <h2>1 · Chi vende</h2>
      <p>Il sito è gestito da <strong>{TITOLARE.nome}</strong>, impresa individuale con sede a {TITOLARE.comune} [indirizzo da completare], P.IVA {TITOLARE.piva} («Organizzatore»). Contatti: {EMAIL_CONTATTI}. Il PR che ti manda il link non vende, non incassa e non è parte del contratto.</p>

      <h2>2 · Come si compra</h2>
      <ul>
        <li>Ogni serata ha un’<strong>età minima</strong> (di solito 18 anni): chi non la raggiunge non può iscriversi né entrare. Un solo QR a persona per serata: ognuno compila i propri dati.</li>
        <li>Scegli la serata, scrivi nome, cognome, data di nascita ed email, accetti questi termini e premi «Acquista e paga». Il posto resta <strong>tenuto per 30 minuti</strong> mentre paghi; se il pagamento non arriva torna libero.</li>
        <li><strong>Il contratto è concluso quando il pagamento è ricevuto.</strong> Subito dopo il sito mostra il QR e lo manda per email: questa email è la conferma d’ordine. Le serate a ingresso gratuito non chiedono pagamenti: il QR arriva subito.</li>
        <li>Possiamo non accettare o annullare un ordine con dati falsi, incompleti o doppi (per esempio due QR a nome della stessa persona) o se i posti sono finiti; in quel caso restituiamo quanto pagato.</li>
        <li>I prezzi sono in euro e sono quelli del tipo di prevendita in vendita al momento dell’ordine. Il totale è mostrato prima di pagare e non ci sono altri importi dopo. Il prezzo può cambiare nel tempo (fasce, Early bird) senza diritto a rimborsi.</li>
        <li>Si paga <strong>solo online</strong>, con carta, Apple Pay o Google Pay, sulla pagina di Stripe. Non vediamo né conserviamo i dati della carta. Alla serata non si compra la prevendita.</li>
      </ul>

      <h2>3 · Il biglietto</h2>
      <ul>
        <li>Il biglietto è <strong>nominativo e personale</strong>: arriva per email (QR e codice di 8 caratteri) e si ritrova da «Il mio QR». <strong>Alla porta mostri il QR e un documento: nome e cognome devono combaciare.</strong> Non fotocopiamo il documento e non ne scriviamo il numero.</li>
        <li>Il QR vale <strong>un solo ingresso</strong> per la serata indicata. Una copia presentata dopo il primo ingresso è rifiutata.</li>
        <li>Nelle serate «senza telefono» il QR non c’è: alla porta basta il documento e il nome nella lista.</li>
        <li>Nelle prevendite con <strong>categoria riservata</strong> (per esempio «Donne») lo staff controlla alla porta che tu rientri nella categoria. Se non rientri, l’ingresso con quella prevendita è negato; il rimborso lo decide l’Organizzatore.</li>
        <li>Il biglietto non è cedibile. Per cambiare nome scrivi a {EMAIL_CONTATTI} prima della serata. È vietata la rivendita (art. 1, comma 545 e seguenti, legge 232/2016). Non garantiamo la validità di biglietti comprati da altri canali.</li>
      </ul>

      <h2>4 · Nessun diritto di recesso</h2>
      <p>La prevendita e il tavolo sono servizi per il tempo libero da eseguire in una data determinata. Ai sensi dell’<strong>art. 59, comma 1, lettera n) del Codice del consumo non c’è diritto di recesso</strong> dopo l’acquisto. Ne sei informato prima di pagare e nell’email di conferma. Il biglietto non usato, anche per arrivo dopo l’orario limite, non è rimborsato, salvo i casi del punto 5.</p>

      <h2>5 · Annullamento, rinvio, rimborsi</h2>
      <ul>
        <li><strong>Serata annullata:</strong> restituiamo l’intero importo sullo stesso strumento di pagamento, senza che tu debba chiederlo. La commissione di Stripe resta a nostro carico. Ti avvisiamo per email e sul sito.</li>
        <li><strong>Serata rinviata:</strong> il biglietto vale per la nuova data; se non puoi partecipare scrivi a {EMAIL_CONTATTI} per il rimborso entro 15 giorni dalla comunicazione.</li>
        <li><strong>Cambi non sostanziali</strong> (artisti di supporto, ordine degli artisti, piccoli orari): nessun rimborso. Se l’artista indicato come principale non suona e non è sostituito da uno di livello comparabile, puoi chiedere il rimborso prima dell’inizio.</li>
        <li><strong>Pagamenti che non valgono:</strong> se paghi quando il posto non c’è più (tempo scaduto e posti finiti, serata già iniziata, hai già un altro QR per quella serata), se paghi due volte o con un importo diverso dal prezzo, restituiamo quanto pagato.</li>
        <li>Se il rimborso spetta per annullamento per cause non imputabili (forza maggiore, maltempo, ordine dell’autorità), non rimborsiamo viaggi, alloggi e simili. Restano i diritti che la legge non permette di togliere. I soldi tornano sulla carta di solito in 5–10 giorni lavorativi.</li>
      </ul>

      <h2>6 · Ingresso e comportamento</h2>
      <ul>
        <li><strong>Orario limite.</strong> La prevendita vale per entrare fino all’orario indicato nella pagina della serata, nel modulo di acquisto e nel biglietto (di solito l’una di notte). Dopo quell’ora il QR non dà più accesso e la vendita online si chiude. Chi è già entrato resta dentro. I tavoli non hanno orario limite.</li>
        <li>L’Organizzatore e il personale di sicurezza possono negare l’ingresso o allontanare, senza rimborso, chi non ha un biglietto valido, l’età o il documento richiesti; è in evidente stato di alterazione; è violento, molesto, discriminatorio o pericoloso; porta armi, oggetti pericolosi, vetro, sostanze illecite o bevande dall’esterno; rifiuta i controlli di sicurezza o le indicazioni del personale.</li>
        <li>Se l’ingresso è negato per motivi non dovuti a te (per esempio capienza raggiunta o locale chiuso), restituiamo quanto pagato.</li>
        <li>Le bevande alcoliche si servono solo a maggiorenni. Negli spazi interni è vietato fumare. Chi causa danni ne risponde personalmente.</li>
      </ul>

      <h2>7 · Tavoli</h2>
      <ul>
        <li>Il tavolo si prenota dal sito con nome, cognome, email, telefono e numero di persone. Il telefono serve per contattarti sul tavolo e sul pagamento.</li>
        <li><strong>La spesa minima si paga subito, online</strong>, entro 30 minuti; se non arriva il tavolo torna libero. Se la richiesta è inserita da un PR o dalla crew, ricevi per email un link per pagare entro 24 ore.</li>
        <li>Il QR del tavolo è unico e vale per tutto il gruppo: ogni passaggio fa entrare una persona, fino al numero prenotato. Una persona in più compra una prevendita.</li>
        <li>Dopo il pagamento il tavolo non si annulla da solo: scrivi a {EMAIL_CONTATTI}. Annullamento e rimborso li decide l’Organizzatore (sempre rimborsato se la serata è annullata, o se il tavolo risulta già assegnato).</li>
      </ul>

      <h2>8 · Foto</h2>
      <p>Durante le serate noi o fotografi incaricati facciamo foto dell’ambiente, del pubblico e di singole persone, e le pubblichiamo sul sito per documentare e promuovere le serate. Questo si fonda sul nostro legittimo interesse: comprare il biglietto non vale come autorizzazione all’uso della tua immagine. All’ingresso c’è un cartello. Foto in posa solo a chi lo chiede o accetta; foto in primo piano e uso in pubblicità solo con il tuo consenso scritto. Se non vuoi essere ripreso dillo al personale o al fotografo. Per far togliere una foto scrivi a {EMAIL_CONTATTI}: la eliminiamo. Non usiamo le immagini in contesti che ledano onore, reputazione o decoro. Vedi la pagina Privacy.</p>

      <h2>9 · Responsabilità, assistenza, legge</h2>
      <ul>
        <li>Rispondiamo dei danni causati dai nostri inadempimenti nei limiti di legge. Non rispondiamo di malfunzionamenti del sito o dei pagamenti dovuti a terzi o alla rete, né di dati errati forniti da chi compra. Nulla qui esclude la responsabilità per dolo, colpa grave, morte o lesioni, né i diritti dei consumatori.</li>
        <li>Per assistenza e reclami scrivi a {EMAIL_CONTATTI}.</li>
        <li>Il contratto è regolato dalla legge italiana. Per le controversie con un consumatore è competente il giudice del luogo di residenza o domicilio del consumatore (art. 66-bis Codice del consumo). Il consumatore può rivolgersi a un organismo di risoluzione alternativa delle controversie (art. 141 e seguenti); l’Organizzatore non ha aderito in via preventiva ad alcun organismo e valuta caso per caso.</li>
        <li>I dati personali si trattano come descritto nella pagina Privacy e nella pagina Cookie. Possiamo aggiornare questi termini: valgono per gli ordini fatti dopo la pubblicazione.</li>
      </ul>
    </PaginaLegale>
  );
}
