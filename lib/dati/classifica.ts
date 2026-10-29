import type { Archivio } from './tipi';
import { isAttiva } from '../regole';

export interface RigaClassifica {
  prId: string | null;
  nome: string;
  inLista: number;
  entrati: number;
  incassato: number | null;   // solo per l'admin
  sonoIo: boolean;
}

/**
 * Classifica della serata: solo totali, contano le prevendite pagate (o gratis) e gli entrati. Ai PR arriva senza incassi e senza nessun nome di cliente
 * (equivalente della funzione classifica_pr() nello schema Supabase).
 */
export function calcolaClassifica(d: Readonly<Archivio>, eventoId: string, vista: { admin: boolean; prId?: string | null }): RigaClassifica[] {
  const righe = new Map<string, RigaClassifica>();
  for (const i of d.iscrizioni) {
    if (i.eventoId !== eventoId || i.origine === 'cassa') continue; // gli ingressi in cassa storici non sono la lista di nessuno
    if (i.stato === 'in_attesa' || i.stato === 'scaduta') continue; // conta solo la prevendita pagata
    const k = i.prId ?? '_mm';
    let r = righe.get(k);
    if (!r) {
      const pr = i.prId ? d.pr.find((p) => p.id === i.prId) : null;
      r = { prId: i.prId, nome: pr?.nomeDisplay ?? 'Maremma Musica', inLista: 0, entrati: 0, incassato: vista.admin ? 0 : null, sonoIo: Boolean(i.prId && i.prId === vista.prId) };
      righe.set(k, r);
    }
    if (isAttiva(i)) r.inLista += 1;
    if (i.stato === 'entrato') r.entrati += 1;
    if (vista.admin && isAttiva(i) && i.metodoPagamento === 'online') r.incassato! += i.importo; // incassato online
  }
  // Un PR senza iscritti compare comunque nella propria classifica.
  if (vista.prId && !righe.has(vista.prId)) {
    const pr = d.pr.find((p) => p.id === vista.prId);
    if (pr) righe.set(pr.id, { prId: pr.id, nome: pr.nomeDisplay, inLista: 0, entrati: 0, incassato: null, sonoIo: true });
  }
  return [...righe.values()].sort((a, b) => b.inLista - a.inLista || b.entrati - a.entrati || a.nome.localeCompare(b.nome));
}
