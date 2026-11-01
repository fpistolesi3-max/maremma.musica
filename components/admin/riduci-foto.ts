import { LATO_GRANDE, LATO_MINIATURA, MAX_BYTE_FILE } from '@/lib/foto';

export interface FotoRidotta { grande: Blob; mini: Blob; larghezza: number; altezza: number }

/** Una foto aperta nel browser: il disegno, le misure e come liberarlo. */
interface Aperta { sorgente: CanvasImageSource; larghezza: number; altezza: number; chiudi: () => void }

/**
 * Apre la foto nel modo più compatibile: prima `createImageBitmap` con l'orientamento EXIF (così una foto scattata in verticale
 * resta verticale), poi senza opzioni (browser vecchi che non le accettano), poi con un `<img>` disegnato su canvas.
 * Se falliscono tutti il formato non è leggibile da questo browser (per esempio un HEIC su Chrome).
 */
async function apri(file: File): Promise<Aperta> {
  for (const opzioni of [{ imageOrientation: 'from-image' as const }, undefined]) {
    try {
      const bmp = opzioni ? await createImageBitmap(file, opzioni) : await createImageBitmap(file);
      return { sorgente: bmp, larghezza: bmp.width, altezza: bmp.height, chiudi: () => bmp.close() };
    } catch { /* si prova il modo dopo */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('vuota');
    return { sorgente: img, larghezza: img.naturalWidth, altezza: img.naturalHeight, chiudi: () => { img.src = ''; URL.revokeObjectURL(url); } };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Formato non leggibile: usa JPG, PNG o WebP');
  }
}

async function inJpeg(foto: Aperta, lato: number, qualita: number): Promise<{ blob: Blob; larghezza: number; altezza: number }> {
  const scala = Math.min(1, lato / Math.max(foto.larghezza, foto.altezza));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(foto.larghezza * scala));
  canvas.height = Math.max(1, Math.round(foto.altezza * scala));
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Il browser non riesce a preparare la foto');
    ctx.drawImage(foto.sorgente, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualita));
    if (!blob) throw new Error('Il browser non riesce a preparare la foto');
    return { blob, larghezza: canvas.width, altezza: canvas.height };
  } finally {
    canvas.width = canvas.height = 0; // libera subito la memoria del disegno
  }
}

// Una foto alla volta: decodificarne tre da 48 MP insieme riempie la memoria di un telefono e il browser chiude la pagina.
// Il caricamento in rete, che viene dopo, resta in parallelo.
let turno: Promise<unknown> = Promise.resolve();

/**
 * Prepara una foto per il sito: la versione grande (lato lungo 2000 px) e la miniatura (600 px), sempre JPEG.
 * La foto viene sempre ridisegnata, anche se è già piccola: così EXIF e posizione GPS non arrivano mai sul server.
 */
export function riduciFoto(file: File): Promise<FotoRidotta> {
  const lavoro = turno.then(() => riduci(file));
  turno = lavoro.catch(() => undefined);
  return lavoro;
}

async function riduci(file: File): Promise<FotoRidotta> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('Non è una foto');
  const foto = await apri(file);
  try {
    let grande = await inJpeg(foto, LATO_GRANDE, 0.82);
    for (const q of [0.74, 0.66, 0.58]) {
      if (grande.blob.size <= MAX_BYTE_FILE * 0.95) break;
      grande = await inJpeg(foto, LATO_GRANDE, q);
    }
    if (grande.blob.size > MAX_BYTE_FILE) throw new Error('Foto troppo pesante anche dopo la riduzione');
    const mini = await inJpeg(foto, LATO_MINIATURA, 0.74);
    return { grande: grande.blob, mini: mini.blob, larghezza: grande.larghezza, altezza: grande.altezza };
  } finally {
    foto.chiudi();
  }
}
