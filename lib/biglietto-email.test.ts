// L'email del biglietto è una copia della pagina "Il tuo QR": stesse regole su data di nascita, lista e importo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cartella = mkdtempSync(path.join(tmpdir(), 'mm-biglietto-email-'));
process.env.MM_CARTELLA_DATI = cartella;
delete process.env.SMTP_HOST;

let archivio: typeof import('./dati/archivio');
let pubblico: typeof import('./dati/pubblico');
let bigliettoEmail: typeof import('./biglietto-email');
before(async () => { archivio = await import('./dati/archivio'); pubblico = await import('./dati/pubblico'); bigliettoEmail = await import('./biglietto-email'); });
after(() => rmSync(cartella, { recursive: true, force: true }));

async function emailDi(o: { daPr: boolean; importo: number; senzaTelefono?: boolean }) {
  const d = await archivio.leggi();
  const base = d.iscrizioni.find((x) => x.prId && x.importo > 0)!;
  const i = { ...base, importo: o.importo, prId: o.daPr ? base.prId : null, dataNascita: '1999-03-08', nome: 'Marco', cognome: 'Rossi' };
  const b = pubblico.bigliettoDi(d, i)!;
  const biglietto = { ...b, evento: { ...b.evento, senzaTelefono: o.senzaTelefono ?? false } };
  await bigliettoEmail.inviaBiglietto(biglietto, 'https://sito.it');
  return (await archivio.leggi()).posta[0].html;
}

test('email del biglietto: niente data di nascita, importo una volta sola', async () => {
  const html = await emailDi({ daPr: true, importo: 12 });
  assert.ok(!html.includes('Nato/a'), 'niente "Nato/a il"');
  assert.ok(!html.includes('08.03.1999') && !html.includes('1999'), 'niente data di nascita');
  assert.equal(html.split('12 €').length - 1, 1, 'importo una volta sola');
  assert.ok(html.includes('Pagato · 12 €') && html.includes('Ci sei.'));
  assert.ok(html.includes('Marco Rossi'));
});

test('email del biglietto: "Lista" solo se l’iscrizione arriva da un PR', async () => {
  assert.ok((await emailDi({ daPr: true, importo: 12 })).includes('>Lista<'));
  const senzaPr = await emailDi({ daPr: false, importo: 12 });
  assert.ok(!senzaPr.includes('>Lista<'), 'chi compra da solo non ha "Lista"');
});

test('email del biglietto: gratuita e serata senza telefono', async () => {
  const gratis = await emailDi({ daPr: false, importo: 0 });
  assert.ok(gratis.includes('Sei in lista.') && gratis.includes('Ingresso libero'));
  const senzaTel = await emailDi({ daPr: false, importo: 12, senzaTelefono: true });
  assert.ok(!senzaTel.includes('data di nascita') && !senzaTel.includes('cid:qr'));
});
