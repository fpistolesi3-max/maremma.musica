import type { Pr, Ruolo, Utente } from './dati/tipi';
import { percorsoDopoAccesso } from './regole';

// Quali aree apre ciascun ruolo e dove si va dopo l'accesso. Solo regole, niente cookie né reindirizzamenti (si provano coi test).

/** Quali aree può aprire un ruolo (evita i giri tra /accedi e una pagina vietata). */
export function puoAprire(ruolo: Ruolo, percorso: string) {
  if (ruolo === 'admin') return true;
  if (percorso.startsWith('/admin')) return false;
  if (percorso.startsWith('/door')) return ruolo === 'staff';
  if (percorso.startsWith('/gestione')) return false; // vecchio indirizzo dell'area PR dell'admin
  if (percorso === '/pr' || percorso.startsWith('/pr/')) return ruolo === 'pr';
  return true;
}

export function destinazionePer(utente: Utente, pr: Pr | null, dopo?: string | null) {
  const meta = percorsoDopoAccesso(dopo, '');
  if (meta && meta !== '/pr' && puoAprire(utente.ruolo, meta)) return meta;
  if (utente.ruolo === 'admin') return '/admin';
  if (utente.ruolo === 'staff') return '/door';
  return pr ? `/pr/${pr.handle}` : '/';
}
