import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CARTELLA_MEDIA } from '@/lib/dati/archivio';

// Foto delle serate in sviluppo (online stanno nel bucket Storage "foto-serate"): .data/media/foto/<serata>/<foto>.jpg
export async function GET(_req: Request, { params }: { params: Promise<{ evento: string; file: string }> }) {
  const { evento, file } = await params;
  if (!/^[a-z0-9-]+$/.test(evento) || !/^[0-9a-f-]{36}(-m)?\.jpg$/.test(file)) return new Response('Non trovato', { status: 404 });
  try {
    const dati = await fs.readFile(path.join(CARTELLA_MEDIA, 'foto', evento, file));
    return new Response(new Uint8Array(dati), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response('Non trovato', { status: 404 });
  }
}
