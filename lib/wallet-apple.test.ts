import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import type { Evento } from './dati/tipi';
import type { Biglietto } from './dati/pubblico';
import { creaCodice, creaTokenQr } from './qr-token';
import { campiPass } from './wallet';
import { creaPkpass, type ChiaviApple } from './wallet-apple';

// node-forge arriva con passkit-generator e non ha i tipi: serve solo a fabbricare certificati di prova (mai quelli veri).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const forge: any = createRequire(import.meta.url)('node-forge');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function certificato(nome: string, chiave: any, firmatario?: { cert: any; chiave: any }) {
  const c = forge.pki.createCertificate();
  c.publicKey = chiave.publicKey;
  c.serialNumber = firmatario ? '02' : '01'; // numeri diversi: chi legge la firma trova il certificato giusto
  c.validity.notBefore = new Date(Date.now() - 86_400_000);
  c.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [{ name: 'commonName', value: nome }];
  c.setSubject(attrs);
  c.setIssuer(firmatario ? firmatario.cert.subject.attributes : attrs);
  c.sign(firmatario ? firmatario.chiave.privateKey : chiave.privateKey, forge.md.sha256.create());
  return c;
}

function chiaviDiProva(): ChiaviApple {
  const ca = forge.pki.rsa.generateKeyPair(2048);
  const caCert = certificato('WWDR di prova', ca);
  const k = forge.pki.rsa.generateKeyPair(2048);
  const cert = certificato('Pass Type ID di prova', k, { cert: caCert, chiave: ca });
  return {
    passTypeId: 'pass.it.esempio.prova',
    teamId: 'ABCDE12345',
    certificato: Buffer.from(forge.pki.certificateToPem(cert)),
    chiave: Buffer.from(forge.pki.encryptRsaPrivateKey(k.privateKey, 'password-di-prova')),
    password: 'password-di-prova',
    wwdr: Buffer.from(forge.pki.certificateToPem(caCert)),
  };
}

/** Legge i file di un archivio zip dalla directory centrale. */
function leggiZip(zip: Buffer): Record<string, Buffer> {
  let fine = zip.length - 22;
  while (fine >= 0 && zip.readUInt32LE(fine) !== 0x06054b50) fine--;
  assert.ok(fine >= 0, 'è un archivio zip');
  const n = zip.readUInt16LE(fine + 10);
  let p = zip.readUInt32LE(fine + 16);
  const out: Record<string, Buffer> = {};
  for (let k = 0; k < n; k++) {
    assert.equal(zip.readUInt32LE(p), 0x02014b50);
    const metodo = zip.readUInt16LE(p + 10), comp = zip.readUInt32LE(p + 20);
    const lnome = zip.readUInt16LE(p + 28), lextra = zip.readUInt16LE(p + 30), lcomm = zip.readUInt16LE(p + 32), locale = zip.readUInt32LE(p + 42);
    const nome = zip.subarray(p + 46, p + 46 + lnome).toString();
    const dati = locale + 30 + zip.readUInt16LE(locale + 26) + zip.readUInt16LE(locale + 28);
    const grezzo = zip.subarray(dati, dati + comp);
    out[nome] = metodo === 8 ? inflateRawSync(grezzo) : grezzo;
    p += 46 + lnome + lextra + lcomm;
  }
  return out;
}

const PRIMA = new Date('2026-10-20T12:00:00Z');
const ID = '3f0c6f0e-5b7a-4d0a-9b38-0c8a1f3a9d11';
const biglietto = (e: Partial<Evento> = {}): Biglietto => ({
  evento: {
    id: 'e1', numero: 25, slug: 'halloween-party', nome: 'Halloween Party', data: '2026-10-31T22:00:00+01:00', dataFine: '2026-11-01T04:00:00+01:00',
    location: 'Villa Aurora', comune: 'Grosseto', lat: 42.76, lng: 11.11, locationSegreta: false, tipoIngresso: 'lista', descrizione: null, highlight: null, senzaTelefono: false,
    dressCode: null, lineup: [], infoArrivo: null, locandinaUrl: null, piantinaUrl: null, prezzoLista: 10, etaMinima: 18, pubblicato: true, prAbilitati: null,
    createdAt: '', updatedAt: '', ...e,
  },
  lista: 'Maremma Musica', prHandle: null,
  iscrizione: {
    id: ID, eventoId: 'e1', lottoId: 'l1', categoria: 'Early bird', prId: null, nome: 'Giulia', cognome: 'Rossi', dataNascita: '2000-05-14', email: 'giulia@example.com',
    tokenQr: creaTokenQr('segreto', ID, 'e1'), codice: creaCodice('segreto', ID), stato: 'pagato', metodoPagamento: 'online', importo: 10, pagatoAt: null, scade: null,
    pagamentoOnline: null, oraCheckIn: null, porta: null, consensoPrivacyAt: '', consensoMarketing: false, annullatoAt: null, createdAt: '', canale: 'diretto',
    consegnaId: null, origine: 'lista',
  },
});

test('.pkpass con certificato di prova: zip valido con pass.json, manifest.json, signature e immagini', async () => {
  const b = biglietto();
  const file = leggiZip(await creaPkpass(campiPass(b, PRIMA), chiaviDiProva()));
  for (const nome of ['pass.json', 'manifest.json', 'signature', 'icon.png', 'icon@2x.png', 'logo.png', 'logo@2x.png']) assert.ok(nome in file, `manca ${nome}`);
  const pass = JSON.parse(file['pass.json'].toString());
  assert.equal(pass.passTypeIdentifier, 'pass.it.esempio.prova');
  assert.equal(pass.teamIdentifier, 'ABCDE12345');
  assert.equal(pass.serialNumber, ID);
  assert.ok(pass.eventTicket, 'tipo eventTicket');
  assert.equal(pass.backgroundColor, 'rgb(12, 15, 20)');
  assert.equal(pass.foregroundColor, 'rgb(225, 215, 201)');
  // QR: stesso identico token della pagina, codice di 8 caratteri come testo alternativo.
  assert.equal(pass.barcodes[0].format, 'PKBarcodeFormatQR');
  assert.equal(pass.barcodes[0].message, b.iscrizione.tokenQr);
  assert.equal(pass.barcodes[0].altText, `${b.iscrizione.codice.slice(0, 4)}-${b.iscrizione.codice.slice(4)}`);
  // Scade all'orario limite (l'1 di notte dopo l'apertura).
  assert.equal(new Date(pass.expirationDate).toISOString(), new Date('2026-11-01T01:00:00+01:00').toISOString());
  assert.equal(new Date(pass.relevantDate).toISOString(), new Date('2026-10-31T22:00:00+01:00').toISOString());
  // Il manifest elenca gli hash degli altri file, la firma c'è.
  const manifest = JSON.parse(file['manifest.json'].toString());
  assert.ok('pass.json' in manifest && 'icon.png' in manifest);
  assert.ok(file.signature.length > 500);
  assert.ok(JSON.stringify(pass).includes('Villa Aurora'), 'luogo pubblico: compare');
});

test("location segreta: nel .pkpass il luogo non c'è da nessuna parte", async () => {
  const file = leggiZip(await creaPkpass(campiPass(biglietto({ locationSegreta: true }), PRIMA), chiaviDiProva()));
  const pass = file['pass.json'].toString();
  assert.ok(!pass.includes('Villa Aurora') && !pass.includes('Grosseto') && !pass.includes('42.76'));
  assert.ok(!('locations' in JSON.parse(pass)));
  assert.ok(pass.includes('Location segreta'));
});
