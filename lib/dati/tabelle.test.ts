// Lettura dalle tabelle (tappa 4): `leggi_tutto()`, il compositore tabelle → Archivio, il confronto con la riga unica, la verifica e il
// ritorno indietro. Il database è un Postgres vero in memoria (PGlite); la riga unica e le tabelle si riempiono con la copia della tappa 1-3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { creaDb, scriviRiga, MIGRAZIONI_VENDITE } from './prova-db';
import { archivioRicco, SEGRETO_DI_PROVA, versioneVecchia } from './prova-archivio';
import { datiIniziali } from './seed';
import { componiArchivio, confrontaArchivi, modalitaArchivio, statoDelTavolo, type LeggiTutto } from './tabelle';
import { archivioTabelle, ERRORE_SCRITTURA_TABELLE, type StoreTabelle } from './archivio-tabelle';
import { ripristinaRigaCon, verificaCon } from './verifica-archivio';
import { normalizza } from './archivio';
import type { Riga, StoreRemoto } from './archivio-remoto';
import type { Archivio } from './tipi';
import { importa, uno } from './prova-vendite';

async function conDb<T>(dati: Archivio, prova: (db: PGlite) => Promise<T>): Promise<T> {
  const db = await creaDb();
  try {
    await scriviRiga(db, dati, 41);
    await importa(db);
    return await prova(db);
  } finally {
    await db.close();
  }
}

const leggiTutto = async (db: PGlite) => (await uno(db, 'select public.leggi_tutto() as r')).r as LeggiTutto;
const dalleTabelle = async (db: PGlite) => { const raw = await leggiTutto(db); return { raw, archivio: componiArchivio(raw, new Date(raw.adesso)) }; };
const uguali = async (db: PGlite, dati: Archivio) => {
  const { raw, archivio } = await dalleTabelle(db);
  return confrontaArchivi(normalizza(structuredClone(dati)), archivio, new Date(raw.adesso));
};

/** Un archivio in memoria al posto della riga unica di Supabase. */
function rigaFinta(dati: Archivio | null, versione = 41) {
  let riga: Riga | null = dati ? { versione, dati: structuredClone(dati) } : null;
  const store: StoreRemoto = {
    async leggi() { return riga ? { versione: riga.versione, dati: structuredClone(riga.dati) } : null; },
    async crea(d) { riga ??= { versione: 1, dati: structuredClone(d) }; },
    async scrivi(v, d) { if (!riga || riga.versione !== v) return false; riga = { versione: v + 1, dati: structuredClone(d) }; return true; },
  };
  return { store, riga: () => riga };
}
const tabelleFinte = (db: PGlite): StoreTabelle => ({
  leggiTutto: () => leggiTutto(db),
  verificaSql: async () => (await uno(db, 'select public.verifica_importo() as r')).r,
});

test('la migrazione di leggi_tutto si ferma se mancano le tappe precedenti e la funzione è chiusa a chi non è il server', async () => {
  const file = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261107000000_leggi_tutto.sql'), 'utf8');
  const db = await creaDb(MIGRAZIONI_VENDITE);
  try {
    await assert.rejects(db.exec(file), /tappe 1, 2 e 3/);
  } finally {
    await db.close();
  }
  const completo = await creaDb();
  try {
    const f = await uno(completo, `select has_function_privilege('anon', 'public.leggi_tutto()', 'execute') as anon, has_function_privilege('authenticated', 'public.leggi_tutto()', 'execute') as auth,
      has_function_privilege('service_role', 'public.leggi_tutto()', 'execute') as srv, p.prosecdef as definer, p.proconfig::text like '%search_path=%' as vuoto
      from pg_proc p where p.proname = 'leggi_tutto'`);
    assert.deepEqual(f, { anon: false, auth: false, srv: true, definer: true, vuoto: true });
  } finally {
    await completo.close();
  }
});

test('senza il segreto nelle tabelle (copia non fatta) il compositore si ferma con un messaggio chiaro', async () => {
  const db = await creaDb();
  try {
    const raw = await leggiTutto(db);
    assert.deepEqual(Object.keys(raw).sort(), ['accessi', 'adesso', 'eventi', 'impostazioni', 'ingressi', 'iscrizioni', 'lotti', 'pagamenti', 'porte', 'posta', 'pr', 'prenotazioni', 'tavoli', 'utenti']);
    assert.throws(() => componiArchivio(raw), /segreto dei QR manca/);
  } finally {
    await db.close();
  }
});

test('i dati di esempio: le tabelle ricompongono la stessa cosa della riga unica', async () => {
  const d = datiIniziali(SEGRETO_DI_PROVA, new Date('2026-10-20T10:00:00+02:00'));
  await conDb(d, async (db) => {
    assert.deepEqual(await uguali(db, d), []);
    const { archivio } = await dalleTabelle(db);
    assert.equal(archivio.iscrizioni.length, d.iscrizioni.length);
    assert.equal(archivio.segreto, SEGRETO_DI_PROVA);
  });
});

test('un archivio ricco (pagamenti in più, rimborsi, anonimi, tavoli, ingressi): stessi valori, campo per campo', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    assert.deepEqual(await uguali(db, d), []);
    const { archivio } = await dalleTabelle(db);
    // Qualche valore guardato a mano, oltre al confronto automatico.
    const anon = archivio.iscrizioni.find((i) => i.anonimizzata)!;
    assert.deepEqual([anon.nome, anon.cognome, anon.dataNascita, anon.email, anon.etaAllaSerata], ['', '', '', '', 23]);
    const conPiu = archivio.iscrizioni.find((i) => i.pagamentoOnline?.pagamento === 'pi_A')!;
    assert.deepEqual(conPiu.pagamentoOnline!.inPiu!.map((p) => [p.pagamento, p.valuta, p.rimborso?.stato ?? null]), [['pi_A2', 'eur', 'fatto'], ['pi_A3', 'eur', null]]);
    const inCorso = archivio.iscrizioni.find((i) => i.pagamentoOnline?.pagamento === 'pi_C')!;
    assert.deepEqual([inCorso.pagamentoOnline!.daRimborsare, inCorso.pagamentoOnline!.motivo, inCorso.pagamentoOnline!.rimborso!.stato, inCorso.pagamentoOnline!.rimborso!.fattoAt], [true, 'doppione', 'in_corso', null]);
    const attesa = archivio.iscrizioni.find((i) => i.stato === 'in_attesa')!;
    assert.deepEqual([attesa.pagamentoOnline, attesa.rifiutoIngresso?.porta], [{ sessione: 'cs_f', pagamento: null, daRimborsare: false }, 'P1']);
    assert.equal(archivio.accessi.length, 1, 'l\'accesso di un utente sparito non c\'è');
    assert.equal(archivio.consegne.length, 0);
    assert.equal(archivio.versione, 1);
    // Lo stato dei tavoli si calcola: T1 pagato, T2 libero (rimborsata), T3 non in vendita, T4 riservato (richiesta aperta nel 2099).
    assert.deepEqual(archivio.tavoli.map((t) => [t.nome, t.stato]), [['T1', 'confermato'], ['T2', 'libero'], ['T3', 'non_in_vendita'], ['T4', 'riservato']]);
    assert.deepEqual(archivio.tavoli.map((t) => [t.x, t.y]), [[10.5, 20], [null, null], [99.9, 0], [null, null]]);
    // Gli ingressi per porta si calcolano: P1 = un entrato + un ingresso del tavolo, P2 = un ingresso del tavolo.
    assert.deepEqual(archivio.porte.map((p) => [p.nome, p.ingressi]), [['P1', 2], ['P2', 1]]);
    // (In ordine di ora: r2 è entrato alle 22:05 UTC, r1 alle 23:00.)
    assert.deepEqual(archivio.prenotazioni.find((p) => p.codice === 'COD00001')!.ingressi.map((i) => i.rif), ['r2', 'r1']);
  });
});

test('le serate e i tipi salvati prima, senza i campi nuovi, si ricompongono uguali', async () => {
  const d = versioneVecchia(archivioRicco());
  await conDb(d, async (db) => {
    assert.deepEqual(await uguali(db, d), []);
  });
});

test('il confronto dice quali campi differiscono, mai i loro valori', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    assert.deepEqual(await uguali(db, d), []);
    const iscrizione = d.iscrizioni[7];
    await db.query("update public.iscrizioni set stato = 'annullato', importo = 99, nome = 'ValoreSegretoXYZ' where id = $1", [iscrizione.id]);
    await db.query("update public.tavoli set nome = 'TavoloCambiato', posti = 3 where nome = 'T1'");
    await db.query("update public.pagamenti set centesimi = 1 where id = 'pi_A2'");
    await db.query("update public.impostazioni set valore = 'altro-segreto' where chiave = 'segreto'");
    await db.query('delete from public.lotti where true');
    await db.query("update public.porte set ultimo_sync = now() where nome = 'P2'");
    const differenze = await uguali(db, d);
    const id8 = iscrizione.id.slice(0, 8);
    for (const atteso of [`iscrizioni[${id8}].stato`, `iscrizioni[${id8}].importo`, `iscrizioni[${id8}].nome`, 'segreto', `lotti: ${d.lotti.length} nella riga ma non nelle tabelle`]) {
      assert.ok(differenze.includes(atteso), `${atteso} in ${JSON.stringify(differenze)}`);
    }
    assert.ok(differenze.some((x) => /^tavoli\[.{8}\]\.nome$/.test(x)) && differenze.some((x) => /^tavoli\[.{8}\]\.posti$/.test(x)));
    assert.ok(differenze.some((x) => /^iscrizioni\[.{8}\]\.pagamentoOnline\.inPiu\[pi_A2\]\.centesimi$/.test(x)), JSON.stringify(differenze));
    assert.ok(differenze.some((x) => /^porte\[.{8}\]\.ultimoSync$/.test(x)));
    // Nessun valore, né personale né segreto, nel risultato.
    const testo = JSON.stringify(differenze);
    for (const valore of ['ValoreSegretoXYZ', 'altro-segreto', SEGRETO_DI_PROVA, 'TavoloCambiato', iscrizione.email, iscrizione.cognome, iscrizione.tokenQr]) {
      assert.ok(!testo.includes(valore), `il valore ${valore.slice(0, 4)}… non deve comparire`);
    }
  });
});

test('lo stato di un tavolo si calcola come la vista del database', async () => {
  const adesso = new Date('2026-10-30T12:00:00Z');
  const tra = (m: number) => new Date(adesso.getTime() + m * 60_000).toISOString();
  assert.equal(statoDelTavolo(false, [{ stato: 'confermata', scade: tra(-10) }], adesso), 'non_in_vendita');
  assert.equal(statoDelTavolo(true, [{ stato: 'annullata', scade: tra(10) }, { stato: 'confermata', scade: tra(-10) }], adesso), 'confermato');
  assert.equal(statoDelTavolo(true, [{ stato: 'in_attesa', scade: tra(10) }], adesso), 'riservato');
  assert.equal(statoDelTavolo(true, [{ stato: 'in_attesa', scade: tra(-10) }, { stato: 'scaduta', scade: tra(10) }, { stato: 'rimborsata', scade: tra(10) }], adesso), 'libero');
  assert.equal(statoDelTavolo(true, [], adesso), 'libero');
});

test('MM_ARCHIVIO: spento di default, acceso solo con Supabase, valori strani = spento', () => {
  const sb = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  assert.equal(modalitaArchivio({}), 'riga');
  assert.equal(modalitaArchivio({ ...sb }), 'riga');
  assert.equal(modalitaArchivio({ ...sb, MM_ARCHIVIO: 'riga' }), 'riga');
  assert.equal(modalitaArchivio({ ...sb, MM_ARCHIVIO: 'tabelle' }), 'tabelle');
  assert.equal(modalitaArchivio({ ...sb, MM_ARCHIVIO: ' Tabelle ' }), 'tabelle');
  assert.equal(modalitaArchivio({ ...sb, MM_ARCHIVIO: 'si' }), 'riga');
  assert.equal(modalitaArchivio({ ...sb, MM_ARCHIVIO: '' }), 'riga');
  assert.equal(modalitaArchivio({ MM_ARCHIVIO: 'tabelle' }), 'riga', 'in locale (senza Supabase) resta il file');
});

test("l'archivio sulle tabelle legge, e scrivere si ferma con un errore chiaro (la scrittura arriva con le tappe 5-7)", async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const archivio = archivioTabelle(tabelleFinte(db), normalizza);
    const letto = await archivio.leggi();
    assert.equal(letto.eventi.length, d.eventi.length);
    assert.equal(letto.segreto, SEGRETO_DI_PROVA);
    await assert.rejects(archivio.modifica(() => 1), (e: Error) => e.message === ERRORE_SCRITTURA_TABELLE && /riga/.test(e.message));
  });
});

test('verifica: tutto uguale = ok; una riga che cambia o un dato che differisce = non ok, con i nomi dei campi', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const { store } = rigaFinta(d);
    const ok = await verificaCon(store, tabelleFinte(db), normalizza);
    assert.equal(ok.ok, true, JSON.stringify(ok.differenze));
    assert.deepEqual(ok.differenze, []);
    assert.equal(ok.versioneRiga, 41);
    assert.equal(ok.conteggi.riga.iscrizioni, ok.conteggi.tabelle.iscrizioni);
    assert.equal(ok.conteggi.tabelle.tavoli, 4);

    // Qualcuno scrive nella riga dopo la copia: la verifica lo dice (versione) e il confronto vede il campo.
    const cambiata = structuredClone(d);
    cambiata.eventi[0].nome = 'Altro nome';
    await db.query('update public.archivio_mvp set versione = 42 where id = 1');
    const f = rigaFinta(cambiata, 42);
    const no = await verificaCon(f.store, tabelleFinte(db), normalizza);
    assert.equal(no.ok, false);
    assert.ok(no.differenze.some((x) => /^eventi\[.{8}\]\.nome$/.test(x)), JSON.stringify(no.differenze));
    assert.equal((no.sql as { versione_ok: boolean }).versione_ok, false);
    assert.ok(!JSON.stringify(no).includes('Altro nome') && !JSON.stringify(no).includes(SEGRETO_DI_PROVA));

    // Riga unica che non esiste.
    const vuota = await verificaCon(rigaFinta(null).store, tabelleFinte(db), normalizza);
    assert.deepEqual([vuota.ok, vuota.versioneRiga, vuota.differenze], [false, null, ['la riga unica non esiste']]);
  });
});

test('ritorno indietro: la riga unica si riscrive con quello che c\'è nelle tabelle, anche con le scritture fatte dopo', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    // Dopo il passaggio qualcuno ha venduto: una prenotazione in più direttamente nelle tabelle.
    const t = d.tavoli[3];
    await db.query("update public.prenotazioni_tavoli set stato = 'annullata', chiusa_at = now() where tavolo_id = $1", [t.id]);
    await db.query("update public.eventi set nome = 'Nome dopo il passaggio' where id = $1", [d.eventi[0].id]);
    const f = rigaFinta(d, 41);
    const esito = await ripristinaRigaCon(f.store, tabelleFinte(db), normalizza);
    assert.deepEqual(esito, { versione: 42, serate: d.eventi.length });
    const riga = f.riga()!;
    assert.equal(riga.versione, 42);
    assert.equal(riga.dati.eventi.find((e) => e.id === d.eventi[0].id)!.nome, 'Nome dopo il passaggio');
    assert.equal(riga.dati.segreto, SEGRETO_DI_PROVA, 'il segreto dei QR non cambia: i biglietti già emessi valgono ancora');
    assert.equal(riga.dati.prenotazioni.find((p) => p.tavoloId === t.id && p.codice === 'COD00004')!.stato, 'annullata');
    // Subito dopo, riga e tabelle sono uguali.
    const dopo = await verificaCon(f.store, tabelleFinte(db), normalizza);
    assert.deepEqual(dopo.differenze, []);
  });
});

test('ritorno indietro: con le tabelle vuote o la riga cambiata nel frattempo non fa danni', async () => {
  const vuoto = await creaDb();
  try {
    await uno(vuoto, "insert into public.impostazioni (chiave, valore) values ('segreto', 's') returning chiave");
    const f = rigaFinta(archivioRicco());
    await assert.rejects(ripristinaRigaCon(f.store, tabelleFinte(vuoto), normalizza), /nessuna serata/);
    assert.equal(f.riga()!.versione, 41, 'la riga non è stata toccata');
  } finally {
    await vuoto.close();
  }
  const d = archivioRicco();
  await conDb(d, async (db) => {
    // La riga cambia sotto i piedi due volte: al terzo tentativo riesce; se cambia sempre, si ferma.
    let scritture = 0;
    const f = rigaFinta(d);
    const store: StoreRemoto = { ...f.store, async scrivi(v, dati) { scritture++; return scritture > 2 ? f.store.scrivi(v, dati) : false; } };
    assert.deepEqual(await ripristinaRigaCon(store, tabelleFinte(db), normalizza), { versione: 42, serate: d.eventi.length });
    const sempre: StoreRemoto = { ...f.store, async scrivi() { return false; } };
    await assert.rejects(ripristinaRigaCon(sempre, tabelleFinte(db), normalizza), /è cambiata/);
  });
});

test('senza la riga unica il ritorno indietro la crea', async () => {
  const d = archivioRicco();
  await conDb(d, async (db) => {
    const f = rigaFinta(null);
    assert.deepEqual(await ripristinaRigaCon(f.store, tabelleFinte(db), normalizza), { versione: 1, serate: d.eventi.length });
    assert.deepEqual((await verificaCon(f.store, tabelleFinte(db), normalizza)).differenze, []);
  });
});
