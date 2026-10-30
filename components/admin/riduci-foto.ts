import { LATO_GRANDE, LATO_MINIATURA, MAX_BYTE_FILE } from '@/lib/foto';

export interface FotoRidotta { grande: Blob; mini: Blob; larghezza: number; altezza: number }

async function inJpeg(bmp: ImageBitmap, lato: number, qualita: number): Promise<{ blob: Blob; larghezza: number; altezza: number }> {
  const scala = Math.min(1, lato / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scala));
  canvas.height = Math.max(1, Math.round(bmp.height * scala));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Il browser non riesce a preparare la foto');
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualita));
  if (!blob) throw new Error('Il browser non riesce a preparare la foto');
  return { blob, larghezza: canvas.width, altezza: canvas.height };
}

/**
 * Prepara una foto per il sito: la versione grande (lato lungo 2000 px) e la miniatura (600 px), sempre JPEG.
 * La foto viene sempre ridisegnata, anche se è già piccola: così EXIF e posizione GPS non arrivano mai sul server.
 * Si ferma con un errore leggibile se il browser non sa aprire il file (per esempio un HEIC).
 */
export async function riduciFoto(file: File): Promise<FotoRidotta> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('Non è una foto');
  let bmp: ImageBitmap;
  try {
    // 'from-image': la foto scattata in verticale resta verticale anche dopo aver tolto i dati EXIF.
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Formato non leggibile: usa JPG, PNG o WebP');
  }
  try {
    let grande = await inJpeg(bmp, LATO_GRANDE, 0.82);
    for (const q of [0.74, 0.66, 0.58]) {
      if (grande.blob.size <= MAX_BYTE_FILE * 0.95) break;
      grande = await inJpeg(bmp, LATO_GRANDE, q);
    }
    if (grande.blob.size > MAX_BYTE_FILE) throw new Error('Foto troppo pesante anche dopo la riduzione');
    const mini = await inJpeg(bmp, LATO_MINIATURA, 0.74);
    return { grande: grande.blob, mini: mini.blob, larghezza: grande.larghezza, altezza: grande.altezza };
  } finally {
    bmp.close();
  }
}
