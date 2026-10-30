// Intro "Mai Mollare" disegnata con p5.js (instance mode).
// Tutto dipende dal tempo t in secondi: ogni fotogramma si ridisegna identico (export video, screenshot).
// Palette dell'intro: solo 4 colori, niente gradienti, niente trasparenze.
import type P5 from 'p5';
import type { StileIntro, UscitaIntro } from './regole';

const NOTTE = '#111111';
const OSSO = '#EFEBE3';
const PETROLIO = '#12555A';
const ARANCIO = '#F05A28';

export const DURATA = 2.8; // secondi, uscita compresa

type Punto = [number, number];
// monogramma MM dall'SVG del sito (public/img/monogramma.svg), centro = foro del disco
const MM_SX: Punto[] = [[383.3, 476.11], [383.3, 353.3], [360.0, 373.3], [317.5, 448.3], [285.0, 403.3], [259.5, 419.3], [259.5, 588.3], [296.3, 608.3], [296.3, 491.7], [319.5, 530], [343.8, 491.7], [343.8, 626.7], [383.3, 650], [383.3, 525.89]];
const MM_DX: Punto[] = MM_SX.map(([x, y]) => [791.4 - x, y]);
const MM_CX = 395.7, MM_CY = 501, MM_ALTO = 297, MM_FORO = 27.5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const eOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
const eInCubic = (k: number) => k * k * k;
const eInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const eOutBack = (k: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const eOutExpo = (k: number) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));

function lunghezze(punti: Punto[]) {
  const acc = [0];
  for (let i = 1; i < punti.length; i++) acc.push(acc[i - 1] + Math.hypot(punti[i][0] - punti[i - 1][0], punti[i][1] - punti[i - 1][1]));
  return acc;
}
const MM_LUN = lunghezze(MM_SX);

// misure con il canvas nativo: textWidth di p5 non dà l'avanzamento vero (spazi sbagliati tra le lettere)
let misuratore: CanvasRenderingContext2D | null = null;
function larghezza(testo: string, famiglia: string, sz: number) {
  misuratore ??= document.createElement('canvas').getContext('2d')!;
  misuratore.font = `${sz}px "${famiglia}"`;
  return misuratore.measureText(testo).width;
}

export type OpzioniIntro = {
  stile: StileIntro;
  uscita: UscitaIntro;
  logo: 'png' | 'vettoriale';
  immagineLogo?: P5.Image;
  colore?: string;
};

type Misure = ReturnType<typeof misure>;
function misure(w: number, h: number) {
  const verticale = h > w;
  const m = Math.min(w, h);
  const adatta = (parola: string, largo: number, tetto: number) => Math.min(100 * largo / larghezza(parola, 'Archivo Black', 100), tetto);
  const szMai = verticale ? adatta('MAI', w * 0.9, h * 0.22) : adatta('MAI', w * 0.86, h * 0.4);
  const szMol = verticale ? adatta('MOLLARE', w * 0.9, h * 0.22) : adatta('MOLLARE', w * 0.86, h * 0.4);
  const capMai = szMai * 0.72, capMol = szMol * 0.72;
  const gap = Math.max(szMai, szMol) * 0.1;
  const blocco = capMai + gap + capMol;
  const baseMai = h / 2 - blocco / 2 + capMai;
  const baseMol = baseMai + gap + capMol;
  const R = verticale ? Math.min(w * 0.44, h * 0.3) : h * 0.36;
  return { w, h, verticale, m, szMai, szMol, capMai, capMol, baseMai, baseMol, R, cx: w / 2, cy: h / 2, diag: Math.hypot(w, h) };
}

/** Restituisce disegna(t), da chiamare con il tempo in secondi; da DURATA in poi il canvas è vuoto. */
export function creaIntro(p: P5, opzioni: OpzioniIntro) {
  const COLORE = opzioni.colore ?? PETROLIO;
  const ctx = () => p.drawingContext as CanvasRenderingContext2D;

  // blob: cerchio deformato dal rumore di Perlin; amp 0 = cerchio perfetto
  function blob(x: number, y: number, r: number, amp: number, seme: number, t: number, punti = 96) {
    if (r <= 0) return;
    p.beginShape();
    for (let i = 0; i < punti; i++) {
      const a = (i / punti) * Math.PI * 2;
      const n = p.noise(seme + Math.cos(a) * 0.9 + 1, seme + Math.sin(a) * 0.9 + 1, t * 0.8);
      const rr = r * (1 + amp * (n * 2 - 1));
      p.vertex(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    p.endShape(p.CLOSE);
  }

  function percorsoBlob(c2d: CanvasRenderingContext2D, x: number, y: number, r: number, amp: number, seme: number, t: number, punti = 96) {
    for (let i = 0; i <= punti; i++) {
      const a = (i / punti) * Math.PI * 2;
      const n = p.noise(seme + Math.cos(a) * 0.9 + 1, seme + Math.sin(a) * 0.9 + 1, t * 0.8);
      const rr = r * (1 + amp * (n * 2 - 1));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) c2d.moveTo(px, py); else c2d.lineTo(px, py);
    }
  }

  // ───────────── stile classico: tipografia cinetica e blob morbidi ─────────────

  // parola cinetica: lettere che salgono/scendono da una maschera sulla riga
  function parola(L: Misure, testo: string, sz: number, base: number, colore: string, t: number, entra: number, esce: number, alterna: boolean) {
    p.textFont('Archivo Black');
    p.textSize(sz);
    p.textAlign(p.LEFT, p.BASELINE);
    const x0 = L.cx - larghezza(testo, 'Archivo Black', sz) / 2;
    const cap = sz * 0.72;
    const c = ctx();
    // push/pop di p5 (non save/restore nativi): così lo stato dei colori di p5 resta allineato al canvas
    p.push();
    c.beginPath();
    c.rect(0, base - cap - sz * 0.06, L.w, cap + sz * 0.12);
    c.clip();
    p.noStroke();
    p.fill(colore);
    for (let i = 0; i < testo.length; i++) {
      const x = x0 + larghezza(testo.slice(0, i), 'Archivo Black', sz);
      const dir = alterna && i % 2 ? -1 : 1;
      const kIn = eOutBack(seg(t, entra + i * 0.045, entra + i * 0.045 + 0.34));
      const kOut = eInCubic(seg(t, esce + i * 0.03, esce + i * 0.03 + 0.24));
      const dy = (1 - kIn) * (cap + sz * 0.2) * dir - kOut * (cap + sz * 0.2) * dir;
      p.push();
      p.translate(x, base + dy);
      p.text(testo[i], 0, 0);
      p.pop();
    }
    p.pop();
  }

  function stella(x: number, y: number, r: number) {
    p.beginShape();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.28 : r;
      p.vertex(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    p.endShape(p.CLOSE);
  }

  function tratto(punti: Punto[], k: number, frazione: number) {
    const tot = MM_LUN[MM_LUN.length - 1] * frazione;
    p.beginShape();
    for (let i = 0; i < punti.length; i++) {
      if (MM_LUN[i] <= tot) { p.vertex((punti[i][0] - MM_CX) * k, (punti[i][1] - MM_CY) * k); continue; }
      const prima = punti[i - 1];
      const f = (tot - MM_LUN[i - 1]) / (MM_LUN[i] - MM_LUN[i - 1]);
      p.vertex((lerp(prima[0], punti[i][0], f) - MM_CX) * k, (lerp(prima[1], punti[i][1], f) - MM_CY) * k);
      break;
    }
    p.endShape();
  }

  function testoCurvo(testo: string, r: number, sz: number, sopra: boolean, t: number, inizio: number) {
    p.textFont('DM Serif Display');
    p.textSize(sz);
    p.textAlign(p.CENTER, p.CENTER);
    const passo = sz / r;
    const n = testo.length;
    for (let i = 0; i < n; i++) {
      const k = eOutBack(seg(t, inizio + i * 0.03, inizio + i * 0.03 + 0.22));
      if (k <= 0) continue;
      const a = sopra ? -Math.PI / 2 + (i - (n - 1) / 2) * passo : Math.PI / 2 - (i - (n - 1) / 2) * passo;
      p.push();
      p.translate(Math.cos(a) * r, Math.sin(a) * r);
      p.rotate(sopra ? a + Math.PI / 2 : a - Math.PI / 2);
      p.scale(k);
      p.text(testo[i], 0, 0);
      p.pop();
    }
  }

  function disco(L: Misure, t: number) {
    const kNasce = eOutExpo(seg(t, 1.28, 1.7));
    if (kNasce <= 0) return;
    const R = L.R * kNasce;
    const amp = 0.22 * (1 - seg(t, 1.3, 1.75));
    p.push();
    p.translate(L.cx, L.cy);
    p.rotate(-0.7 * (1 - eOutCubic(seg(t, 1.3, 2.1))));
    p.noStroke();
    const png = opzioni.logo === 'png' ? opzioni.immagineLogo : undefined;
    const kPng = png ? eOutBack(seg(t, 1.38, 1.76)) : 0;
    // con il PNG il blob nero fa solo da "seme": sparisce quando il disco vero lo copre
    p.fill(NOTTE);
    if (kPng < 0.85) blob(0, 0, R, amp, 11, t);

    if (png) {
      // logo originale: entra ingrandendosi e girando come un vinile che si ferma sul piatto
      if (kPng > 0) {
        p.rotate(-1.6 * (1 - eOutCubic(seg(t, 1.38, 2.1))));
        p.imageMode(p.CENTER);
        p.image(png, 0, 0, L.R * 2 * kPng, L.R * 2 * kPng);
      }
      p.pop();
      return;
    }

    // logo vettoriale a 4 colori: solchi e anello dell'etichetta
    p.noFill();
    p.stroke(OSSO);
    [0.93, 0.87, 0.81].forEach((f, i) => {
      const k = eOutCubic(seg(t, 1.45 + i * 0.05, 1.8 + i * 0.05));
      if (k <= 0) return;
      p.strokeWeight(Math.max(1, L.R * 0.0045));
      p.arc(0, 0, f * L.R * 2, f * L.R * 2, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
    });
    const kAnello = eOutCubic(seg(t, 1.5, 1.9));
    if (kAnello > 0) { p.strokeWeight(Math.max(1.2, L.R * 0.008)); p.arc(0, 0, 1.44 * L.R, 1.44 * L.R, Math.PI / 2, Math.PI / 2 + kAnello * Math.PI * 2); }

    // monogramma che si disegna
    const k = (L.R * 0.78) / MM_ALTO;
    const fr = eInOutCubic(seg(t, 1.42, 1.95));
    if (fr > 0) {
      p.strokeWeight(L.R * 0.02);
      p.strokeJoin(p.MITER);
      p.strokeCap(p.SQUARE);
      p.stroke(OSSO); tratto(MM_SX, k, fr);
      p.stroke(ARANCIO); tratto(MM_DX, k, fr);
    }
    const kForo = eOutBack(seg(t, 1.55, 1.8));
    if (kForo > 0) {
      p.fill(NOTTE); p.stroke(OSSO); p.strokeWeight(Math.max(1, L.R * 0.007));
      p.circle(0, 0, MM_FORO * k * 2 * kForo);
    }

    // nome del brand in DM Serif Display, sull'etichetta
    p.noStroke();
    p.fill(OSSO);
    testoCurvo('MAREMMA', L.R * 0.58, L.R * 0.13, true, t, 1.6);
    testoCurvo('MUSICA', L.R * 0.58, L.R * 0.13, false, t, 1.68);
    const kSt = eOutBack(seg(t, 1.8, 2.0));
    if (kSt > 0) { p.fill(ARANCIO); stella(-L.R * 0.6, 0, L.R * 0.06 * kSt); stella(L.R * 0.6, 0, L.R * 0.06 * kSt); }
    p.pop();
  }

  function scenaClassica(L: Misure, t: number) {
    p.background(NOTTE);
    p.noStroke();
    const v = L.verticale;
    // blob petrolio: nasce in basso a sinistra, poi si allarga fino a riempire lo schermo (cambio di "title card")
    const kNasce = eOutCubic(seg(t, 0.0, 0.5));
    const kGiro = eInOutCubic(seg(t, 0.92, 1.3));
    p.fill(COLORE);
    blob(lerp(L.w * (v ? 0.18 : 0.24), L.cx, kGiro), lerp(L.h * (v ? 0.76 : 0.7), L.cy, kGiro), lerp(L.m * 0.34 * kNasce, L.diag * 0.75, kGiro), 0.2 * (1 - kGiro * 0.6), 1, t);
    // blob arancio e osso: entrano, poi si ritirano verso il centro (diventano il disco)
    const kAr = eOutBack(seg(t, 0.1, 0.55)) * (1 - eInCubic(seg(t, 1.0, 1.3)));
    p.fill(ARANCIO);
    blob(lerp(L.w * (v ? 0.84 : 0.8), L.cx, seg(t, 1.0, 1.3)), lerp(L.h * (v ? 0.2 : 0.24), L.cy, seg(t, 1.0, 1.3)), L.m * 0.17 * kAr, 0.26, 4, t);
    const kOs = eOutBack(seg(t, 0.2, 0.6)) * (1 - eInCubic(seg(t, 0.95, 1.2)));
    p.fill(OSSO);
    blob(L.w * (v ? 0.8 : 0.86), L.h * (v ? 0.86 : 0.8), L.m * 0.06 * kOs, 0.3, 7, t);

    parola(L, 'MAI', L.szMai, L.baseMai, OSSO, t, 0.14, 1.06, false);
    parola(L, 'MOLLARE', L.szMol, L.baseMol, ARANCIO, t, 0.42, 1.12, true);

    disco(L, t);
  }

  // ───────────── stile techno: tutto a tempo su 128 BPM, tagli netti, movimenti a scatti ─────────────
  const BATTITO = 60 / 128; // 0,469 s: 6 battiti = 2,8 s
  const sedicesimo = BATTITO / 4;
  const scatto = (t: number, fps: number) => Math.floor(t * fps) / fps; // movimento "a scatti" (meno fotogrammi)
  const pompa = (t: number) => (t < 0 ? 0 : Math.exp(-((t % BATTITO) / BATTITO) * 7)); // 1 sulla cassa, poi cala

  function testoTeso(testo: string, famiglia: string, sz: number, x: number, y: number, sx: number, sy: number, colore: string) {
    p.push();
    p.translate(x, y);
    p.scale(sx, sy);
    p.textFont(famiglia);
    p.textSize(sz);
    p.textAlign(p.LEFT, p.BASELINE);
    p.noStroke();
    p.fill(colore);
    p.text(testo, 0, 0);
    p.pop();
  }

  // ritaglia lo schermo a fette orizzontali e sposta ognuna: il "glitch", piatto e senza colori nuovi
  function aFette(L: Misure, n: number, ampiezza: number, seme: number, t: number, disegna: () => void) {
    const c = ctx();
    const h = L.h / n;
    for (let i = 0; i < n; i++) {
      const dx = (p.noise(seme + i * 0.7, scatto(t, 16) * 3) - 0.5) * 2 * ampiezza;
      p.push();
      c.beginPath(); c.rect(0, i * h, L.w, h + 1); c.clip();
      p.translate(dx, 0);
      disegna();
      p.pop();
    }
  }

  function titoloTecno(L: Misure) {
    // le due righe hanno la stessa larghezza (blocco giustificato); in verticale le lettere si allungano in altezza
    const largo = L.w * (L.verticale ? 0.9 : 0.84);
    const sy = L.verticale ? 2.3 : 1;
    const sz = Math.min(100 * largo / larghezza('MOLLARE', 'Archivo Black', 100), L.h * 0.34 / sy);
    const cap = sz * 0.72 * sy, gap = sz * 0.12 * sy;
    const baseMai = L.cy - (cap * 2 + gap) / 2 + cap;
    return {
      sz, sy, cap, gap, baseMai, baseMol: baseMai + gap + cap, x: L.cx - largo / 2,
      sxMai: largo / larghezza('MAI', 'Archivo Black', sz), sxMol: largo / larghezza('MOLLARE', 'Archivo Black', sz),
    };
  }

  function hud(L: Misure, t: number) {
    const sz = Math.max(9, L.m * 0.017);
    const mg = L.m * 0.045;
    p.textFont('Martian Mono');
    p.textSize(sz);
    p.noStroke();
    p.fill(OSSO);
    const fot = String(Math.floor(t * 60) % 60).padStart(2, '0');
    p.textAlign(p.LEFT, p.TOP); p.text('MM/025', mg, mg);
    p.textAlign(p.RIGHT, p.TOP); p.text(`00:00:0${Math.floor(t)}:${fot}`, L.w - mg, mg);
    p.textAlign(p.LEFT, p.BOTTOM); p.text(`128 BPM  ${'■'.repeat(1 + (Math.floor(t / BATTITO) % 4))}`, mg, L.h - mg);
    p.textAlign(p.RIGHT, p.BOTTOM); p.text('MAREMMA MUSICA', L.w - mg, L.h - mg);
    // crocini di registro sui bordi
    p.stroke(OSSO); p.strokeWeight(Math.max(1, L.m * 0.0018)); p.noFill();
    const k = L.m * 0.018;
    for (const [x, y] of [[mg * 0.5, L.h * 0.5], [L.w - mg * 0.5, L.h * 0.5], [L.w * 0.5, mg * 0.5], [L.w * 0.5, L.h - mg * 0.5]]) {
      p.line(x - k, y, x + k, y); p.line(x, y - k, x, y + k);
    }
  }

  // righe di testo ripetuto che scorrono a scatti, in direzioni alterne (sfondo)
  function nastri(L: Misure, t: number, colore: string) {
    const righe = L.verticale ? 9 : 6;
    const h = L.h / righe;
    const sz = h * 0.9;
    const unita = 'MAI MOLLARE / ';
    const lu = larghezza(unita, 'Archivo Black', sz);
    for (let i = 0; i < righe; i++) {
      const dir = i % 2 ? 1 : -1;
      const off = ((scatto(t, 8) * L.m * 0.9 * dir) % lu + lu) % lu;
      testoTeso(unita.repeat(Math.ceil(L.w / lu) + 2), 'Archivo Black', sz, -lu + off, (i + 1) * h - h * 0.14, 1, 1, colore);
    }
  }

  function discoTecno(L: Misure, t: number) {
    const t0 = 3 * BATTITO + sedicesimo * 2; // 1,64 s
    // il blob-cassa: cresce a scatti sulle casse, poi diventa il disco
    const kSeme = seg(t, 3 * BATTITO, t0);
    if (kSeme > 0 && t < t0 + sedicesimo) {
      p.noStroke(); p.fill(NOTTE);
      blob(L.cx, L.cy, L.R * (0.35 + 0.65 * Math.ceil(kSeme * 4) / 4), 0.22, 11, scatto(t, 12));
    }
    if (t < t0) return;
    const R = L.R * (1 + 0.07 * pompa(t - 4 * BATTITO));
    p.push();
    p.translate(L.cx, L.cy);
    p.rotate(-scatto(t - t0, 12) * Math.PI * 2 * 0.55); // 33 giri: il piatto gira, a scatti
    if (opzioni.immagineLogo) { p.imageMode(p.CENTER); p.image(opzioni.immagineLogo, 0, 0, R * 2, R * 2); }
    else { p.noStroke(); p.fill(NOTTE); p.circle(0, 0, R * 2); }
    p.pop();
  }

  function scenaTecno(L: Misure, t: number) {
    const b = t / BATTITO;
    const invertito = b >= 2; // dal terzo battito lo sfondo diventa petrolio (un solo cambio: niente lampeggi)
    p.background(invertito ? COLORE : NOTTE);
    p.noStroke();

    if (b >= 1 && b < 3.5) nastri(L, t, invertito ? NOTTE : COLORE);

    // blob arancio che pompa sulla cassa (primi due battiti), si muove a scatti
    if (b < 2) {
      const r = L.m * 0.15 * (0.75 + 0.35 * pompa(t)) * eOutBack(seg(t, 0, 0.12));
      p.fill(ARANCIO);
      blob(L.w * (L.verticale ? 0.8 : 0.82), L.h * (L.verticale ? 0.2 : 0.26), r, 0.25, 4, scatto(t, 12));
    }

    const T = titoloTecno(L);
    const disegnaTitolo = (conMollare: boolean) => {
      testoTeso('MAI', 'Archivo Black', T.sz, T.x, T.baseMai, T.sxMai, T.sy, OSSO);
      if (conMollare) testoTeso('MOLLARE', 'Archivo Black', T.sz, T.x, T.baseMol, T.sxMol, T.sy, ARANCIO);
    };
    if (b < 3) {
      const conMollare = b >= 1;
      // glitch per un sedicesimo su ogni cassa
      const dopoCassa = t % BATTITO;
      if (t > 0.04 && dopoCassa < sedicesimo) aFette(L, L.verticale ? 14 : 9, L.m * 0.06 * (1 - dopoCassa / sedicesimo), Math.floor(b) * 5, t, () => disegnaTitolo(conMollare));
      else if (t > 0.04) disegnaTitolo(conMollare);
    } else if (b < 3.5) {
      // quarto battito: MOLLARE si ripete a scatti, come un delay
      const copie = Math.min(5, 1 + Math.floor((t - 3 * BATTITO) / (sedicesimo / 2)));
      for (let k = 0; k < copie; k++) {
        const y = L.cy + T.cap / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (T.cap + T.gap);
        testoTeso('MOLLARE', 'Archivo Black', T.sz, T.x, y, T.sxMol, T.sy, k === 0 ? ARANCIO : OSSO);
      }
    }

    discoTecno(L, t);
    hud(L, t);
  }

  // ───────────── stile giradischi: lo slogan scende dal piatto, fa lo scratch, poi sta accanto al disco ─────────────
  const SCRATCH = [0.95, 1.25] as const;
  const SPOSTA = [1.2, 1.62] as const;

  // R = solco più esterno; il disco vero occupa i 4/5 interni
  const misuraVinile = (L: Misure) => {
    const R = L.verticale ? Math.min(L.w * 0.56, L.h * 0.4) : L.h * 0.46;
    return { R, rDisco: R * 0.8 };
  };

  // angolo del piatto: parte da fermo, prende velocità, poi due colpi avanti-indietro (scratch)
  function giroPiatto(t: number) {
    const w = Math.PI * 1.6, avvio = 0.8;
    const base = t < avvio ? (w * t * t) / (2 * avvio) : w * (avvio / 2 + (t - avvio));
    const k = seg(t, SCRATCH[0], SCRATCH[1]);
    return base + (k > 0 && k < 1 ? -0.55 * Math.sin(k * Math.PI * 2) * (1 - k) : 0);
  }

  // dove sta il piatto: prima al centro, poi di lato (a sinistra su desktop, un po' più piccolo; in alto sul telefono)
  function piatto(L: Misure, t: number) {
    const k = eInOutCubic(seg(t, SPOSTA[0], SPOSTA[1]));
    const fx = L.verticale ? L.cx : L.w * 0.3;
    const fy = L.verticale ? L.h * 0.36 : L.cy;
    return { x: lerp(L.cx, fx, k), y: lerp(L.cy, fy, k), s: lerp(1, L.verticale ? 1 : 0.85, k) };
  }

  // impaginazione dello slogan: grande e centrato all'inizio, poi accanto al disco
  function slogan(L: Misure, k: number) {
    const v = L.verticale;
    const sy = v ? 1.6 : 1;
    const adatta = (parola: string, largo: number, tetto: number) => Math.min(100 * largo / larghezza(parola, 'Archivo Black', 100), tetto);
    // all'inizio ogni parola è larga quasi tutto lo schermo
    const gMai = adatta('MAI', L.w * (v ? 0.9 : 0.6), L.h * (v ? 0.16 : 0.34));
    const gMol = adatta('MOLLARE', L.w * (v ? 0.9 : 0.84), L.h * (v ? 0.16 : 0.34));
    // alla fine: blocco allineato a sinistra accanto al disco (desktop) o centrato sotto (telefono)
    const fSz = adatta('MOLLARE', v ? L.w * 0.86 : L.w * 0.4, L.h * 0.2);
    const szMai = lerp(gMai, fSz * 1.25, k), szMol = lerp(gMol, fSz, k);
    const lMai = larghezza('MAI', 'Archivo Black', szMai), lMol = larghezza('MOLLARE', 'Archivo Black', szMol);
    const capMai = szMai * 0.72 * sy, capMol = szMol * 0.72 * sy, gap = Math.max(szMai, szMol) * 0.1 * sy;
    const top = lerp(L.cy, v ? L.h * 0.8 : L.cy, k) - (capMai + gap + capMol) / 2;
    const xSin = L.w * 0.53;
    return {
      sy,
      righe: [
        { testo: 'MAI', sz: szMai, x: lerp(L.cx - lMai / 2, v ? L.cx - lMai / 2 : xSin, k), base: top + capMai, colore: OSSO },
        { testo: 'MOLLARE', sz: szMol, x: lerp(L.cx - lMol / 2, v ? L.cx - lMol / 2 : xSin, k), base: top + capMai + gap + capMol, colore: ARANCIO },
      ],
    };
  }

  function disegnaSlogan(L: Misure, t: number, P: { x: number; y: number }) {
    const S = slogan(L, eInOutCubic(seg(t, SPOSTA[0], SPOSTA[1])));
    // scratch: lo slogan va avanti e indietro insieme al piatto, inclinandosi
    const ks = seg(t, SCRATCH[0], SCRATCH[1]);
    const colpo = ks > 0 && ks < 1 ? Math.sin(ks * Math.PI * 4) * (1 - ks) : 0;
    p.textFont('Archivo Black');
    p.textAlign(p.LEFT, p.BASELINE);
    p.noStroke();
    S.righe.forEach((r, ri) => {
      p.textSize(r.sz);
      p.fill(r.colore);
      for (let i = 0; i < r.testo.length; i++) {
        const inizio = (ri === 0 ? 0.08 : 0.3) + i * (ri === 0 ? 0.07 : 0.045);
        const k = eOutCubic(seg(t, inizio, inizio + 0.42));
        if (k <= 0) continue;
        // ogni lettera arriva girando attorno al perno del piatto, poi si ferma dritta
        const d = -1.25 * (1 - k);
        const x = r.x + larghezza(r.testo.slice(0, i), 'Archivo Black', r.sz) + colpo * L.m * 0.05 * (ri ? -1 : 1);
        const dx = x - P.x, dy = r.base - P.y;
        p.push();
        p.translate(P.x + dx * Math.cos(d) - dy * Math.sin(d), P.y + dx * Math.sin(d) + dy * Math.cos(d));
        p.rotate(d);
        p.shearX(colpo * 0.25);
        p.scale(1, S.sy);
        p.text(r.testo[i], 0, 0);
        p.pop();
      }
    });
  }

  function scenaGiradischi(L: Misure, t: number) {
    const V = misuraVinile(L);
    const P = piatto(L, t);
    const ang = giroPiatto(t);
    p.background(NOTTE);
    p.noStroke();
    // lo sfondo diventa petrolio con un blob che parte dal piatto
    const kFondo = eInOutCubic(seg(t, 1.05, 1.45));
    if (kFondo > 0) { p.fill(COLORE); blob(P.x, P.y, L.diag * 0.9 * kFondo, 0.18 * (1 - kFondo), 31, t); }

    // solchi: cerchi sottili che si disegnano dall'esterno verso l'interno, come la puntina; spariscono quando arriva il disco
    p.noFill();
    p.stroke(OSSO);
    p.strokeWeight(Math.max(1, V.R * 0.004));
    for (let i = 0; i < 7; i++) {
      const r = lerp(V.R * 0.99, V.rDisco * 1.02, i / 6) * P.s;
      const k = eOutCubic(seg(t, 0.02 + i * 0.05, 0.45 + i * 0.05)) * (1 - seg(t, 1.3 + i * 0.03, 1.5 + i * 0.03));
      if (k > 0) p.arc(P.x, P.y, r * 2, r * 2, ang - Math.PI / 2, ang - Math.PI / 2 + k * Math.PI * 2);
    }

    // al centro il vinile vero: nasce da un blob nero e gira con il piatto
    const kSeme = eOutBack(seg(t, 1.3, 1.55));
    const kLogo = eOutBack(seg(t, 1.45, 1.8));
    if (kSeme > 0 && kLogo < 0.85) { p.noStroke(); p.fill(NOTTE); blob(P.x, P.y, V.rDisco * P.s * kSeme, 0.18, 11, t); }
    if (kLogo > 0) {
      p.push();
      p.translate(P.x, P.y);
      p.rotate(ang * 0.6);
      const d = V.rDisco * 2 * P.s * kLogo;
      if (opzioni.immagineLogo) { p.imageMode(p.CENTER); p.image(opzioni.immagineLogo, 0, 0, d, d); }
      else { p.noStroke(); p.fill(NOTTE); p.circle(0, 0, d); }
      p.pop();
    } else if (t < 0.12 || t > SPOSTA[0]) {
      // perno arancio finché non arriva il disco (nascosto mentre lo slogan è al centro: finirebbe tra le lettere)
      p.noStroke(); p.fill(ARANCIO); p.circle(P.x, P.y, V.R * 0.05 * eOutBack(seg(t, 0, 0.12)));
    }

    // lo slogan sta sopra a tutto: è il protagonista
    disegnaSlogan(L, t, P);
  }

  const scena = (L: Misure, t: number) =>
    opzioni.stile === 'techno' ? scenaTecno(L, t) : opzioni.stile === 'giradischi' ? scenaGiradischi(L, t) : scenaClassica(L, t);

  // ───────────── uscite: tolgono l'intro e lasciano vedere il sito sotto (il canvas torna trasparente) ─────────────

  // tenda: lo schermo si divide sull'asse del disco (tra la M osso e la M arancio), bordo ondulato
  function uscitaTenda(L: Misure, t: number) {
    const t0 = 2.15;
    const k = eInCubic(seg(t, t0, DURATA));
    if (k <= 0) { scena(L, t); return; }
    p.clear();
    const d = k * (L.w / 2 + L.m * 0.25);
    const c = ctx();
    const cucitura = (y: number) => L.cx + Math.sin(y / L.h * Math.PI * 3 + t * 9) * L.m * 0.035 * (0.4 + k) + (p.noise(y * 0.004, t * 2) - 0.5) * L.m * 0.05;
    const passi = 60;
    for (const segno of [-1, 1]) {
      const dx = segno * d;
      p.push();
      c.translate(dx, 0);
      c.beginPath();
      c.moveTo(segno < 0 ? -L.w : L.w * 2, -10);
      for (let i = 0; i <= passi; i++) { const y = -10 + (L.h + 20) * i / passi; c.lineTo(cucitura(y), y); }
      c.lineTo(segno < 0 ? -L.w : L.w * 2, L.h + 10);
      c.closePath();
      c.clip();
      c.translate(-dx, 0);
      // la scena, ferma all'ultimo fotogramma del logo, si sposta con il pannello
      p.push(); p.translate(dx, 0); scena(L, t0); p.pop();
      p.pop();
      // bordo del pannello: arancio a destra, osso a sinistra
      p.push();
      p.translate(dx, 0);
      p.noFill();
      p.stroke(segno < 0 ? OSSO : ARANCIO);
      p.strokeWeight(L.m * 0.022);
      p.beginShape();
      for (let i = 0; i <= passi; i++) { const y = -10 + (L.h + 20) * i / passi; p.vertex(cucitura(y) + segno * L.m * 0.011, y); }
      p.endShape();
      p.pop();
    }
  }

  // blob: dal centro un blob arancio, poi uno nero, coprono tutto; poi un buco a blob si apre e mostra il sito
  function uscitaBlob(L: Misure, t: number) {
    const t0 = 2.1;
    if (t < t0) { scena(L, t); return; }
    const rAr = eInOutCubic(seg(t, t0, t0 + 0.4)) * L.diag * 0.62;
    const rNotte = eInOutCubic(seg(t, t0 + 0.12, t0 + 0.52)) * L.diag * 0.62;
    const rBuco = eInCubic(seg(t, t0 + 0.26, DURATA)) * L.diag * 0.7;
    if (rNotte < L.diag * 0.6) scena(L, t0);
    else p.clear();
    p.noStroke();
    p.fill(ARANCIO); blob(L.cx, L.cy, rAr, 0.16, 21, t);
    p.fill(NOTTE); blob(L.cx, L.cy, rNotte, 0.18, 23, t);
    if (rBuco > 0) {
      const c = ctx();
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      percorsoBlob(c, L.cx, L.cy, rBuco, 0.2, 25, t);
      c.fill();
      c.restore();
    }
  }

  // strisce: lo schermo si taglia a fasce che escono a scatti, alternate destra/sinistra
  function uscitaStrisce(L: Misure, t: number) {
    const t0 = 5 * BATTITO; // 2,34 s, sulla sesta cassa
    if (t < t0) { scena(L, t); return; }
    p.clear();
    const n = L.verticale ? 12 : 8;
    const h = L.h / n;
    const c = ctx();
    for (let i = 0; i < n; i++) {
      const k = Math.ceil(eInCubic(seg(t, t0 + i * 0.014, t0 + 0.3 + i * 0.014)) * 12) / 12;
      if (k >= 1) continue;
      const dir = i % 2 ? 1 : -1;
      const dx = dir * k * (L.w + L.m * 0.1);
      p.push();
      c.beginPath(); c.rect(dx, i * h, L.w, h + 1); c.clip();
      p.push(); p.translate(dx, 0); scena(L, t0); p.pop();
      p.pop();
      // filo arancio sul bordo che entra
      p.noStroke(); p.fill(ARANCIO);
      p.rect(dir > 0 ? dx - L.m * 0.012 : dx + L.w, i * h, L.m * 0.012, h + 1);
    }
  }

  // spazzata: il braccio del giradischi (una linea arancio) gira attorno al perno e cancella l'intro dietro di sé
  function uscitaSpazzata(L: Misure, t: number) {
    const t0 = 2.08;
    scena(L, t);
    if (t < t0) return;
    const P = opzioni.stile === 'giradischi' ? piatto(L, t) : { x: L.cx, y: L.cy };
    const k = eInOutCubic(seg(t, t0, DURATA - 0.04));
    const a0 = -Math.PI / 2, a1 = a0 + k * Math.PI * 2;
    const c = ctx();
    const R = L.diag * 1.2;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.moveTo(P.x, P.y);
    c.arc(P.x, P.y, R, a0, a1);
    c.closePath();
    c.fill();
    c.restore();
    if (k < 1) {
      p.stroke(ARANCIO);
      p.strokeWeight(L.m * 0.022);
      p.strokeCap(p.SQUARE);
      p.line(P.x, P.y, P.x + Math.cos(a1) * R, P.y + Math.sin(a1) * R);
      p.noStroke();
      p.fill(OSSO);
      p.circle(P.x, P.y, L.m * 0.05 * (1 - k * 0.6));
    }
  }

  const uscite: Record<UscitaIntro, (L: Misure, t: number) => void> = { tenda: uscitaTenda, blob: uscitaBlob, strisce: uscitaStrisce, spazzata: uscitaSpazzata };

  return {
    disegna(t: number) {
      if (t >= DURATA) { p.clear(); return; }
      uscite[opzioni.uscita](misure(p.width, p.height), t);
    },
  };
}
