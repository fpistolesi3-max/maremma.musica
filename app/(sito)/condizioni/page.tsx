import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legale';

export const metadata: Metadata = { title: 'Termini della lista' };

export default function Condizioni() {
  return (
    <PaginaLegale titolo="Termini della lista" aggiornata="26.10.2026">
      <h2>Come funziona la lista</h2>
      <ul>
        <li>La prevendita si paga solo online, sul sito, con carta, Apple Pay o Google Pay. Il posto resta fermo per te per 30 minuti mentre paghi; se il pagamento non arriva in tempo torna libero.</li>
        <li>Il QR arriva per email subito dopo il pagamento. Le serate a ingresso gratuito non chiedono pagamenti: il QR arriva subito.</li>
        <li>Se il pagamento arriva quando il posto non è più disponibile (tempo scaduto e posti finiti, serata già iniziata, o hai già un altro QR) ti restituiamo i soldi sulla stessa carta.</li>
        <li>Alcune serate hanno anche l&apos;ingresso in cassa alla porta per chi non ha la prevendita, a un prezzo indicato nella pagina della serata; altre sono solo in prevendita.</li>
        <li>Un solo QR a persona per serata. Il QR è nominativo: alla porta mostri un documento e il nome deve combaciare.</li>
        <li>L&apos;iscrizione è valida fino a esaurimento dei posti in lista o alla chiusura indicata.</li>
      </ul>
      <h2>Età</h2>
      <p>Ogni serata ha un&apos;età minima (di solito 18 anni). Chi non la raggiunge non può iscriversi né entrare.</p>
      <h2>Ingresso</h2>
      <ul>
        <li>Il QR vale un solo ingresso. Se è già stato usato, alla porta risulta &quot;già entrato&quot;.</li>
        <li>L&apos;organizzazione può rifiutare l&apos;ingresso per motivi di sicurezza, capienza o comportamento, e annullare iscrizioni false o doppie.</li>
        <li>La prevendita pagata non si annulla dal sito. In caso di annullamento della serata ti avvisiamo per email e ti restituiamo i soldi sulla carta con cui hai pagato.</li>
      </ul>
      <h2>Contatti</h2>
      <p>[RAGIONE SOCIALE, SEDE, P.IVA] — maremmamusica@gmail.com.</p>
    </PaginaLegale>
  );
}
