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
  } finally {
    delete process.env.SMTP_HOST; delete process.env.SMTP_PORT; s.chiudi();
  }
});
