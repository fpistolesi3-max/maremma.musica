import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legale';
import { EMAIL_CONTATTI, TITOLARE } from '@/lib/costanti';

export const metadata: Metadata = { title: 'Cookie' };

// Testo adattato dal Pacchetto legale (13.11.2026): documenti-legali/04-cookie-policy.md.
// Bozza in attesa di revisione legale: `mm_pr` e `mm_canale` vanno confermati come tecnici (o tolti, o messi dietro un banner).
export default function Cookie() {
  return (
    <PaginaLegale titolo="Cookie" aggiornata="13.11.2026">
      <p>Informativa ai sensi dell’art. 122 del d.lgs. 196/2003, degli artt. 12–13 del GDPR e delle Linee guida del Garante del 10 giugno 2021. Titolare: {TITOLARE.nome} (contatti: {EMAIL_CONTATTI}).</p>

      <h2>In breve</h2>
      <p>Il sito non usa cookie di profilazione, né statistiche, né pubblicità, né pixel, né video o social incorporati. Per questo non ti chiediamo il consenso con un banner. Usiamo solo gli strumenti qui sotto, che servono a far funzionare il sito e a ricordare da quale PR o canale sei arrivato.</p>

      <h2>Cookie</h2>
      <ul>
        <li><strong>mm_pr</strong> (3 giorni). Se arrivi dal link di un PR, ricorda il nome di quel PR (non contiene dati tuoi), così quando ti metti in lista l’iscrizione risulta nella sua lista. Vince l’ultimo link che apri. Si toglie scegliendo «Continua nella Lista Maremma Musica».</li>
        <li><strong>mm_canale</strong> (3 giorni). Ricorda da quale canale sei arrivato (per esempio Instagram, WhatsApp o la locandina), così quando ti metti in lista lo associamo all’iscrizione. Si imposta solo se il sito riconosce la provenienza. Non contiene dati tuoi.</li>
        <li><strong>mm_sessione</strong> (30 giorni, o fino all’uscita). Solo per PR, staff e crew: tiene aperto l’accesso all’area riservata. Non è leggibile dai programmi della pagina (httpOnly) e viaggia solo su connessione cifrata.</li>
      </ul>

      <h2>Memoria del browser</h2>
      <ul>
        <li><strong>mm_biglietti</strong> (localStorage). Sul tuo telefono ricorda fino a 12 tuoi biglietti (id, email, nome, serata, data) per ritrovarli in «Il mio QR». Non viene inviata a nessuno. Le voci di serate finite da più di 12 ore si cancellano da sole; puoi cancellarle prima svuotando i dati del sito.</li>
        <li><strong>mm-intro</strong> (sessionStorage). Un segno «hai già visto l’animazione di apertura», per non rifarla a ogni pagina. Dura fino alla chiusura della scheda. Lo stesso vale per <strong>mm-caricamento</strong>, il segno «hai già visto la schermata di caricamento».</li>
        <li><strong>Solo per lo staff:</strong> l’elenco della serata e gli ingressi non ancora inviati (localStorage), e una copia della pagina della porta (cache del browser), per lavorare senza campo. L’elenco si cancella alla prima apertura del sito dopo 12 ore dalla fine della serata.</li>
      </ul>

      <h2>Terze parti</h2>
      <ul>
        <li><strong>Stripe</strong> (pagamento): quando paghi vieni portato alla pagina di pagamento di Stripe, su un dominio di Stripe. Stripe può usare i propri cookie per sicurezza e prevenzione delle frodi; non li gestiamo noi. Informativa: stripe.com/it/legal/cookies-policy.</li>
        <li><strong>OpenFreeMap</strong> (mappa «Come arrivare»): non usa cookie. Riceve il tuo indirizzo IP per mandarti la mappa (vedi la pagina Privacy). Si carica solo quando serve.</li>
        <li><strong>Link in uscita</strong> (Google Maps, Apple Maps, Waze, Instagram, WhatsApp): se li tocchi esci dal sito e valgono le loro regole.</li>
        <li><strong>Apple Wallet e Google Wallet</strong>: previsti ma non attivi. Quando li attiveremo aggiorneremo questa pagina.</li>
      </ul>

      <h2>Come gestirli</h2>
      <p>Puoi bloccare o cancellare cookie e dati del sito dalle impostazioni del browser. Se blocchi i cookie tecnici, alcune parti possono non funzionare (per esempio l’accesso riservato). Cancellare mm_pr o mm_canale non cambia il prezzo né ti toglie dal sito: cambia solo l’attribuzione della tua prossima iscrizione.</p>

      <h2>Se in futuro cambia qualcosa</h2>
      <p>Se aggiungeremo strumenti di statistica, pubblicità o contenuti di terzi con cookie, ti chiederemo prima il consenso con un banner e aggiorneremo questa pagina.</p>
      <p>I tuoi diritti e come esercitarli sono nella pagina Privacy.</p>
    </PaginaLegale>
  );
}
