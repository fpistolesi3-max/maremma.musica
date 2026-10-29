/** Logica della mappa "Come arrivare": cosa mostrare, link alle indicazioni, colori dello stile notte (senza dipendenze, per i test). */

export const STILE_OPENFREEMAP = 'https://tiles.openfreemap.org/styles/dark';
export const ZOOM_MAPPA = 14.5;

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

/** Etichetta per gli screen reader: "Mappa: Campo G. Scirea, Monteverdi M.mo". */
export function etichettaMappa(e: Pick<Luogo, 'location' | 'comune'>): string {
  const dove = [e.location, e.comune].filter(Boolean).join(', ');
  return dove ? `Mappa: ${dove}` : 'Mappa del luogo della serata';
}

// Colori dello stile notte (i token del sito: notte #0c0f14, osso #e1d7c9, arancio #d55b23).
const FONDO = '#0a0d11';
const ACQUA = '#0e1b27';
const VERDE = '#0f1b14';
const EDIFICI = '#161b22';
const OSSO = (alfa: number) => `rgba(225,215,201,${alfa})`;

type Livello = { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
type Stile = { layers: Livello[]; [k: string]: unknown };

/** Ricolora lo stile scuro di OpenFreeMap con la palette del sito: fondo quasi nero, acqua e verde appena visibili, strade in osso tenue. */
export function stileNotte<T extends Stile>(stile: T): T {
  const colori: Record<string, Record<string, unknown>> = {
    background: { 'background-color': FONDO },
    water: { 'fill-color': ACQUA },
    waterway: { 'line-color': ACQUA },
    landcover_wood: { 'fill-color': VERDE },
    landuse_park: { 'fill-color': VERDE },
    landuse_residential: { 'fill-color': '#0b0f14' },
    building: { 'fill-color': EDIFICI, 'fill-outline-color': '#151a21' },
    highway_path: { 'line-color': OSSO(0.22) },
    highway_minor: { 'line-color': OSSO(0.34), 'line-opacity': 1 },
    highway_major_casing: { 'line-color': '#0a0d11' },
    highway_major_inner: { 'line-color': OSSO(0.5) },
    highway_major_subtle: { 'line-color': OSSO(0.24) },
    highway_motorway_casing: { 'line-color': '#0a0d11' },
    highway_motorway_inner: { 'line-color': OSSO(0.5) },
    highway_motorway_subtle: { 'line-color': OSSO(0.24) },
    railway: { 'line-color': OSSO(0.1) },
    railway_minor: { 'line-color': OSSO(0.1) },
    railway_transit: { 'line-color': OSSO(0.1) },
    highway_name_other: { 'text-color': OSSO(0.7), 'text-halo-color': FONDO },
    highway_name_motorway: { 'text-color': OSSO(0.75), 'text-halo-color': FONDO },
    water_name: { 'text-color': 'rgba(120,150,175,.55)', 'text-halo-color': FONDO },
  };
  const layers = stile.layers.map((l) => {
    if (l.type === 'symbol' && l.id.startsWith('place_')) return { ...l, paint: { ...l.paint, 'text-color': OSSO(0.85), 'text-halo-color': FONDO, 'text-halo-width': 1.4 } };
    const c = colori[l.id];
    return c ? { ...l, paint: { ...l.paint, ...c } } : l;
  });
  return { ...stile, layers };
}
