// Migrazione delle anagrafiche (supabase/migrations/20261104000000_schema_anagrafiche.sql) provata su un Postgres vero in memoria:
// permessi, copia dalla riga unica (con i dati del seed e con casi vecchi), copia rilanciabile, segreto solo per impronta, vincoli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { creaDb, scriviRiga, MIGRAZIONI_ANAGRAFICHE } from './prova-db';
import { datiIniziali } from './seed';
import type { Archivio } from './tipi';

const SEGRETO = 'segreto-di-prova-che-non-deve-mai-comparire';
const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/** Un archivio come quello online, con i campi facoltativi compilati almeno una volta. */
function archivioDiProva(): Archivio {
  const d = datiIniziali(SEGRETO, new Date('2026-10-20T10:00:00+02:00'));
  const [prima, seconda] = d.eventi;
  Object.assign(prima, {
    inCopertina: true, capienza: 800, prevenditaFinoAlle: '2026-11-01T00:00:00.000Z', piantinaUrl: 'https://esempio.test/sala.png',
    lineup: ['A', 'B & C', "D'E"], prAbilitati: [d.pr[0].id, d.pr[1].id],
    invioLinkPr: { at: '2026-10-25T09:00:00.000Z', inviate: 3, nonPartite: 1 },
  });
  Object.assign(seconda, { senzaTelefono: true, locationSegreta: true, lat: 43.1512, lng: 10.7713, etaMinima: 21 });
  Object.assign(d.lotti[0], { dataInizio: null, dataFine: null, categoria: 'Donne', confermaCategoria: true, uscitaGiorniPrima: 5, fineOrePrima: 3, dopoPrecedente: true, prAbilitati: [d.pr[0].id], automatico: true });
  d.porte.push({ nome: 'P1', eventoId: prima.id, ultimoSync: '2026-10-31T23:10:00.000Z', ingressi: 12 });
  d.porte.push({ nome: 'P2', eventoId: prima.id, ultimoSync: '2026-10-31T23:20:00+01:00', ingressi: 0 });
  return d;
}

async function conRiga<T>(dati: unknown, prova: (db: PGlite) => Promise<T>, versione = 273): Promise<T> {
  const db = await creaDb(MIGRAZIONI_ANAGRAFICHE);
  try {
    await scriviRiga(db, dati, versione);
    return await prova(db);
  } finally {
    await db.close();
  }
}

const importa = async (db: PGlite) => (await db.query<{ r: Record<string, number> }>('select public.importa_archivio() as r')).rows[0].r;
const verifica = async (db: PGlite) => (await db.query<{ r: { ok: boolean; differenze: string[]; segreto_ok: boolean; versione_ok: boolean; conteggi: Record<string, { riga: number; tabella: number }> } }>(
  'select public.verifica_importo() as r')).rows[0].r;
const tutte = async (db: PGlite, tabella: string, ordine: string) => (await db.query<Record<string, unknown>>(`select * from public.${tabella} order by ${ordine}`)).rows;

/** Date come istanti, numeri come numeri: la riga e le tabelle scrivono gli stessi valori in modo diverso. */
const istante = (v: unknown) => (v == null ? null : new Date(v as string).getTime());
const numero = (v: unknown) => (v == null ? null : Number(v));

test('la migrazione si applica e le tabelle sono chiuse a chiunque non sia il server', async () => {
  const db = await creaDb(MIGRAZIONI_ANAGRAFICHE);
  try {
    const tabelle = ['eventi', 'lotti', 'pr', 'utenti', 'impostazioni', 'porte', 'posta_inviata'];
    for (const t of tabelle) {
      const { rows: [r] } = await db.query<{ rls: boolean; anon: boolean; auth: boolean; srv: boolean; policy: string }>(
        `select c.relrowsecurity as rls,
                has_table_privilege('anon', c.oid, 'select') as anon,
                has_table_privilege('authenticated', c.oid, 'select') as auth,
                has_table_privilege('service_role', c.oid, 'insert') as srv,
                (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::text as policy
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = $1`, [t]);
      assert.equal(r.rls, true, `${t}: RLS accesa`);
      assert.equal(r.anon, false, `${t}: anon non legge`);
      assert.equal(r.auth, false, `${t}: authenticated non legge`);
      assert.equal(r.srv, true, `${t}: il server scrive`);
      assert.equal(r.policy, '0', `${t}: nessuna policy`);
    }
    for (const f of ['importa_archivio()', 'verifica_importo()']) {
      const { rows: [r] } = await db.query<{ anon: boolean; auth: boolean; srv: boolean }>(
        `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
                has_function_privilege('service_role', $1, 'execute') as srv`, [`public.${f}`]);
      assert.deepEqual(r, { anon: false, auth: false, srv: true }, f);
    }
    // L'interruttore parte su "jsonb".
    const { rows: [i] } = await db.query<{ valore: string }>("select valore from public.impostazioni where chiave = 'archivio'");
    assert.equal(i.valore, 'jsonb');
  } finally {
    await db.close();
  }
});

test('la copia del seed dà gli stessi conteggi e gli stessi valori', async () => {
  const d = archivioDiProva();
  await conRiga(d, async (db) => {
    const esito = await importa(db);
    assert.deepEqual(esito, { eventi: d.eventi.length, lotti: d.lotti.length, pr: d.pr.length, utenti: d.utenti.length, porte: d.porte.length, versione: 273 });

    const eventi = await tutte(db, 'eventi', 'slug');
    assert.equal(eventi.length, d.eventi.length);
    for (const e of d.eventi) {
      const r = eventi.find((x) => x.id === e.id)!;
      assert.ok(r, `serata ${e.slug}`);
      assert.deepEqual(
        { numero: r.numero, slug: r.slug, nome: r.nome, data: istante(r.data), dataFine: istante(r.data_fine), location: r.location, comune: r.comune,
          lat: r.lat, lng: r.lng, locationSegreta: r.location_segreta, tipoIngresso: r.tipo_ingresso, descrizione: r.descrizione, highlight: r.highlight,
          dressCode: r.dress_code, lineup: r.lineup, infoArrivo: r.info_arrivo, locandinaUrl: r.locandina_url, piantinaUrl: r.piantina_url,
          prezzoLista: numero(r.prezzo_lista), senzaTelefono: r.senza_telefono, prevenditaFinoAlle: istante(r.prevendita_fino_alle),
          capienza: r.capienza, etaMinima: r.eta_minima, pubblicato: r.pubblicato, inCopertina: r.in_copertina, prAbilitati: r.pr_abilitati,
          invioLinkPr: r.invio_link_pr, createdAt: istante(r.created_at), updatedAt: istante(r.updated_at) },
        { numero: e.numero, slug: e.slug, nome: e.nome, data: istante(e.data), dataFine: istante(e.dataFine), location: e.location, comune: e.comune,
          lat: e.lat, lng: e.lng, locationSegreta: e.locationSegreta, tipoIngresso: e.tipoIngresso, descrizione: e.descrizione, highlight: e.highlight,
          dressCode: e.dressCode, lineup: e.lineup, infoArrivo: e.infoArrivo, locandinaUrl: e.locandinaUrl, piantinaUrl: e.piantinaUrl ?? null,
          prezzoLista: e.prezzoLista, senzaTelefono: e.senzaTelefono, prevenditaFinoAlle: istante(e.prevenditaFinoAlle ?? null),
          capienza: e.capienza ?? null, etaMinima: e.etaMinima, pubblicato: e.pubblicato, inCopertina: e.inCopertina ?? false, prAbilitati: e.prAbilitati,
          invioLinkPr: e.invioLinkPr ?? null, createdAt: istante(e.createdAt), updatedAt: istante(e.updatedAt) },
        `serata ${e.slug}`);
    }

    const lotti = await tutte(db, 'lotti', 'id');
    assert.equal(lotti.length, d.lotti.length);
    for (const l of d.lotti) {
      const r = lotti.find((x) => x.id === l.id)!;
      assert.deepEqual(
        { eventoId: r.evento_id, nome: r.nome, prezzo: numero(r.prezzo), quantita: r.quantita, dataInizio: istante(r.data_inizio), dataFine: istante(r.data_fine),
          visibileDaPr: r.visibile_da_pr, ordine: r.ordine, categoria: r.categoria, confermaCategoria: r.conferma_categoria,
          uscitaGiorniPrima: r.uscita_giorni_prima, fineOrePrima: r.fine_ore_prima, dopoPrecedente: r.dopo_precedente, prAbilitati: r.pr_abilitati,
          automatico: r.automatico },
        { eventoId: l.eventoId, nome: l.nome, prezzo: l.prezzo, quantita: l.quantita, dataInizio: istante(l.dataInizio), dataFine: istante(l.dataFine),
          visibileDaPr: l.visibileDaPr, ordine: l.ordine, categoria: l.categoria, confermaCategoria: l.confermaCategoria,
          uscitaGiorniPrima: l.uscitaGiorniPrima, fineOrePrima: l.fineOrePrima, dopoPrecedente: l.dopoPrecedente, prAbilitati: l.prAbilitati,
          automatico: l.automatico ?? false },
        `tipo ${l.nome}`);
    }

    const pr = await tutte(db, 'pr', 'handle');
    assert.deepEqual(pr.map((r) => [r.id, r.handle, r.nome_display, r.stato, istante(r.created_at)]).sort(),
      d.pr.map((p) => [p.id, p.handle, p.nomeDisplay, p.stato, istante(p.createdAt)]).sort());

    const utenti = await tutte(db, 'utenti', 'email');
    assert.deepEqual(utenti.map((r) => [r.id, r.email, r.ruolo, r.pr_id, istante(r.created_at)]).sort(),
      d.utenti.map((u) => [u.id, u.email, u.ruolo, u.prId, istante(u.createdAt)]).sort());

    const porte = await tutte(db, 'porte', 'nome');
    assert.deepEqual(porte.map((r) => [r.evento_id, r.nome, istante(r.ultimo_sync)]),
      d.porte.map((p) => [p.eventoId, p.nome, istante(p.ultimoSync)]).sort((a, b) => String(a[1]).localeCompare(String(b[1]))));

    // Il registro email di prova non si copia.
    assert.equal((await tutte(db, 'posta_inviata', 'id')).length, 0);
  });
});

test('la verifica passa dopo la copia e non fa mai vedere il segreto', async () => {
  await conRiga(archivioDiProva(), async (db) => {
    const copiato = await importa(db);
    const v = await verifica(db);
    assert.equal(v.ok, true, JSON.stringify(v.differenze));
    assert.deepEqual(v.differenze, []);
    assert.equal(v.segreto_ok, true);
    assert.equal(v.versione_ok, true);
    for (const g of ['eventi', 'lotti', 'pr', 'utenti', 'porte']) assert.equal(v.conteggi[g].riga, v.conteggi[g].tabella, g);
    // Né la copia né la verifica dicono il segreto, nemmeno per sbaglio.
    assert.ok(!JSON.stringify([copiato, v]).includes(SEGRETO));
    // La tabella lo ha identico: se ne confronta l'impronta, non il valore.
    const { rows: [s] } = await db.query<{ h: string }>("select md5(valore) as h from public.impostazioni where chiave = 'segreto'");
    assert.equal(s.h, md5(SEGRETO));
  });
});

test('la verifica si accorge di una riga cambiata, di una serata mancante e di un segreto diverso', async () => {
  await conRiga(archivioDiProva(), async (db) => {
    await importa(db);
    // Qualcuno ha scritto sulla riga dopo la copia.
    await db.query('update public.archivio_mvp set versione = versione + 1 where id = 1');
    let v = await verifica(db);
    assert.equal(v.ok, false);
    assert.equal(v.versione_ok, false);
    await importa(db); // si rifà la copia
    assert.equal((await verifica(db)).ok, true);

    await db.query('delete from public.lotti where true');
    v = await verifica(db);
    assert.equal(v.ok, false);
    assert.ok(v.differenze.some((x) => x.startsWith('lotti')), v.differenze.join(' | '));
    await importa(db);

    await db.query("update public.impostazioni set valore = 'altro' where chiave = 'segreto'");
    v = await verifica(db);
    assert.equal(v.segreto_ok, false);
    assert.equal(v.ok, false);
  });
});

test('la copia si può rilanciare: rifà tutto da capo, senza doppioni', async () => {
  const d = archivioDiProva();
  await conRiga(d, async (db) => {
    const prima = await importa(db);
    const seconda = await importa(db);
    assert.deepEqual(seconda, prima);
    assert.equal((await tutte(db, 'eventi', 'id')).length, d.eventi.length);

    // Nella riga cambia una serata e sparisce un tipo: la nuova copia lo riflette.
    const nuovo = structuredClone(d);
    nuovo.eventi[0].nome = 'Nome cambiato';
    nuovo.lotti.pop();
    await scriviRiga(db, nuovo, 274);
    const terza = await importa(db);
    assert.equal(terza.lotti, d.lotti.length - 1);
    assert.equal(terza.versione, 274);
    const { rows: [e] } = await db.query<{ nome: string }>('select nome from public.eventi where id = $1', [nuovo.eventi[0].id]);
    assert.equal(e.nome, 'Nome cambiato');
    assert.equal((await verifica(db)).ok, true);
  });
});

test('una copia che fallisce non lascia le tabelle a metà', async () => {
  const d = archivioDiProva();
  await conRiga(d, async (db) => {
    await importa(db);
    const rotta = structuredClone(d);
    rotta.eventi[1].slug = rotta.eventi[0].slug; // slug doppio: il database lo rifiuta
    await scriviRiga(db, rotta, 275);
    await assert.rejects(importa(db));
    // Tutto com'era prima della copia fallita (transazione unica).
    assert.equal((await tutte(db, 'eventi', 'id')).length, d.eventi.length);
    assert.equal((await tutte(db, 'lotti', 'id')).length, d.lotti.length);
    const { rows: [s] } = await db.query<{ valore: string }>("select valore from public.impostazioni where chiave = 'importato_da_versione'");
    assert.equal(s.valore, '273', 'la versione registrata è ancora quella della copia riuscita');
  }, 273);
});

test('dopo il passaggio alle tabelle la copia non gira più', async () => {
  await conRiga(archivioDiProva(), async (db) => {
    await importa(db);
    await db.query("update public.impostazioni set valore = 'tabelle' where chiave = 'archivio'");
    await assert.rejects(importa(db), /archivio_gia_passato_alle_tabelle/);
    assert.equal((await tutte(db, 'eventi', 'id')).length, archivioDiProva().eventi.length);
  });
});

test('senza riga o senza segreto non copia niente', async () => {
  const db = await creaDb(MIGRAZIONI_ANAGRAFICHE);
  try {
    await assert.rejects(importa(db), /archivio_mvp_vuoto/);
    await scriviRiga(db, { ...archivioDiProva(), segreto: '' });
    await assert.rejects(importa(db), /segreto_mancante/);
  } finally {
    await db.close();
  }
});

test('le serate salvate prima, senza i campi nuovi, si copiano con i valori di partenza', async () => {
  const d = archivioDiProva();
  // Come prima che esistessero senza telefono, copertina, capienza, orario limite, piantina; tipi senza categoria né PR abilitati.
  for (const e of d.eventi as unknown as Record<string, unknown>[]) {
    for (const k of ['senzaTelefono', 'inCopertina', 'capienza', 'prevenditaFinoAlle', 'piantinaUrl', 'invioLinkPr', 'prAbilitati', 'locationSegreta', 'highlight', 'lineup']) delete e[k];
  }
  for (const l of d.lotti as unknown as Record<string, unknown>[]) {
    for (const k of ['categoria', 'confermaCategoria', 'uscitaGiorniPrima', 'fineOrePrima', 'dopoPrecedente', 'prAbilitati', 'automatico']) delete l[k];
  }
  await conRiga(d, async (db) => {
    await importa(db);
    const { rows } = await db.query<Record<string, unknown>>('select * from public.eventi');
    for (const r of rows) {
      assert.equal(r.senza_telefono, false);
      assert.equal(r.in_copertina, false);
      assert.equal(r.capienza, null);
      assert.equal(r.prevendita_fino_alle, null);
      assert.deepEqual(r.lineup, []);
      assert.equal(r.location_segreta, false);
    }
    const { rows: tipi } = await db.query<Record<string, unknown>>('select * from public.lotti');
    for (const t of tipi) {
      assert.equal(t.conferma_categoria, false);
      assert.equal(t.dopo_precedente, false);
      assert.equal(t.automatico, false);
      assert.equal(t.categoria, null);
      assert.equal(t.pr_abilitati, null);
    }
    assert.equal((await verifica(db)).ok, true);
  });
});

test('i vincoli del database tengono', async () => {
  const d = archivioDiProva();
  await conRiga(d, async (db) => {
    await importa(db);
    const [a, b] = d.eventi;
    const fallisce = async (sql: string, parametri: unknown[] = [], codice?: string) => {
      await assert.rejects(db.query(sql, parametri), (e: { code?: string }) => !codice || e.code === codice, sql);
    };
    // Una sola serata in copertina.
    await fallisce('update public.eventi set in_copertina = true where id = $1', [b.id], '23505');
    // Slug con maiuscole, capienza zero, età fuori misura.
    await fallisce("update public.eventi set slug = 'Maiuscole' where id = $1", [a.id], '23514');
    await fallisce('update public.eventi set capienza = 0 where id = $1', [a.id], '23514');
    await fallisce('update public.eventi set eta_minima = 120 where id = $1', [a.id], '23514');
    // Tipi: conferma senza categoria, uscita sia relativa sia a data fissa, quantità negativa.
    await fallisce('update public.lotti set categoria = null, conferma_categoria = true where id = $1', [d.lotti[0].id], '23514');
    await fallisce("update public.lotti set uscita_giorni_prima = 2, data_inizio = now() where id = $1", [d.lotti[0].id], '23514');
    await fallisce('update public.lotti set quantita = -1 where id = $1', [d.lotti[0].id], '23514');
    // Un tipo non vive senza la sua serata; una serata cancellata porta via i suoi tipi e le sue porte.
    await fallisce('insert into public.lotti (id, evento_id, nome) values (gen_random_uuid(), gen_random_uuid(), $1)', ['x'], '23503');
    // Utenti: ruolo "pr" senza PR, email doppia (anche con maiuscole), PR che non esiste; un PR con un accesso non si cancella.
    await fallisce("insert into public.utenti (id, email, ruolo) values (gen_random_uuid(), 'nuovo@esempio.test', 'pr')", [], '23514');
    await fallisce("insert into public.utenti (id, email, ruolo) values (gen_random_uuid(), upper($1), 'staff')", [d.utenti[0].email], '23505');
    await fallisce('delete from public.pr where id = $1', [d.pr[0].id], '23001');
    // PR: handle non valido.
    await fallisce("update public.pr set handle = 'Con Spazi' where id = $1", [d.pr[0].id], '23514');
    await db.query('delete from public.eventi where id = $1', [a.id]);
    const { rows: [r] } = await db.query<{ n: string }>('select count(*)::text as n from public.lotti where evento_id = $1', [a.id]);
    assert.equal(r.n, '0');
  });
});
