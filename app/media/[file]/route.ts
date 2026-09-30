import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CARTELLA_MEDIA } from '@/lib/dati/archivio';

// Locandine caricate dall'admin (in sviluppo stanno in .data/media).
const TIPI: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(file)) return new Response('Non trovato', { status: 404 });
  try {
    const dati = await fs.readFile(path.join(CARTELLA_MEDIA, file));
    return new Response(new Uint8Array(dati), { headers: { 'Content-Type': TIPI[file.split('.').pop()!], 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response('Non trovato', { status: 404 });
  }
}
