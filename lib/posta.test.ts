// inviaEmail dice com'è andata: 'archivio' senza SMTP_HOST, 'smtp' con un server (qui uno finto in locale).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const cartella = mkdtempSync(path.join(tmpdir(), 'mm-posta-'));
process.env.MM_CARTELLA_DATI = cartella;
delete process.env.SMTP_HOST;

let posta: typeof import('./posta');
let archivio: typeof import('./dati/archivio');
before(async () => { posta = await import('./posta'); archivio = await import('./dati/archivio'); });
after(() => rmSync(cartella, { recursive: true, force: true }));

const msg = { a: 'mario@esempio.it', oggetto: 'Prova', html: '<p>Ciao</p>' };

/** Server SMTP minimo: accetta una email e risponde "ok". */
function serverFinto(): Promise<{ porta: number; chiudi: () => void; ricevute: string[] }> {
  const ricevute: string[] = [];
  const server = net.createServer((s) => {
    let inDati = false; let buf = '';
    s.write('220 finto ESMTP\r\n');
    s.on('data', (c) => {
      buf += c.toString();
      if (inDati) {
        if (!buf.endsWith('\r\n.\r\n')) return;
        ricevute.push(buf); buf = ''; inDati = false; s.write('250 ok\r\n'); return;
      }
      for (const riga of buf.split('\r\n').filter(Boolean)) {
        const r = riga.toUpperCase();
        if (r.startsWith('EHLO') || r.startsWith('HELO')) s.write('250 finto\r\n');
        else if (r.startsWith('DATA')) { s.write('354 avanti\r\n'); inDati = true; }
        else if (r.startsWith('QUIT')) { s.write('221 ciao\r\n'); s.end(); }
        else s.write('250 ok\r\n');
      }
      buf = '';
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ porta: (server.address() as net.AddressInfo).port, chiudi: () => server.close(), ricevute })));
}

test('inviaEmail senza SMTP_HOST: resta nell’archivio e lo dice', async () => {
  assert.equal(posta.emailVereAttive(), false);
  assert.equal(await posta.inviaEmail(msg), 'archivio');
  const ultima = (await archivio.leggi()).posta[0];
  assert.equal(ultima.a, msg.a);
  assert.equal(ultima.via, 'archivio');
});

test('inviaEmail con SMTP_HOST: parte davvero e lo dice', async () => {
  const s = await serverFinto();
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(s.porta);
  try {
    assert.equal(posta.emailVereAttive(), true);
    assert.equal(await posta.inviaEmail(msg), 'smtp');
    assert.equal((await archivio.leggi()).posta[0].via, 'smtp');
    assert.equal(s.ricevute.length, 1, 'il server ha ricevuto l’email');
    // Mittente automatico (noreply@) e risposte all'unico indirizzo mostrato nel sito.
    assert.match(s.ricevute[0], /^From: .*noreply@maremmamusica\.it/mi);
    assert.match(s.ricevute[0], /^Reply-To: info@maremmamusica\.it/mi);
  } finally {
    delete process.env.SMTP_HOST; delete process.env.SMTP_PORT; s.chiudi();
  }
});

test('il guscio delle email chiude con l’indirizzo dei contatti, non con una casella personale', () => {
  const html = posta.guscioEmail('Titolo', '<p>Corpo</p>');
  assert.match(html, /info@maremmamusica\.it · @maremma\.musica/);
  assert.doesNotMatch(html, /gmail/i);
});

test('sul sito vero con le email che partono davvero il testo NON resta nel database; in prova e senza SMTP sì', async () => {
  const env = process.env as Record<string, string | undefined>;
  const prima = { NODE_ENV: env.NODE_ENV, prova: env.MM_MODALITA_PROVA };
  const registro = async () => (await archivio.leggi()).posta.length;
  const s = await serverFinto();
  try {
    env.NODE_ENV = 'production'; delete env.MM_MODALITA_PROVA;
    // Sito vero + SMTP: parte, ma non si salva (nome, email e link dei clienti non restano nel database).
    env.SMTP_HOST = '127.0.0.1'; env.SMTP_PORT = String(s.porta);
    let n = await registro();
    assert.equal(await posta.inviaEmail({ ...msg, oggetto: 'Sito vero' }), 'smtp');
    assert.equal(await registro(), n, 'niente nel registro');
    assert.equal(s.ricevute.length, 1, 'ma l’email è partita');
    // Istanza di prova online (MM_MODALITA_PROVA=1) + SMTP: si salva, per /dev/posta.
    env.MM_MODALITA_PROVA = '1';
    n = await registro();
    assert.equal(await posta.inviaEmail({ ...msg, oggetto: 'Istanza di prova' }), 'smtp');
    assert.equal(await registro(), n + 1);
    // Sito vero senza SMTP (email non ancora attive): resta nell'archivio, per non perdere i messaggi.
    delete env.MM_MODALITA_PROVA; delete env.SMTP_HOST; delete env.SMTP_PORT;
    n = await registro();
    assert.equal(await posta.inviaEmail({ ...msg, oggetto: 'Senza SMTP' }), 'archivio');
    assert.equal(await registro(), n + 1);
  } finally {
    if (prima.NODE_ENV === undefined) delete env.NODE_ENV; else env.NODE_ENV = prima.NODE_ENV;
    if (prima.prova === undefined) delete env.MM_MODALITA_PROVA; else env.MM_MODALITA_PROVA = prima.prova;
    delete env.SMTP_HOST; delete env.SMTP_PORT; s.chiudi();
  }
});

test('il piede delle email dice chi scrive e rinvia a termini e privacy; la nota sul recesso rinvia ai termini', () => {
  const html = posta.guscioEmail('Titolo', '<p>Corpo</p>');
  assert.match(html, / · P\.IVA \d{11}/);
  assert.match(html, /href="[^"]*\/condizioni"[^>]*>Termini e condizioni<\/a> · <a href="[^"]*\/privacy"/);
  const nota = posta.notaCondizioniEmail();
  assert.match(nota, /non c'è diritto di recesso/);
  assert.match(nota, /\/condizioni/);
});
