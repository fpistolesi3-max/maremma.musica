// Il rimborso di un tavolo (avvia, ripeti, concludi, ripeti) sulle tabelle fa quello che fa sulla riga unica: stessi esiti, stessi errori, stesso ordine
// chiuso e tavolo di nuovo libero. Completa vendite-tabelle.test.ts, che prova le prevendite.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ADESSO_TEST, fissaOrologio } from './orologio-test';
fissaOrologio();
const cartella = mkdtempSync(path.join(tmpdir(), 'mm-zz-'));
process.env.MM_CARTELLA_DATI = cartella;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let m: any;
before(async () => { m = { archivio: await import('./archivio'), rimborsi: await import('./rimborsi'), prove: await import('./prova-db'), store: await import('./prova-store'), ricco: await import('./prova-archivio'), vv: await import('./prova-vendite') }; });
after(() => { m.archivio.usaTabelleDiProva(null); rmSync(cartella, { recursive: true, force: true }); });

async function giro(): Promise<unknown> {
  const { archivio, rimborsi } = m;
  const d = await archivio.leggi();
  const admin = { utente: d.utenti.find((u: { ruolo: string }) => u.ruolo === 'admin'), pr: null };
  const p = d.prenotazioni.find((x: { stato: string; pagamentoOnline: { pagamento: string } | null }) => x.stato === 'confermata' && x.pagamentoOnline?.pagamento);
  const b = { tipo: 'tavolo' as const, id: p.id, pagamento: null };
  const out: Record<string, unknown> = {};
  const f = async (fn: () => Promise<unknown>) => { try { return { v: await fn() }; } catch (e) { return { errore: (e as Error).message }; } };
  out.avvia = await f(async () => { const r = await rimborsi.avviaRimborso(admin, b); return { esito: r.esito, importo: r.importo, primario: r.primario }; });
  out.avviaDiNuovo = await f(() => rimborsi.avviaRimborso(admin, b));
  out.concludi = await f(async () => { const c = await rimborsi.concludiRimborso(admin, b); return c && { tipo: c.tipo, stato: c.vista?.prenotazione.stato }; });
  out.concludiDiNuovo = await f(() => rimborsi.concludiRimborso(admin, b));
  const dopo = await archivio.leggi();
  const pp = dopo.prenotazioni.find((x: { id: string }) => x.id === p.id);
  out.ordine = { stato: pp.stato, chiusaAt: pp.chiusaAt !== null, avviso: pp.avvisoChiusuraAt !== null, rimb: pp.pagamentoOnline.rimborso?.stato, daRimborsare: pp.pagamentoOnline.daRimborsare };
  out.tavolo = dopo.tavoli.find((t: { id: string }) => t.id === p.tavoloId).stato;
  return out;
}

test('rimborso di un tavolo: riga unica = tabelle', async () => {
  const ricco = m.ricco.archivioRicco();
  await m.archivio.modifica((a: object) => { Object.assign(a, structuredClone(ricco)); });
  const sulla = await giro();
  const db = await m.prove.creaDb();
  try {
    await m.prove.scriviRiga(db, ricco, 1); await m.vv.importa(db);
    m.archivio.usaTabelleDiProva({ store: m.store.storeDaDb(db), rpc: m.store.rpcDaDb(db) });
    const sulle = await giro();
    console.log(JSON.stringify(sulla), '\n', JSON.stringify(sulle));
    assert.deepEqual(sulle, sulla);
  } finally { m.archivio.usaTabelleDiProva(null); await db.close(); }
});
