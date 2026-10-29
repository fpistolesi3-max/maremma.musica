/** Cartina illustrata della Maremma: proiezione, paesi, distanze stimate (senza dipendenze, per i test e per lo script che disegna la costa). */

// Riquadro coperto dalla cartina (gradi). Fuori da qui la serata torna al segnaposto.
export const LON_O = 10.15;
export const LON_E = 11.8;
export const LAT_N = 43.45; // arriva a Cecina: la Val di Cornia sta nel mezzo e il punto non finisce sul bordo
export const LAT_S = 42.28;
const COS = Math.cos((((LAT_N + LAT_S) / 2) * Math.PI) / 180);

/** Dimensioni del disegno in unità SVG (la proporzione segue il riquadro reale, quindi niente deformazioni). */
export const LARGHEZZA = 1200;
export const ALTEZZA = Math.round((LARGHEZZA * (LAT_N - LAT_S)) / ((LON_E - LON_O) * COS));

/** Coordinate → punto del disegno. Proiezione piatta con la longitudine accorciata: a questa scala l'errore è sotto il pixel. */
export function proietta(lat: number, lng: number): { x: number; y: number } {
  return { x: ((lng - LON_O) / (LON_E - LON_O)) * LARGHEZZA, y: ((LAT_N - lat) / (LAT_N - LAT_S)) * ALTEZZA };
}

/** Il punto sta dentro la cartina, con un po' di margine dal bordo (così l'etichetta non esce). */
export function inMaremma(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const m = 0.06;
  return lat < LAT_N - m && lat > LAT_S + m && lng > LON_O + m && lng < LON_E - m;
}

export type Paese = { nome: string; lat: number; lng: number; /** 1 = sempre in vista, 2 = solo se il riquadro è largo, 3 = paesini che si scrivono solo sulla mappa vera (la cartina è troppo piccola) */ peso: 1 | 2 | 3; /** per i tempi in auto */ tempi?: boolean; /** nome a sinistra del punto (di default a destra) */ lato?: 'l'; /** nome corto per la riga dei tempi */ corto?: string };

export const PAESI: Paese[] = [
  { nome: 'Grosseto', lat: 42.7604, lng: 11.1137, peso: 1, tempi: true },
  { nome: 'Follonica', lat: 42.9220, lng: 10.7600, peso: 1, tempi: true },
  { nome: 'Castiglione della Pescaia', corto: 'Castiglione', lat: 42.7647, lng: 10.8847, peso: 1, tempi: true, lato: 'l' },
  { nome: 'Orbetello', lat: 42.4400, lng: 11.2167, peso: 1, tempi: true },
  { nome: 'Marina di Grosseto', corto: 'Marina', lat: 42.7000, lng: 10.9833, peso: 2, tempi: true, lato: 'l' },
  { nome: 'Massa Marittima', lat: 43.0500, lng: 10.8900, peso: 1, tempi: true },
  { nome: 'Piombino', lat: 42.9240, lng: 10.5260, peso: 1, tempi: true, lato: 'l' },
  { nome: 'San Vincenzo', lat: 43.1000, lng: 10.5400, peso: 2, tempi: true, lato: 'l' },
  { nome: 'Campiglia Marittima', corto: 'Campiglia', lat: 43.0640, lng: 10.5880, peso: 2, tempi: true },
  { nome: 'Roccastrada', lat: 42.9833, lng: 11.1667, peso: 2, tempi: true },
  { nome: 'Porto Santo Stefano', corto: 'Santo Stefano', lat: 42.4390, lng: 11.1180, peso: 3, tempi: true, lato: 'l' },
  { nome: 'Talamone', lat: 42.5500, lng: 11.1333, peso: 2, tempi: true, lato: 'l' },
  { nome: 'Capalbio', lat: 42.4167, lng: 11.4000, peso: 2, tempi: true },
  { nome: 'Magliano in Toscana', corto: 'Magliano', lat: 42.5961, lng: 11.2961, peso: 2, tempi: true },
  { nome: 'Suvereto', lat: 43.0749, lng: 10.6836, peso: 2 },
  { nome: 'Castagneto Carducci', corto: 'Castagneto', lat: 43.1627, lng: 10.5970, peso: 3 },
  { nome: 'Gavorrano', lat: 42.9284, lng: 10.8148, peso: 3 },
  { nome: 'Montieri', lat: 43.1317, lng: 10.8886, peso: 3 },
  { nome: 'Monterotondo Marittimo', corto: 'Monterotondo', lat: 43.0958, lng: 10.7425, peso: 3 },
  { nome: 'Monteverdi Marittimo', corto: 'Monteverdi', lat: 43.1560, lng: 10.7100, peso: 3 },
  { nome: 'Pitigliano', lat: 42.6333, lng: 11.6700, peso: 2, lato: 'l' },
  { nome: 'Arcidosso', lat: 42.8700, lng: 11.5300, peso: 2 },
  { nome: 'Abbadia San Salvatore', corto: 'Abbadia', lat: 42.8808, lng: 11.6733, peso: 3, lato: 'l' },
  { nome: 'Castel del Piano', lat: 42.8944, lng: 11.5453, peso: 3 },
  { nome: 'Santa Fiora', lat: 42.8319, lng: 11.5864, peso: 3 },
  { nome: 'Cecina', lat: 43.3115, lng: 10.5184, peso: 3 },
];

/** Rilievi e isole da scrivere sulla cartina (il disegno li ricava dai dati). */
export const LUOGHI: { nome: string; lat: number; lng: number; tipo: 'monte' | 'isola' | 'mare'; peso: 1 | 2 }[] = [
  { nome: 'Amiata', lat: 42.8903, lng: 11.6275, tipo: 'monte', peso: 1 },
  { nome: 'Argentario', lat: 42.3300, lng: 11.0800, tipo: 'monte', peso: 2 },
  { nome: 'Giglio', lat: 42.3600, lng: 10.9000, tipo: 'isola', peso: 1 },
  { nome: 'Elba', lat: 42.7800, lng: 10.2700, tipo: 'isola', peso: 1 },
  { nome: 'Mar Tirreno', lat: 42.58, lng: 10.62, tipo: 'mare', peso: 1 },
];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Stima grossolana: la strada è più lunga della linea d'aria (qui ×1,35, tra costa e colline) e si va a ~55 km/h di media.
const FATTORE_STRADA = 1.35;
const KMH = 55;

/** Minuti in auto stimati dalla distanza in linea d'aria, arrotondati a 5 (minimo 5). Non è un percorso vero. */
export function minutiStimati(kmLineaAria: number): number {
  return Math.max(5, Math.round(((kmLineaAria * FATTORE_STRADA) / KMH) * 12) * 5);
}

/** I paesi più vicini con i tempi stimati, es. [{ nome: 'Grosseto', min: 15 }, ...]. Ordinati dal più vicino. */
export function distanzeStimate(lat: number, lng: number, quanti = 3): { nome: string; min: number }[] {
  return PAESI.filter((p) => p.tempi)
    .map((p) => ({ nome: p.corto ?? p.nome, km: haversineKm({ lat, lng }, p) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, quanti)
    .map((p) => ({ nome: p.nome, min: minutiStimati(p.km) }));
}

/** "15 min da Grosseto · 10 da Marina · 25 da Orbetello" (il primo con "min", gli altri solo col numero). */
export function rigaDistanze(lat: number, lng: number): string {
  return distanzeStimate(lat, lng)
    .sort((a, b) => a.min - b.min)
    .map((d, i) => (i === 0 ? `${d.min} min da ${d.nome}` : `${d.min} da ${d.nome}`))
    .join(' · ');
}
