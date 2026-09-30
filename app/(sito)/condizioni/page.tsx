import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legale';

export const metadata: Metadata = { title: 'Termini della lista' };

export default function Condizioni() {
  return (
    <PaginaLegale titolo="Termini della lista" aggiornata="30.09.2026">
      <h2>Come funziona la lista</h2>
      <ul>
        <li>Metterti in lista è gratis e non è un acquisto: il prezzo indicato si paga alla porta, in contanti o con carta.</li>
        <li>Un solo QR a persona per serata. Il QR è nominativo: alla porta mostri un documento e il nome deve combaciare.</li>
        <li>L&apos;iscrizione è valida fino a esaurimento dei posti in lista o alla chiusura indicata.</li>
      </ul>
      <h2>Età</h2>
      <p>Ogni serata ha un&apos;età minima (di solito 18 anni). Chi non la raggiunge non può iscriversi né entrare.</p>
      <h2>Ingresso</h2>
      <ul>
        <li>Il QR vale un solo ingresso. Se è già stato usato, alla porta risulta &quot;già entrato&quot;.</li>
        <li>L&apos;organizzazione può rifiutare l&apos;ingresso per motivi di sicurezza, capienza o comportamento, e annullare iscrizioni false o doppie.</li>
        <li>In caso di annullamento della serata ti avvisiamo per email. Chi ha già pagato al proprio PR viene rimborsato da Maremma Musica.</li>
      </ul>
      <h2>Contatti</h2>
      <p>[RAGIONE SOCIALE, SEDE, P.IVA] — maremmamusica@gmail.com.</p>
    </PaginaLegale>
  );
}
