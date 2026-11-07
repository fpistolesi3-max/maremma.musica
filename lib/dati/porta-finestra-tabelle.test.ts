// La finestra della porta (12 ore prima dell'inizio fino a fine serata) con l'archivio sulle TABELLE (PGlite): il controllo sta prima delle funzioni SQL
// del check-in, quindi un biglietto di una serata futura non si consuma nemmeno qui, il "Non rientra" nemmeno, e in serata si entra una volta sola.
// Stessa prova di quella sulla riga unica in permessi.test.ts, sulle due strade.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ADESSO_TEST, fissaOrologio } from './orologio-test';

fissaOrologio();
const cartella = mkdtempSync(path.join(tmpdir(), 'mm-porta-finestra-'));
process.env.MM_CARTELLA_DATI = cartella;

type Mod = {
  archivio: typeof import('./archivio');
  porta: typeof import('./porta');
  prove: typeof import('./prova-db');
  store: typeof import('./prova-store');
};
let m: Mod;
before(async () => {
  m = { archivio: await import('./archivio'), porta: await import('./porta'), prove: await import('./prova-db'), store: await import('./prova-store') };
});
after(() => { m.archivio.usaTabelleDiProva(null); rmSync(cartella, { recursive: true, force: true }); });

type Esito = Record<string, unknown>;
const sintesi = (r: { esito: string; motivo?: string }) => ({ esito: r.esito, motivo: r.motivo ?? null });

async function storia(): Promise<Esito> {
  const { archivio, porta } = m;
  const out: Esito = {};
  mock.timers.setTime(ADESSO_TEST.getTime());
  const d = await archivio.leggi();
  const staff = (() => { const utente = d.utenti.find((u) => u.email === 'porta@maremmamusica.test')!; return { utente, pr: null }; })();
  const ev = d.eventi.find((e) => e.slug === 'halloween-party')!;
  const biglietto = d.iscrizioni.find((i) => i.eventoId === ev.id && i.stato === 'pagato' && i.origine === 'lista')!;
  const stato = async () => { const i = (await archivio.leggi()).iscrizioni.find((x) => x.id === biglietto.id)!; return [i.stato, i.oraCheckIn !== null, i.rifiutoIngresso !== null]; };
  const adesso = () => ({ porta: 'P1', ora: new Date().toISOString() });

  // Undici giorni prima: porta chiusa, né l'ingresso né il "Non rientra" si registrano.
  out.undiciGiorniPrima = sintesi(await porta.checkIn(staff, ev.id, biglietto.tokenQr, adesso()) as never);
  out.rifiutoUndiciGiorniPrima = sintesi(await porta.rifiutaIngresso(staff, ev.id, biglietto.tokenQr, adesso()) as never);
  out.intattoPrima = await stato();
  // Con l'ora dell'ingresso "dentro la finestra" mandata da un telefono: l'istante non può stare nel futuro, quindi non aggira la porta.
  out.oraNelFuturo = sintesi(await porta.checkIn(staff, ev.id, biglietto.tokenQr, { porta: 'P1', ora: ev.data }) as never);
  out.intattoDopoOraNelFuturo = await stato();

  // La sera: la porta è aperta (12 ore prima dell'inizio), si entra una volta sola.
  mock.timers.setTime(Date.parse(ev.data) - 2 * 3_600_000);
  out.laSera = sintesi(await porta.checkIn(staff, ev.id, biglietto.tokenQr, adesso()) as never);
  out.laSeraDiNuovo = sintesi(await porta.checkIn(staff, ev.id, biglietto.tokenQr, adesso()) as never);
  out.entrato = await stato();

  // Dopo la fine della serata: niente più ingressi.
  const secondo = d.iscrizioni.find((i) => i.eventoId === ev.id && i.stato === 'pagato' && i.id !== biglietto.id && i.origine === 'lista')!;
  mock.timers.setTime(Date.parse(ev.dataFine ?? ev.data) + 3_600_000);
  out.dopoLaFine = sintesi(await porta.checkIn(staff, ev.id, secondo.tokenQr, adesso()) as never);
  out.secondoIntatto = ((await archivio.leggi()).iscrizioni.find((x) => x.id === secondo.id)!.stato);
  mock.timers.setTime(ADESSO_TEST.getTime());
  return out;
}

test('la finestra della porta vale anche sulle tabelle: serata futura intatta, in serata una volta sola, dopo la fine niente', async () => {
  const inizio = structuredClone(await m.archivio.leggi()) as import('./tipi').Archivio;
  const sulla = await storia();
  // Il file ha ora un ingresso in più: per le tabelle si riparte dagli stessi dati di prima.
  const db = await m.prove.creaDb();
  try {
    await m.prove.scriviRiga(db, inizio, 1);
    const { importa } = await import('./prova-vendite');
    await importa(db);
    m.archivio.usaTabelleDiProva({ store: m.store.storeDaDb(db), rpc: m.store.rpcDaDb(db) });
    assert.equal(m.archivio.modalitaCorrente(), 'tabelle');
    const sulleTabelle = await storia();
    for (const k of Object.keys(sulla)) assert.deepEqual(sulleTabelle[k], sulla[k], `differenza in "${k}"`);

    const c = sulleTabelle as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(c.undiciGiorniPrima.esito, 'non_valido');
    assert.match(c.undiciGiorniPrima.motivo, /Porta non ancora aperta/);
    assert.match(c.rifiutoUndiciGiorniPrima.motivo, /Porta non ancora aperta/);
    assert.deepEqual(c.intattoPrima, ['pagato', false, false], 'il biglietto di una serata futura non si consuma');
    assert.match(c.oraNelFuturo.motivo, /Porta non ancora aperta/);
    assert.deepEqual(c.intattoDopoOraNelFuturo, ['pagato', false, false]);
    assert.equal(c.laSera.esito, 'entrato');
    assert.equal(c.laSeraDiNuovo.esito, 'gia_entrato');
    assert.deepEqual(c.entrato, ['entrato', true, false]);
    assert.equal(c.dopoLaFine.motivo, 'Serata finita');
    assert.equal(c.secondoIntatto, 'pagato');
  } finally {
    m.archivio.usaTabelleDiProva(null);
    await db.close();
  }
});
