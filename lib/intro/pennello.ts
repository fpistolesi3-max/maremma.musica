// Strato di disegno minimo su Canvas 2D nativo, con gli stessi nomi e lo stesso comportamento delle funzioni di p5.js
// che servono all'intro (era disegnata con p5: così il disegno resta identico, senza i 256 KB della libreria).
// Come in p5: gli stili (riempimento, tratto, testo) restano da un fotogramma all'altro, le trasformazioni no.

type Stato = {
  riempi: string | null;
  traccia: string | null;
  spessore: number;
  fine: CanvasLineCap;
  giunto: CanvasLineJoin;
  font: string;
  dimensione: number;
  allineaX: CanvasTextAlign;
  allineaY: CanvasTextBaseline;
  modoImmagine: 'corner' | 'center';
};

// rumore di Perlin come quello di p5 (noise / noiseSeed), stessi numeri a parità di seme
const PERLIN_YWRAPB = 4, PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB = 8, PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
const PERLIN_SIZE = 4095;
const OTTAVE = 4, CALO = 0.5;
const coseno = (i: number) => 0.5 * (1.0 - Math.cos(i * Math.PI));

export class Pennello {
  readonly CLOSE = 'close';
  readonly LEFT = 'left';
  readonly RIGHT = 'right';
  readonly CENTER = 'center';
  readonly TOP = 'top';
  readonly BOTTOM = 'bottom';
  readonly BASELINE = 'alphabetic';
  readonly MITER = 'miter';
  readonly SQUARE = 'square';

  width = 0;
  height = 0;
  readonly drawingContext: CanvasRenderingContext2D;
  private densita = 1;
  private stato: Stato = {
    riempi: '#ffffff', traccia: '#000000', spessore: 1, fine: 'round', giunto: 'miter',
    font: 'sans-serif', dimensione: 12, allineaX: 'left', allineaY: 'alphabetic', modoImmagine: 'corner',
  };
  private pila: Stato[] = [];
  private forma: [number, number][] = [];
  private perlin: number[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    this.drawingContext = canvas.getContext('2d')!;
  }

  /** Misura in pixel CSS e densità (devicePixelRatio): il canvas resta nitido sugli schermi densi. */
  dimensiona(larghezza: number, altezza: number, densita: number) {
    this.width = larghezza;
    this.height = altezza;
    this.densita = densita;
    this.canvas.width = Math.floor(larghezza * densita);
    this.canvas.height = Math.floor(altezza * densita);
    this.canvas.style.width = `${larghezza}px`;
    this.canvas.style.height = `${altezza}px`;
  }

  /** Inizio di ogni fotogramma: trasformazioni azzerate, stili invariati. */
  nuovoFotogramma() {
    this.drawingContext.setTransform(this.densita, 0, 0, this.densita, 0, 0);
  }

  // ── stato ──
  fill(c: string) { this.stato.riempi = c; }
  noFill() { this.stato.riempi = null; }
  stroke(c: string) { this.stato.traccia = c; }
  noStroke() { this.stato.traccia = null; }
  strokeWeight(w: number) { this.stato.spessore = w; }
  strokeCap(c: CanvasLineCap) { this.stato.fine = c; }
  strokeJoin(j: CanvasLineJoin) { this.stato.giunto = j; }
  textFont(f: string) { this.stato.font = f; }
  textSize(s: number) { this.stato.dimensione = s; }
  textAlign(x: CanvasTextAlign, y?: string) {
    this.stato.allineaX = x;
    if (y) this.stato.allineaY = (y === 'center' ? 'middle' : y) as CanvasTextBaseline;
  }
  imageMode(m: 'corner' | 'center') { this.stato.modoImmagine = m; }

  push() { this.pila.push({ ...this.stato }); this.drawingContext.save(); }
  pop() { this.stato = this.pila.pop() ?? this.stato; this.drawingContext.restore(); }

  // ── trasformazioni ──
  translate(x: number, y: number) { this.drawingContext.translate(x, y); }
  rotate(a: number) { this.drawingContext.rotate(a); }
  scale(x: number, y = x) { this.drawingContext.scale(x, y); }
  shearX(a: number) { this.drawingContext.transform(1, 0, Math.tan(a), 1, 0, 0); }

  // ── disegno ──
  private traccia() {
    const c = this.drawingContext, s = this.stato;
    if (!s.traccia) return;
    c.strokeStyle = s.traccia;
    c.lineWidth = s.spessore;
    c.lineCap = s.fine;
    c.lineJoin = s.giunto;
    c.stroke();
  }

  private dipingi() {
    if (this.stato.riempi) { this.drawingContext.fillStyle = this.stato.riempi; this.drawingContext.fill(); }
    this.traccia();
  }

  background(colore: string) {
    const c = this.drawingContext;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = colore;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.restore();
  }

  clear() {
    const c = this.drawingContext;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.restore();
  }

  beginShape() { this.forma = []; }
  vertex(x: number, y: number) { this.forma.push([x, y]); }
  /** Con CLOSE la forma si chiude anche nel tratto; aperta, il riempimento la chiude da sé e il tratto no. */
  endShape(modo?: string) {
    const c = this.drawingContext;
    if (!this.forma.length) return;
    c.beginPath();
    this.forma.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (modo === this.CLOSE) c.closePath();
    this.dipingi();
  }

  circle(x: number, y: number, d: number) {
    const c = this.drawingContext;
    c.beginPath();
    c.arc(x, y, Math.abs(d) / 2, 0, Math.PI * 2);
    this.dipingi();
  }

  /** Arco di ellisse (w × h) aperto: con noFill è solo la curva, come arc() di p5. Se si chiude, come p5 disegna l'ellisse intera. */
  arc(x: number, y: number, w: number, h: number, inizio: number, fine: number) {
    const c = this.drawingContext;
    const giro = Math.PI * 2;
    const a = inizio - giro * Math.floor(inizio / giro), b = fine - giro * Math.floor(fine / giro);
    const chiuso = Math.min(Math.abs(a - b), giro - Math.abs(a - b)) < 0.00001;
    c.beginPath();
    c.ellipse(x, y, Math.abs(w) / 2, Math.abs(h) / 2, 0, chiuso ? 0 : inizio, chiuso ? giro : fine);
    this.dipingi();
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    const c = this.drawingContext;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    this.traccia();
  }

  rect(x: number, y: number, w: number, h: number) {
    const c = this.drawingContext;
    c.beginPath();
    c.rect(x, y, w, h);
    this.dipingi();
  }

  text(testo: string, x: number, y: number) {
    const c = this.drawingContext, s = this.stato;
    c.font = `${s.dimensione}px "${s.font}"`;
    c.textAlign = s.allineaX;
    c.textBaseline = s.allineaY;
    if (s.traccia) { c.strokeStyle = s.traccia; c.lineWidth = s.spessore; c.strokeText(testo, x, y); }
    if (s.riempi) { c.fillStyle = s.riempi; c.fillText(testo, x, y); }
  }

  image(img: CanvasImageSource, x: number, y: number, w: number, h: number) {
    if (this.stato.modoImmagine === 'center') { x -= w / 2; y -= h / 2; }
    this.drawingContext.drawImage(img, x, y, w, h);
  }

  // ── rumore ──
  noiseSeed(seme: number) {
    // generatore congruenziale lineare (gli stessi parametri di p5)
    const m = 4294967296, a = 1664525, c = 1013904223;
    let z = seme >>> 0;
    this.perlin = Array.from({ length: PERLIN_SIZE + 1 }, () => (z = (a * z + c) % m) / m);
  }

  noise(x: number, y = 0, z = 0) {
    if (!this.perlin.length) this.perlin = Array.from({ length: PERLIN_SIZE + 1 }, () => Math.random());
    const perlin = this.perlin;
    x = Math.abs(x); y = Math.abs(y); z = Math.abs(z);
    let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    let r = 0, ampl = 0.5;
    for (let o = 0; o < OTTAVE; o++) {
      let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);
      const rxf = coseno(xf), ryf = coseno(yf);
      let n1 = perlin[of & PERLIN_SIZE];
      n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
      let n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
      n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
      n1 += ryf * (n2 - n1);
      of += PERLIN_ZWRAP;
      n2 = perlin[of & PERLIN_SIZE];
      n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
      let n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
      n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
      n2 += ryf * (n3 - n2);
      n1 += coseno(zf) * (n2 - n1);
      r += n1 * ampl;
      ampl *= CALO;
      xi <<= 1; xf *= 2; yi <<= 1; yf *= 2; zi <<= 1; zf *= 2;
      if (xf >= 1.0) { xi++; xf--; }
      if (yf >= 1.0) { yi++; yf--; }
      if (zf >= 1.0) { zi++; zf--; }
    }
    return r;
  }
}
