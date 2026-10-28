// Formattazione secondo la voce del Design System: "10 € alla porta", "22:00 → 03:00", "SAB 31.10".
const TZ = 'Europe/Rome';

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Sett', 'Ott', 'Nov', 'Dic'];
const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
const GIORNI_LUNGHI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

/** Parti della data nel fuso di Roma, indipendenti dal fuso del server. */
export function parti(iso: string) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  const giornoSettimana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    anno: Number(get('year')), mese: Number(get('month')), giorno: Number(get('day')),
    ore: get('hour'), minuti: get('minute'), giornoSettimana,
  };
}

const due = (n: number) => String(n).padStart(2, '0');

export const giorno2 = (iso: string) => due(parti(iso).giorno);                     // "31"
export const meseCorto = (iso: string) => MESI[parti(iso).mese - 1];                 // "Ott"
export const meseLungo = (iso: string) => MESI_LUNGHI[parti(iso).mese - 1];
export const giornoSett = (iso: string) => GIORNI[parti(iso).giornoSettimana];       // "SAB"
export const giornoSettLungo = (iso: string) => GIORNI_LUNGHI[parti(iso).giornoSettimana];
export const ora = (iso: string) => { const p = parti(iso); return `${p.ore}:${p.minuti}`; };
export const dataPunti = (iso: string) => { const p = parti(iso); return `${due(p.giorno)}.${due(p.mese)}`; }; // "31.10"
export const dataCompleta = (iso: string) => { const p = parti(iso); return `${due(p.giorno)}.${due(p.mese)}.${p.anno}`; };
export const dataIso = (iso: string) => { const p = parti(iso); return `${p.anno}-${due(p.mese)}-${due(p.giorno)}`; };

export function orari(inizio: string, fine: string | null) {
  return fine ? `${ora(inizio)} → ${ora(fine)}` : ora(inizio);
}

export function euro(n: number) {
  // Punto delle migliaia anche a 4 cifre ("2.130 €"): l'italiano di Intl di default non lo mette.
  const s = n.toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);
  return `${s} €`;
}

/** "2026-10-31" + "22:00" nel fuso di Roma → ISO. */
export function isoRoma(giorno: string, orario: string) {
  const prova = new Date(`${giorno}T${orario}:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(prova).find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+1';
  const [h, m = '0'] = offset.split(':');
  const segno = h.startsWith('-') ? '-' : '+';
  return new Date(`${giorno}T${orario}:00${segno}${String(Math.abs(Number(h))).padStart(2, '0')}:${m.padStart(2, '0')}`).toISOString();
}

/** Giorni di calendario (a Roma) da una data all'altra: negativo se la seconda è prima. */
export function giorniTra(daIso: string, aIso: string) {
  return Math.round((Date.parse(`${dataIso(aIso)}T00:00:00Z`) - Date.parse(`${dataIso(daIso)}T00:00:00Z`)) / 86_400_000);
}

/** Sposta una data di N giorni di calendario tenendo la stessa ora a Roma (anche a cavallo dell'ora legale). */
export function spostaGiorni(iso: string, giorni: number) {
  const nuovo = new Date(Date.parse(`${dataIso(iso)}T00:00:00Z`) + giorni * 86_400_000).toISOString().slice(0, 10);
  return isoRoma(nuovo, ora(iso));
}

export const numeroEvento = (n: number | null) => (n == null ? 'MM/—' : `MM/${String(n).padStart(3, '0')}`);

/** "14.05.2001" da "2001-05-14" */
export function nascita(ymd: string) {
  if (!ymd) return '';   // iscrizione anonimizzata
  const [a, m, g] = ymd.split('-');
  return `${g}.${m}.${a}`;
}

export function anniCompiuti(ymd: string, riferimento: string) {
  const [a, m, g] = ymd.split('-').map(Number);
  const [ra, rm, rg] = riferimento.split('-').map(Number);
  return ra - a - (rm < m || (rm === m && rg < g) ? 1 : 0);
}

/** "OGGI 16:42", "IERI 23:05", "12.10 18:00" */
export function quandoRelativo(iso: string, adesso = new Date()) {
  const oggi = dataIso(adesso.toISOString());
  const ieri = dataIso(new Date(adesso.getTime() - 86_400_000).toISOString());
  const g = dataIso(iso);
  if (g === oggi) return `OGGI ${ora(iso)}`;
  if (g === ieri) return `IERI ${ora(iso)}`;
  return `${dataPunti(iso)} ${ora(iso)}`;
}

/** "Esce tra 3 giorni" / "Esce tra 5 ore" / "Esce tra poco": per i tipi di prevendita non ancora usciti. */
export function esceTra(dal: Date, adesso = new Date()) {
  const ore = Math.ceil((dal.getTime() - adesso.getTime()) / 3_600_000);
  if (ore <= 1) return 'Esce tra poco';
  if (ore < 48) return `Esce tra ${ore} ore`;
  return `Esce tra ${Math.ceil(ore / 24)} giorni`;
}

export function slugDa(testo: string) {
  return testo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
