import type { Metadata } from 'next';
import { PaginaLegale } from '@/components/legale';

export const metadata: Metadata = { title: 'Cookie' };

export default function Cookie() {
  return (
    <PaginaLegale titolo="Cookie" aggiornata="30.09.2026">
      <h2>Solo cookie tecnici</h2>
      <p>Il sito non usa cookie di profilazione né statistiche di terze parti. Per questo non ti chiediamo il consenso con un banner.</p>
      <h2>Quali usiamo</h2>
      <ul>
        <li><strong>mm_pr</strong> — ricorda per 3 giorni il link del PR da cui sei arrivato, così resti nella sua lista.</li>
        <li><strong>mm_sessione</strong> — solo per PR, staff e crew: tiene aperto l&apos;accesso all&apos;area riservata (30 giorni).</li>
      </ul>
      <h2>Sul tuo telefono</h2>
      <p>Il sito salva nel browser (localStorage) i link ai QR che hai ottenuto da quel telefono, per ritrovarli in &quot;Il mio QR&quot;. Puoi cancellarli svuotando i dati del sito dalle impostazioni del browser.</p>
    </PaginaLegale>
  );
}
