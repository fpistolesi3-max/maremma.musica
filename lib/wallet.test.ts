import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import type { Evento, Iscrizione } from './dati/tipi';
import type { Biglietto } from './dati/pubblico';
import { creaCodice, creaTokenQr, mostraCodice } from './qr-token';
import { limiteIngresso } from './regole';
import { APPLE_VARIABILI, GOOGLE_VARIABILI, appleConfigurato, campiPass, esitoPass, googleConfigurato, walletConfigurato } from './wallet';
import { chiaviGoogleDaEnv, classeEOggetto, linkSalvaGoogle } from './wallet-google';

const evento = (p: Partial<Evento> = {}): Evento => ({
  id: 'e1', numero: 25, slug: 'halloween-party', nome: 'Halloween Party', data: '2026-10-31T22:00:00+01:00', dataFine: '2026-11-01T04:00:00+01:00',
  location: 'Villa Aurora', comune: 'Grosseto', lat: 42.76, lng: 11.11, locationSegreta: false, tipoIngresso: 'lista', descrizione: null, highlight: null, senzaTelefono: false,
  dressCode: null, lineup: [], infoArrivo: null, locandinaUrl: null, piantinaUrl: null, prezzoLista: 10, etaMinima: 18, pubblicato: true, prAbilitati: null,
  createdAt: '', updatedAt: '', ...p,
});
const ID = '3f0c6f0e-5b7a-4d0a-9b38-0c8a1f3a9d11';
const iscrizione = (p: Partial<Iscrizione> = {}): Iscrizione => ({
  id: ID, eventoId: 'e1', lottoId: 'l1', categoria: 'Early bird', prId: null, nome: 'Giulia', cognome: 'Rossi', dataNascita: '2000-05-14', email: 'giulia@example.com',
  tokenQr: creaTokenQr('segreto', ID, 'e1'), codice: creaCodice('segreto', ID), stato: 'pagato', metodoPagamento: 'online', importo: 10, pagatoAt: null, scade: null,
  pagamentoOnline: null, oraCheckIn: null, porta: null, consensoPrivacyAt: '', consensoMarketing: false, annullatoAt: null, createdAt: '', canale: 'diretto',
  consegnaId: null, origine: 'lista', ...p,
});
const biglietto = (i: Partial<Iscrizione> = {}, e: Partial<Evento> = {}): Biglietto => ({ iscrizione: iscrizione(i), evento: evento(e), lista: 'Maremma Musica', prHandle: null });
const PRIMA = new Date('2026-10-20T12:00:00Z');

test('pass: stesso token del QR della pagina e dati della serata', () => {
  const b = biglietto();
  const c = campiPass(b, PRIMA);
  assert.equal(c.qr, b.iscrizione.tokenQr, 'il QR è lo stesso identico token');
  assert.equal(c.codice, mostraCodice(b.iscrizione.codice));
  assert.equal(c.titolo, 'Halloween Party');
  assert.equal(c.titolare, 'Giulia Rossi');
  assert.equal(c.tipo, 'Early bird');
  assert.equal(c.lista, 'Maremma Musica');
  assert.equal(c.orari, '22:00 → 04:00');
  assert.equal(c.luogo, 'Grosseto · Villa Aurora');
  assert.deepEqual(c.coordinate, { lat: 42.76, lng: 11.11 });
  assert.equal(c.numero, 'MM/025');
  assert.equal(c.testoLuogo, 'Grosseto · Villa Aurora');
  assert.equal(campiPass(biglietto({}, { location: null, comune: null }), PRIMA).testoLuogo, 'Location in arrivo', 'luogo non ancora scelto');
});

test("pass: valida fino all'orario limite (di default l'1 di notte), per l'ingresso libero fino a fine serata", () => {
  const b = biglietto();
  const c = campiPass(b);
  assert.equal(c.validaFinoAlle, '01:00');
  assert.equal(c.scadenza, new Date(limiteIngresso(b.evento)!).toISOString());
  assert.equal(campiPass(biglietto({}, { prevenditaFinoAlle: '2026-10-31T23:30:00+01:00' }), PRIMA).validaFinoAlle, '23:30');
  const libero = campiPass(biglietto({}, { tipoIngresso: 'libero' }), PRIMA);
  assert.equal(libero.validaFinoAlle, null);
  assert.equal(libero.scadenza, new Date('2026-11-01T04:00:00+01:00').toISOString());
});

test('pass: la location segreta non compare (né nome né coordinate) finché non è pubblica', () => {
  const segreta = biglietto({}, { locationSegreta: true });
  const c = campiPass(segreta, PRIMA);
  assert.equal(c.luogo, null);
  assert.equal(c.testoLuogo, 'Location segreta: la scopri 48 ore prima della serata');
  assert.equal(c.coordinate, null);
  assert.ok(!JSON.stringify(c).includes('Villa Aurora') && !JSON.stringify(c).includes('Grosseto'));
  const { classe, oggetto } = classeEOggetto(c, { issuerId: '3388000000000000000', sito: 'https://esempio.it' });
  assert.ok(!JSON.stringify({ classe, oggetto }).includes('Villa Aurora'));
  assert.ok(!('venue' in classe) && !('locations' in classe));
});

test('accesso al pass: stessi controlli del PDF', () => {
  assert.deepEqual(esitoPass(biglietto(), PRIMA), { ok: true });
  assert.deepEqual(esitoPass(biglietto({ stato: 'in_lista', metodoPagamento: null, importo: 0 }), PRIMA), { ok: true }, 'iscrizione gratuita');
  assert.deepEqual(esitoPass(biglietto({ stato: 'entrato' }), PRIMA), { ok: true });
  const stato = (b: Biglietto) => { const e = esitoPass(b, PRIMA); return e.ok ? 200 : e.stato; };
  assert.equal(stato(biglietto({ stato: 'rimborsato' })), 410);
  assert.equal(stato(biglietto({ pagamentoOnline: { rimborso: { stato: 'fatto' } } as Iscrizione['pagamentoOnline'] })), 410, 'rimborso registrato solo sul pagamento');
  assert.equal(stato(biglietto({ stato: 'annullato' })), 410);
  assert.equal(stato(biglietto({ stato: 'in_attesa', metodoPagamento: null })), 404, 'non ancora pagata');
  assert.equal(stato(biglietto({ stato: 'scaduta', metodoPagamento: null })), 404);
  assert.equal(stato(biglietto({ pagamentoOnline: { daRimborsare: true } as Iscrizione['pagamentoOnline'] })), 404, 'pagamento da restituire');
  assert.equal(stato(biglietto({}, { senzaTelefono: true })), 404, 'serata senza telefono');
  assert.equal(esitoPass(biglietto(), new Date('2026-11-01T01:00:00+01:00')).ok, false, "dopo l'orario limite il pass è scaduto");
  assert.equal(esitoPass(biglietto(), new Date('2026-11-01T00:59:00+01:00')).ok, true);
});

test("configurazione: senza anche una sola variabile il wallet non c'è", () => {
  const tutte = [...APPLE_VARIABILI, ...GOOGLE_VARIABILI];
  const salvate = Object.fromEntries(tutte.map((v) => [v, process.env[v]]));
  try {
    for (const v of tutte) delete process.env[v];
    assert.equal(appleConfigurato(), false);
    assert.equal(googleConfigurato(), false);
    assert.equal(walletConfigurato(), false);
    for (const v of APPLE_VARIABILI) process.env[v] = 'x';
    assert.ok(appleConfigurato() && !googleConfigurato() && walletConfigurato());
    delete process.env.APPLE_WWDR_CERT_BASE64;
    assert.equal(appleConfigurato(), false, 'ne manca una');
    process.env.APPLE_WWDR_CERT_BASE64 = '   ';
    assert.equal(appleConfigurato(), false, 'vuota conta come mancante');
    for (const v of GOOGLE_VARIABILI) process.env[v] = 'x';
    assert.ok(googleConfigurato());
  } finally {
    for (const [v, val] of Object.entries(salvate)) { if (val === undefined) delete process.env[v]; else process.env[v] = val; }
  }
});

test('Google Wallet: JWT firmato con la chiave del service account, classe per serata e oggetto per biglietto', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const k = chiaviGoogleDaEnv('https://esempio.it', {
    GOOGLE_WALLET_ISSUER_ID: '3388000000000000000', GOOGLE_WALLET_EMAIL: 'wallet@progetto.iam.gserviceaccount.com', GOOGLE_WALLET_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
  });
  const b = biglietto();
  const link = linkSalvaGoogle(campiPass(b, PRIMA), k, new Date('2026-10-30T12:00:00Z'));
  assert.ok(link.startsWith('https://pay.google.com/gp/v/save/'));
  const [h, p, s] = link.slice('https://pay.google.com/gp/v/save/'.length).split('.');
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url')), 'firma valida');
  const jwt = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.equal(jwt.iss, 'wallet@progetto.iam.gserviceaccount.com');
  assert.equal(jwt.aud, 'google');
  assert.equal(jwt.typ, 'savetowallet');
  assert.deepEqual(jwt.origins, ['https://esempio.it']);
  const [classe] = jwt.payload.eventTicketClasses;
  const [oggetto] = jwt.payload.eventTicketObjects;
  assert.equal(oggetto.classId, classe.id);
  assert.equal(classe.id, '3388000000000000000.evento_e1');
  assert.match(oggetto.id, /^3388000000000000000\.biglietto_[A-Za-z0-9._-]+$/);
  assert.deepEqual(oggetto.barcode, { type: 'QR_CODE', value: b.iscrizione.tokenQr, alternateText: mostraCodice(b.iscrizione.codice) });
  assert.equal(oggetto.ticketHolderName, 'Giulia Rossi');
  assert.equal(oggetto.validTimeInterval.end.date, new Date(limiteIngresso(b.evento)!).toISOString());
  assert.equal(classe.venue.name.defaultValue.value, 'Grosseto · Villa Aurora');
  assert.equal(classe.hexBackgroundColor, '#0c0f14');
});
