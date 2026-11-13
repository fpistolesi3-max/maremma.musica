import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legale';
import { EMAIL_CONTATTI, TITOLARE } from '@/lib/costanti';

export const metadata: Metadata = { title: 'Privacy' };

// Testo adattato dal Pacchetto legale (13.11.2026): documenti-legali/03-informativa-privacy.md.
// Bozza in attesa di revisione legale. TODO: cliente — sede, C.F., REA, PEC, referente; scelte sulle foto (tempi, regole).
const TRATTAMENTI: { quando: string; dati: string; perche: string; base: string; quanto: string }[] = [
  {
    quando: 'Ti metti in lista per una serata',
    dati: 'Nome, cognome, data di nascita, email; serata e tipo di prevendita; PR e canale da cui arrivi; data e ora dell’iscrizione; QR e codice.',
    perche: 'Metterti in lista, mandarti il QR, farti entrare.',
    base: 'Contratto (art. 6.1.b GDPR).',
    quanto: 'Nome, cognome, email e data di nascita si cancellano 30 giorni dopo la serata. Restano dati senza nome (vedi «Dopo 30 giorni»).',
  },
  {
    quando: 'Paghi (prevendita o tavolo)',
    dati: 'Importo, esito e identificativo del pagamento. Non vediamo il numero della tua carta. A Stripe mandiamo email, importo e una descrizione (per la prevendita: serata, nome e cognome).',
    perche: 'Incassare, verificare l’importo, restituire i soldi quando dovuto.',
    base: 'Contratto; obbligo di legge per i dati contabili (art. 6.1.c).',
    quanto: 'Dati contabili 10 anni (art. 2220 c.c.), presso Stripe e il nostro commercialista. Sul sito resta solo l’identificativo del pagamento.',
  },
  {
    quando: 'Prenoti un tavolo',
    dati: 'Nome, cognome, email, telefono, numero di persone, tavolo, spesa minima.',
    perche: 'Tenerti il tavolo, farti pagare, avvisarti, contattarti per il pagamento, farti entrare.',
    base: 'Contratto.',
    quanto: 'Nome, cognome, email e telefono si cancellano 30 giorni dopo la serata.',
  },
  {
    quando: 'Alla porta',
    dati: 'Nome, cognome, data di nascita, categoria della prevendita, stato, orario d’ingresso. Il documento lo guarda lo staff: non lo fotocopiamo e non ne scriviamo il numero.',
    perche: 'Farti entrare, controllare età minima e categoria, evitare QR copiati e doppi ingressi.',
    base: 'Contratto; legittimo interesse alla sicurezza dell’evento (art. 6.1.f).',
    quanto: 'L’elenco sui telefoni dello staff si cancella entro 12 ore dalla fine della serata. Il resto come sopra.',
  },
  {
    quando: 'Ricevi le email del servizio',
    dati: 'Email, nome e contenuto del messaggio (QR, promemoria, link per pagare, annullamenti, rimborsi, recupero del QR).',
    perche: 'Eseguire il servizio che hai chiesto.',
    base: 'Contratto.',
    quanto: 'Le email partono dal nostro servizio di invio; non ne teniamo copia sul sito oltre il necessario.',
  },
  {
    quando: 'Arrivi da un PR o da un canale (Instagram, ecc.)',
    dati: 'PR e canale da cui sei arrivato (anche in un cookie di 3 giorni), poi salvati con la tua iscrizione.',
    perche: 'Sapere da chi e da dove arrivano i clienti, riconoscere il lavoro dei PR.',
    base: 'Legittimo interesse (art. 6.1.f).',
    quanto: 'Cookie 3 giorni. Sull’iscrizione fino a 30 giorni dopo la serata; PR e canale restano poi senza il tuo nome.',
  },
  {
    quando: 'Navighi sul sito',
    dati: 'Indirizzo IP, data e ora, pagine, tipo di browser e dispositivo (nei registri tecnici dei fornitori).',
    perche: 'Far funzionare e proteggere il sito, fermare i programmi automatici.',
    base: 'Legittimo interesse.',
    quanto: 'Secondo i tempi dei fornitori, di norma brevi.',
  },
  {
    quando: 'Ci scrivi',
    dati: 'Nome, email, contenuto del messaggio.',
    perche: 'Risponderti.',
    base: 'Contratto o legittimo interesse.',
    quanto: 'Il tempo necessario a risponderti e a seguire la tua richiesta.',
  },
  {
    quando: 'Ci sono contestazioni (pagamenti contestati, reclami)',
    dati: 'Dati dell’ordine e delle comunicazioni.',
    perche: 'Difendere i nostri diritti.',
    base: 'Legittimo interesse.',
    quanto: 'Fino alla chiusura della questione.',
  },
  {
    quando: 'Sei un PR o fai parte dello staff',
    dati: 'Email, ruolo, nome visualizzato, attività sul sito.',
    perche: 'Darti l’accesso e far funzionare il lavoro.',
    base: 'Contratto o lettera di incarico; legittimo interesse alla sicurezza.',
    quanto: 'Finché dura l’incarico.',
  },
];

export default function Privacy() {
  return (
    <PaginaLegale titolo="Privacy" aggiornata="13.11.2026">
      <p>Informativa ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 («GDPR»). Spiega come trattiamo i dati di chi visita il sito, si mette in lista, prenota un tavolo o lavora con noi come PR o staff. Per i cookie vedi la pagina Cookie.</p>

      <h2>Chi è il titolare</h2>
      <p>Titolare del trattamento: <strong>{TITOLARE.nome}</strong>, impresa individuale con sede a {TITOLARE.comune} [indirizzo da completare], P.IVA {TITOLARE.piva}. Scrivi a <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a> per qualsiasi questione sui tuoi dati. Non abbiamo un responsabile della protezione dei dati (DPO): non siamo obbligati a nominarlo.</p>

      <h2>Quali dati, perché, per quanto tempo</h2>
      {TRATTAMENTI.map((t) => (
        <div key={t.quando} className="trattamento">
          <h3>{t.quando}</h3>
          <ul>
            <li><strong>Dati:</strong> {t.dati}</li>
            <li><strong>Perché:</strong> {t.perche}</li>
            <li><strong>Base giuridica:</strong> {t.base}</li>
            <li><strong>Per quanto tempo:</strong> {t.quanto}</li>
          </ul>
        </div>
      ))}
      <p><strong>Dopo 30 giorni.</strong> Cancelliamo nome, cognome, email, data di nascita (e il telefono dei tavoli). Restano: l’età che avevi alla serata, il tipo di prevendita, l’importo, il PR o il sito da cui sei arrivato, il canale, la data e l’ora dell’acquisto, l’ingresso sì/no con l’orario e l’identificativo del pagamento. Da questi dati non possiamo più risalire a te, se non tramite i dati che tiene Stripe. Ci servono per le statistiche.</p>
      <p><strong>Se non ci dai i dati.</strong> Per la prevendita servono nome, cognome, data di nascita ed email: senza non possiamo emettere il QR. Per il tavolo serve anche il telefono. Non usiamo i tuoi dati per mandarti pubblicità o newsletter: le email che ricevi sono solo quelle del servizio che hai chiesto. Se un giorno lo faremo, ti chiederemo prima un consenso separato e aggiorneremo questa pagina.</p>
      <p><strong>Dati di altre persone.</strong> Ogni persona compila i propri dati. Se ci scrivi i dati di un’altra persona, assicurati che ne sia informata e che abbia letto questa pagina. Non chiediamo dati su salute, opinioni o altre categorie particolari: non scriverli nei messaggi.</p>

      <h2>Chi vede i tuoi dati</h2>
      <ul>
        <li><strong>Noi</strong> e chi lavora con noi, autorizzato e istruito. Lo <strong>staff alla porta</strong> vede nome, cognome, data di nascita, categoria e stato di chi è in lista, sul proprio telefono, per la durata della serata. Il <strong>PR</strong> vede soltanto le persone della propria lista che hanno pagato o sono entrate (nome, cognome, stato, importo, orario) e, per i tavoli che inserisce lui, telefono ed email del cliente, per aiutarlo a pagare. Delle prevendite non pagate vede solo quante sono. Gli altri PR non vedono niente di te.</li>
        <li><strong>Fornitori che trattano i dati per nostro conto</strong> (art. 28 GDPR): Vercel (hosting del sito), Supabase (database e file), il servizio di invio delle email e il gestore del dominio.</li>
        <li><strong>Stripe</strong>, che incassa i pagamenti e li tratta come titolare autonomo per i propri obblighi (antifrode, antiriciclaggio). Informativa: stripe.com/it/privacy.</li>
        <li>Il nostro commercialista e consulenti, e le autorità quando la legge lo impone.</li>
        <li><strong>OpenFreeMap</strong>: nella pagina di una serata la sezione «Come arrivare» mostra una mappa. Si carica solo quando la sezione sta per comparire e solo se la location non è segreta. Il servizio riceve il tuo indirizzo IP per mandarti la mappa; non usa cookie. I pulsanti «Apri in Google Maps», «Apple Maps» e «Waze» ti portano fuori dal sito solo se li tocchi.</li>
      </ul>
      <p>Non vendiamo né cediamo i tuoi dati a terzi. L’elenco aggiornato dei responsabili si può chiedere a {EMAIL_CONTATTI}.</p>

      <h2>Foto delle serate</h2>
      <p>Alle serate possono essere scattate foto da noi o da fotografi incaricati. Le pubblichiamo sul sito, nella pagina della serata passata, nella Galleria e nella home. Le foto sono visibili a chiunque visiti il sito; non c’è un pulsante per scaricarle.</p>
      <ul>
        <li><strong>Base giuridica:</strong> il nostro legittimo interesse a documentare e promuovere le serate (art. 6.1.f). Comprare il biglietto non vale come autorizzazione all’uso della tua immagine.</li>
        <li><strong>All’ingresso</strong> c’è un cartello che avvisa che si fanno foto. Puoi dire al fotografo che non vuoi essere ripreso. Le foto in posa si fanno solo a chi lo chiede o accetta l’invito.</li>
        <li><strong>Rimozione:</strong> se ti riconosci in una foto e vuoi toglierla, scrivi a {EMAIL_CONTATTI} (oggetto «Rimozione foto», con la serata). La eliminiamo il prima possibile. Chi ha già salvato una copia non è sotto il nostro controllo, e un’immagine può restare visibile ancora un giorno a chi ha il link diretto.</li>
        <li><strong>Posizione:</strong> le foto non contengono dati di posizione (GPS) né dati nascosti, perché le ridisegniamo prima di caricarle.</li>
      </ul>

      <h2>Trasferimenti fuori dall’Unione europea</h2>
      <p>Il database è a Francoforte e le funzioni del sito girano in Germania. Alcuni fornitori (Vercel, Supabase, Stripe) appartengono a gruppi con sede negli Stati Uniti: i dati possono quindi essere accessibili da lì, per esempio per assistenza o sicurezza. In questi casi il trasferimento si basa sulla decisione di adeguatezza della Commissione europea (EU-US Data Privacy Framework) per i fornitori certificati, oppure sulle clausole contrattuali tipo (art. 46 GDPR). Puoi chiederci copia delle garanzie.</p>

      <h2>Come ti proteggiamo</h2>
      <p>Connessione cifrata (HTTPS), accessi riservati con ruoli (admin, staff, PR) senza password salvate (link o codice monouso via email), QR firmati e non indovinabili, dati nell’Unione europea, cancellazione automatica dei dati personali dopo 30 giorni. Se avvenisse una violazione dei dati la notificheremo al Garante entro 72 ore e, se il rischio per te fosse alto, anche a te.</p>

      <h2>I tuoi diritti</h2>
      <p>Puoi chiederci in ogni momento di sapere quali dati abbiamo e averne copia (art. 15), correggerli (art. 16), cancellarli (art. 17), limitarne l’uso (art. 18), riceverli in formato elettronico o farli passare a un altro titolare (art. 20), e di opporti ai trattamenti fondati sul legittimo interesse (art. 21).</p>
      <p>Scrivi a {EMAIL_CONTATTI}. Rispondiamo entro un mese (fino a due mesi in più per richieste complesse, avvisandoti). Se ci sono dubbi sulla tua identità ti chiederemo conferma: di solito basta rispondere dall’email che ci hai dato. Dopo i 30 giorni i tuoi dati personali sono già cancellati e non possiamo più ritrovare la tua iscrizione. Se ritieni che il trattamento violi la legge puoi presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it) o rivolgerti al giudice.</p>

      <h2>Decisioni automatizzate e minori</h2>
      <p>Non prendiamo decisioni basate solo su trattamenti automatizzati che producano effetti significativi su di te. Le serate sono rivolte a maggiorenni, salvo l’età minima diversa indicata nella pagina di ogni serata. Non raccogliamo consapevolmente dati di minori di 14 anni: se ce ne accorgiamo li cancelliamo.</p>

      <h2>Altri siti e modifiche</h2>
      <p>Il sito ha link a Instagram, Google Maps, Apple Maps, Waze e WhatsApp: su quelle piattaforme valgono le loro informative. Possiamo aggiornare questa pagina: vale la versione pubblicata, con la data in alto. Se i cambiamenti sono importanti avvisiamo chi ha un biglietto o un tavolo.</p>
    </PaginaLegale>
  );
}
