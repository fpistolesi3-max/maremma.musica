// Foto delle serate su un archivio temporaneo (non tocca .data/): permessi, in evidenza, nascoste, eliminazione.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cartella = mkdtempSync(path.join(tmpdir(), 'mm-foto-'));
process.env.MM_CARTELLA_DATI = cartella;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

type Mod = { archivio: typeof import('./archivio'); foto: typeof import('./foto') };
let m: Mod;
type S = Parameters<Mod['foto']['preparaFoto']>[0];
let admin: S, staff: S, pr: S;
let passata: string, futura: string;

before(async () => {
  m = { archivio: await import('./archivio'), foto: await import('./foto') };
  const d = await m.archivio.leggi();
  const sessione = (email: string) => {
    const utente = d.utenti.find((u) => u.email === email)!;
    return { utente, pr: utente.prId ? d.pr.find((p) => p.id === utente.prId)! : null } as S;
  };
  admin = sessione('admin@maremmamusica.test'); staff = sessione('porta@maremmamusica.test'); pr = sessione('test-pr@maremmamusica.test');
  passata = d.eventi.find((e) => e.slug === 'ricky-le-roy-monteverdi')!.id;
  futura = d.eventi.find((e) => e.slug === 'solchi')!.id;
});
after(() => rmSync(cartella, { recursive: true, force: true }));

/** Carica una foto finta come fa il browser: prepara, manda i due file, conferma. */
async function caricaFoto(eventoId: string, s = admin) {
  const p = await m.foto.preparaFoto(s, eventoId);
  await m.foto.scriviFotoLocale(s, eventoId, `${p.id}.jpg`, Buffer.alloc(5000, 1));
  await m.foto.scriviFotoLocale(s, eventoId, `${p.id}-m.jpg`, Buffer.alloc(800, 1));
  await m.foto.confermaFoto(s, p.id, 2000, 1333);
  return p.id;
}
const idsAdmin = async (eventoId: string) => (await m.foto.fotoAdmin(admin, eventoId)).foto.map((f) => f.id);
const idsPubblici = async () => (await m.foto.serateConFoto()).flatMap((s) => s.foto.map((f) => f.id));

test('solo l’admin carica, cambia ed elimina: staff e PR no', async () => {
  const id = await caricaFoto(passata);
  for (const s of [staff, pr]) {
    await assert.rejects(m.foto.preparaFoto(s, passata), /non_autorizzato/);
    await assert.rejects(m.foto.confermaFoto(s, id, 10, 10), /non_autorizzato/);
    await assert.rejects(m.foto.scriviFotoLocale(s, passata, `${id}.jpg`, Buffer.alloc(10)), /non_autorizzato/);
    await assert.rejects(m.foto.annullaFoto(s, id), /non_autorizzato/);
    await assert.rejects(m.foto.impostaFoto(s, id, { nascosta: true }), /non_autorizzato/);
    await assert.rejects(m.foto.spostaFotoAdmin(s, id, 'dopo'), /non_autorizzato/);
    await assert.rejects(m.foto.eliminaFoto(s, id), /non_autorizzato/);
    await assert.rejects(m.foto.eliminaFotoSerata(s, passata), /non_autorizzato/);
    await assert.rejects(m.foto.salvaCreditoFoto(s, passata, 'Io'), /non_autorizzato/);
    await assert.rejects(m.foto.fotoAdmin(s, passata), /non_autorizzato/);
    await assert.rejects(m.foto.riepilogoFoto(s, passata), /non_autorizzato/);
  }
  assert.ok((await idsAdmin(passata)).includes(id), 'le prove di staff e PR non hanno cambiato niente');
  await m.foto.eliminaFotoSerata(admin, passata);
});

test('conferma: file mancanti o troppo pesanti non diventano foto; i file a metà si ripuliscono', async () => {
  const mancante = await m.foto.preparaFoto(admin, passata);
  await assert.rejects(m.foto.confermaFoto(admin, mancante.id, 100, 100), /non è stata caricata/);
  const grossa = await m.foto.preparaFoto(admin, passata);
  await m.foto.scriviFotoLocale(admin, passata, `${grossa.id}.jpg`, Buffer.alloc(100));
  await assert.rejects(m.foto.scriviFotoLocale(admin, passata, `${grossa.id}-m.jpg`, Buffer.alloc(1_600_000)), /troppo pesante/);
  await assert.rejects(m.foto.scriviFotoLocale(admin, passata, '../../x.jpg', Buffer.alloc(10)), /Nome del file/);
  await assert.rejects(m.foto.scriviFotoLocale(admin, futura, `${grossa.id}.jpg`, Buffer.alloc(10)), /non in caricamento/, 'la foto è di un’altra serata');
  assert.deepEqual(await idsAdmin(passata), [], 'nessuna foto pronta');
  // Un caricamento rimasto a metà per più di un’ora sparisce alla prossima apertura della pagina Foto.
  const fra2ore = Date.now() + 2 * 3_600_000;
  await m.foto.fotoAdmin(admin, passata, fra2ore);
  assert.equal(existsSync(path.join(cartella, 'media', 'foto', passata, `${grossa.id}.jpg`)), false);
});

test('in evidenza: al massimo 4, una nascosta non può esserlo, nascondere la toglie', async () => {
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) ids.push(await caricaFoto(passata));
  for (const id of ids.slice(0, 4)) await m.foto.impostaFoto(admin, id, { inEvidenza: true });
  await assert.rejects(m.foto.impostaFoto(admin, ids[4], { inEvidenza: true }), /al massimo 4/);
  await m.foto.impostaFoto(admin, ids[0], { nascosta: true });
  const f0 = (await m.foto.fotoAdmin(admin, passata)).foto.find((f) => f.id === ids[0])!;
  assert.equal(f0.inEvidenza, false, 'nascondere toglie dall’evidenza');
  await assert.rejects(m.foto.impostaFoto(admin, ids[0], { inEvidenza: true }), /nascosta/);
  await m.foto.impostaFoto(admin, ids[4], { inEvidenza: true });
  const s = (await m.foto.serateConFoto()).find((x) => x.evento.id === passata)!;
  assert.deepEqual(s.evidenza.map((f) => f.id), [ids[1], ids[2], ids[3], ids[4]]);
  await m.foto.eliminaFotoSerata(admin, passata);
});

test('ordine: sposta prima e dopo', async () => {
  const [a, b, c] = [await caricaFoto(passata), await caricaFoto(passata), await caricaFoto(passata)];
  await m.foto.spostaFotoAdmin(admin, c, 'prima');
  assert.deepEqual(await idsAdmin(passata), [a, c, b]);
  await m.foto.spostaFotoAdmin(admin, a, 'dopo');
  assert.deepEqual(await idsAdmin(passata), [c, a, b]);
  await m.foto.eliminaFotoSerata(admin, passata);
});

test('pubblico: niente foto nascoste, di serate non pubblicate o non ancora finite', async () => {
  const [a, b] = [await caricaFoto(passata), await caricaFoto(passata)];
  const prossima = await caricaFoto(futura);
  await m.foto.impostaFoto(admin, b, { nascosta: true });
  assert.deepEqual(await idsPubblici(), [a], 'la nascosta e quella della serata futura non si vedono');
  assert.ok((await idsAdmin(futura)).includes(prossima), 'l’admin le vede');
  assert.equal(await m.foto.fotoSerataPubblica(futura), null);
  await m.archivio.modifica((d) => { d.eventi.find((e) => e.id === passata)!.pubblicato = false; });
  assert.deepEqual(await idsPubblici(), [], 'serata non pubblicata: nessuna foto');
  assert.equal(await m.foto.fotoSerataPubblica(passata), null);
  await m.archivio.modifica((d) => { d.eventi.find((e) => e.id === passata)!.pubblicato = true; });
  await m.foto.salvaCreditoFoto(admin, passata, '  Mario   Rossi ');
  const pub = await m.foto.fotoSerataPubblica(passata);
  assert.equal(pub?.credito, 'Mario Rossi');
  assert.equal(pub?.foto.length, 1);
  assert.ok(pub?.foto[0].urlMini.startsWith('/media/foto/'));
  await m.foto.eliminaFotoSerata(admin, futura);
  await m.foto.eliminaFotoSerata(admin, passata);
});

test('eliminare una foto o le foto di una serata toglie dati e file', async () => {
  const [a, b] = [await caricaFoto(passata), await caricaFoto(passata)];
  const file = (id: string, mini = false) => path.join(cartella, 'media', 'foto', passata, `${id}${mini ? '-m' : ''}.jpg`);
  assert.ok(existsSync(file(a)) && existsSync(file(a, true)));
  await m.foto.eliminaFoto(admin, a);
  assert.equal(existsSync(file(a)) || existsSync(file(a, true)), false);
  assert.deepEqual(await idsAdmin(passata), [b]);
  await m.foto.salvaCreditoFoto(admin, passata, 'Mario');
  assert.equal(await m.foto.eliminaFotoSerata(admin, passata), 1);
  assert.equal(existsSync(file(b)) || existsSync(file(b, true)), false, 'i file della serata non ci sono più');
  const dopo = await m.foto.fotoAdmin(admin, passata);
  assert.deepEqual(dopo.foto, []);
  assert.equal(dopo.credito, '', 'anche il credito');
  assert.deepEqual(await idsPubblici(), []);
});
