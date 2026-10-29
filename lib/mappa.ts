/** Logica della mappa "Come arrivare": cosa mostrare, link alle indicazioni, stile "locandina" della mappa vera (senza dipendenze, per i test). */

export const STILE_OPENFREEMAP = 'https://tiles.openfreemap.org/styles/dark';

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

// Colori della mappa (i token del sito: notte #0c0f14, osso #e1d7c9, arancio #d55b23).
const OSSO = (alfa: number) => `rgba(225,215,201,${alfa})`;

type Livello = { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
type Stile = { layers: Livello[]; [k: string]: unknown };

// ——— Stile "locandina": zoom largo, mare ben distinto, strade con una gerarchia, nomi dei paesi scritti dal sito (non dalla mappa) ———
const TERRA = '#151a21';
const MARE = '#0e2b46';
const BOSCO = '#18261e';
const larghezza = (z1: number, w1: number, z2: number, w2: number, z3 = z2 + 3, w3 = w2 * 3) => ['interpolate', ['exponential', 1.4], ['zoom'], z1, w1, z2, w2, z3, w3];

/** Zoom per la larghezza del riquadro: su telefono serve più campo per vedere la costa e i paesi vicini. */
export function zoomLocandina(larghezzaPx: number): number {
  return larghezzaPx < 460 ? 8.9 : larghezzaPx < 760 ? 9.2 : 9.5;
}

/** Ristilizza lo stile scuro di OpenFreeMap come una locandina: mare blu notte, terra quasi nera, verde appena accennato, strade in osso (autostrade e statali più forti), niente edifici né scritte (i paesi li scrive il sito). */
export function stileLocandina<T extends Stile>(stile: T): T {
  const nascosti = /^(building|aeroway|road_|highway_path|highway_name|place_|water_name|boundary_|railway|landcover_ice|landcover_glacier|waterway)/;
  const colori: Record<string, Record<string, unknown>> = {
    background: { 'background-color': TERRA },
    water: { 'fill-color': MARE },
    landcover_wood: { 'fill-color': BOSCO },
    landuse_park: { 'fill-color': BOSCO },
    landuse_residential: { 'fill-color': '#1c232b' },
    highway_minor: { 'line-color': OSSO(0.2), 'line-opacity': 1, 'line-width': larghezza(8, 0.3, 12, 0.9) },
    highway_major_casing: { 'line-color': TERRA, 'line-width': larghezza(11, 2, 13, 4.5) },
    highway_major_inner: { 'line-color': OSSO(0.72), 'line-width': larghezza(11, 1.1, 13, 2.8) },
    highway_major_subtle: { 'line-color': OSSO(0.5), 'line-width': larghezza(6, 0.7, 10, 1.4, 11, 1.8) },
    highway_motorway_casing: { 'line-color': TERRA, 'line-width': larghezza(6, 2, 12, 6.5) },
    highway_motorway_inner: { 'line-color': OSSO(0.95), 'line-width': larghezza(6, 1, 12, 3.8) },
    highway_motorway_subtle: { 'line-color': OSSO(0.8), 'line-width': 1 },
  };
  const layers = stile.layers.map((l) => {
    if (nascosti.test(l.id) && !colori[l.id]) return { ...l, layout: { ...l.layout, visibility: 'none' } };
    const c = colori[l.id];
    return c ? { ...l, paint: { ...l.paint, ...c } } : l;
  });
  return { ...stile, layers };
}
