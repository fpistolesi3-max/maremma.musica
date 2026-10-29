/** Logica della mappa "Come arrivare": cosa mostrare, link ai navigatori, zoom iniziale (senza dipendenze, per i test). Lo stile è in `stile-mappa.ts`. */

type Luogo = { lat: number | null; lng: number | null; location: string | null; comune: string | null };

/** Mappa vera solo con le coordinate e il luogo visibile (la location segreta resta segreta anche nei tasselli della mappa). */
export function sceltaMappa(e: Pick<Luogo, 'lat' | 'lng'>, visibile: boolean): 'mappa' | 'segnaposto' {
  return visibile && Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.lat != null && e.lng != null ? 'mappa' : 'segnaposto';
}

/** iPhone, iPad (anche quello che si presenta come Mac) e iPod usano Apple Maps; il resto Google Maps. */
export function usaAppleMaps(userAgent: string, touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);
}

/** Link che apre la navigazione verso il posto: per coordinate se ci sono, altrimenti per nome. Null se non c'è niente da cercare. */
export function linkIndicazioni(e: Luogo, apple = false): string | null {
  const nome = [e.location, e.comune].filter(Boolean).join(', ');
  const ha = e.lat != null && e.lng != null && Number.isFinite(e.lat) && Number.isFinite(e.lng);
  if (!ha && !nome) return null;
  const dove = ha ? `${e.lat},${e.lng}` : encodeURIComponent(nome);
  return apple
    ? ha ? `https://maps.apple.com/?daddr=${dove}&dirflg=d` : `https://maps.apple.com/?daddr=${dove}`
    : `https://www.google.com/maps/dir/?api=1&destination=${dove}`;
}

export type Navigatore = { app: 'google' | 'apple' | 'waze'; nome: string; href: string };

/**
 * I tre navigatori per le indicazioni (sotto la mappa): su iPhone e iPad prima Apple Maps.
 * Vuoto con la location segreta (`visibile` falso) o se non c'è niente da cercare.
 */
export function linkNavigatori(e: Luogo, apple = false, visibile = true): Navigatore[] {
  const google = visibile ? linkIndicazioni(e) : null;
  if (!google) return [];
  const ha = e.lat != null && e.lng != null && Number.isFinite(e.lat) && Number.isFinite(e.lng);
  const waze = ha
    ? `https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent([e.location, e.comune].filter(Boolean).join(', '))}&navigate=yes`;
  const lista: Navigatore[] = [
    { app: 'google', nome: 'Google Maps', href: google },
    { app: 'apple', nome: 'Apple Maps', href: linkIndicazioni(e, true)! },
    { app: 'waze', nome: 'Waze', href: waze },
  ];
  return apple ? [lista[1], lista[0], lista[2]] : lista;
}

/** Zoom iniziale perché il riquadro largo `larghezzaPx` mostri circa `km` chilometri attorno al posto (la zona: costa, mare e paesi). */
export function zoomZona(larghezzaPx: number, lat: number, km = 34): number {
  const metriPerPx = (km * 1000) / Math.max(larghezzaPx, 1);
  return Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180)) / metriPerPx) - 1; // tasselli da 512 px
}

/** Etichetta per gli screen reader: "Mappa: Campo G. Scirea, Monteverdi M.mo". */
export function etichettaMappa(e: Pick<Luogo, 'location' | 'comune'>): string {
  const dove = [e.location, e.comune].filter(Boolean).join(', ');
  return dove ? `Mappa: ${dove}` : 'Mappa del luogo della serata';
}
