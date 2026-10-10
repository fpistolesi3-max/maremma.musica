/**
 * Riduce una foto (lato lungo massimo `lato` px, JPEG) se è grande o pesante; altrimenti la lascia com'è.
 * Se il browser non sa farlo restituisce l'originale: la verifica del peso resta sul server.
 */
export async function riduciImmagine(file: File, lato = 2000, qualita = 0.86, sogliaByte = 1.5 * 1024 * 1024): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scala = Math.min(1, lato / Math.max(bmp.width, bmp.height));
    if (scala === 1 && file.size <= sogliaByte) { bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scala);
    canvas.height = Math.round(bmp.height * scala);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close(); return file; }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualita));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
