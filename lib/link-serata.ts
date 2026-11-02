import type { Archivio, Evento, Pr } from './dati/tipi';
import { eventoPassato } from './regole';
import { dataPunti, giornoSettLungo, ora, parti } from './formato';

// Il link personale di ogni PR per una serata, mandato a tutti in blocco per email (o girato su WhatsApp, un PR alla volta).
// Regole pure: chi riceve, quale link, che testo. L'invio vero sta in `lib/invio-link-serata.ts`.

/** Un PR può usare questa serata: è attivo e la serata è aperta a tutti i PR oppure proprio a lui. */
export const abilitatoPerSerata = (pr: Pick<Pr, 'id' | 'stato'>, evento: Pick<Evento, 'prAbilitati'>) =>
  pr.stato === 'attivo' && (!evento.prAbilitati || evento.prAbilitati.includes(pr.id));

/** Perché l'invio non è possibile (testo per l'admin), o null se si può mandare. Solo serate pubblicate e non passate. */
export function motivoNoInvioLink(evento: Pick<Evento, 'pubblicato' | 'data' | 'dataFine'>, adesso = new Date()): string | null {
  if (!evento.pubblicato) return 'La serata è ancora in bozza: i link dei PR non funzionano finché non la pubblichi.';
  if (eventoPassato(evento, adesso)) return 'La serata è già passata: non ha senso mandare il link.';
  return null;
}

export interface DestinatarioLink { pr: Pr; email: string | null }

/** Tutti i PR attivi e abilitati per la serata, con l'email con cui entrano (null se non ce l'hanno). I sospesi e i non abilitati non ci sono. */
export function destinatariLinkSerata(d: Readonly<Archivio>, evento: Pick<Evento, 'prAbilitati'>): DestinatarioLink[] {
  return d.pr
    .filter((p) => abilitatoPerSerata(p, evento))
    .sort((a, b) => a.nomeDisplay.localeCompare(b.nomeDisplay))
    .map((pr) => ({ pr, email: d.utenti.find((u) => u.prId === pr.id)?.email ?? null }));
}

/** Il link che il PR dà ai clienti per questa serata (lo stesso che l'admin copia nell'elenco). */
export const linkSerataPr = (origine: string, evento: Pick<Evento, 'slug'>, handle: string) =>
  `${origine.replace(/\/+$/, '')}/e/${evento.slug}/${handle}`;

/** "Venerdì 13.11 alle 22:00" */
export const quandoSerata = (evento: Pick<Evento, 'data'>) => `${giornoSettLungo(evento.data)} ${dataPunti(evento.data)} alle ${ora(evento.data)}`;

/** Testo breve che il PR può girare ai suoi clienti. */
export const testoPerClienti = (evento: Pick<Evento, 'nome' | 'data'>, link: string) =>
  `${evento.nome}, ${quandoSerata(evento)}: mettiti nella mia lista da qui ${link}`;

/** Messaggio per il PR (WhatsApp): il suo link e il testo da girare ai clienti. */
export const testoLinkPerPr = (nomePr: string, evento: Pick<Evento, 'nome' | 'data'>, link: string) =>
  `Ciao ${nomePr.trim().split(/\s+/)[0] ?? ''}! Ecco il tuo link per ${evento.nome} (${quandoSerata(evento)}): ${link}\n\n`
  + `Se vuoi, manda ai tuoi clienti: «${testoPerClienti(evento, link)}»`;

/** "Inviato il 2.11 alle 18:04 a 8 PR" (con quante email non sono partite, se ce ne sono). */
export function testoUltimoInvio(i: { at: string; inviate: number; nonPartite: number }) {
  const p = parti(i.at);
  return `Inviato il ${p.giorno}.${p.mese} alle ${ora(i.at)} a ${i.inviate} PR${i.nonPartite ? ` (${i.nonPartite} non partite)` : ''}`;
}
