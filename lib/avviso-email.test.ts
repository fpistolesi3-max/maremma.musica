import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domandaInvioLink, esitoBenvenutoPr, fraseEmailCliente, titoloEsitoInvioLink } from './avviso-email';

test('benvenuto al PR: con le email vere lo dice, senza no e l’admin è mandato su WhatsApp', () => {
  const smtp = esitoBenvenutoPr('Mario', 'mario@esempio.it', 'smtp');
  assert.equal(smtp.ok, 'Mario è dentro. Gli è partita l’email di benvenuto.');
  assert.equal(smtp.avviso, undefined);

  const archivio = esitoBenvenutoPr('Mario', 'mario@esempio.it', 'archivio');
  assert.equal(archivio.ok, 'Mario è dentro.');
  assert.ok(!/Gli è partita/.test(archivio.ok), 'non dice che è partita');
  assert.match(archivio.avviso!, /non è partita: le email vere non sono ancora attive/);
  assert.match(archivio.avviso!, /WhatsApp/);

  const errore = esitoBenvenutoPr('Mario', 'mario@esempio.it', 'errore');
  assert.match(errore.avviso!, /mario@esempio\.it non è partita/);
});

test('link della serata: esito e conferma cambiano se le email restano nell’archivio', () => {
  assert.deepEqual(titoloEsitoInvioLink({ inviate: 8, nonPartite: 1 }), { titolo: 'Inviate 8 email · 1 non partite', nota: null });
  const prova = titoloEsitoInvioLink({ inviate: 0, nonPartite: 0, inArchivio: 8 });
  assert.match(prova.titolo, /^Nessuna email inviata · 8 rimaste nell’archivio di prova$/);
  assert.match(prova.nota!, /non hanno ricevuto niente/);
  assert.match(titoloEsitoInvioLink({ inviate: 0, nonPartite: 0, inArchivio: 1 }).titolo, /1 rimasta nell’archivio/);

  assert.equal(domandaInvioLink('Halloween', 5, null, true), 'Mando il link di Halloween a 5 PR?');
  assert.match(domandaInvioLink('Halloween', 5, 'Inviato il 2.11', true), /Riceveranno un'altra email/);
  const senza = domandaInvioLink('Halloween', 5, null, false);
  assert.match(senza, /resteranno nell’archivio di prova e i PR non riceveranno niente/);
  assert.ok(!/Mando il link/.test(senza));
});

test('annullamenti: senza email vere l’admin deve avvisare il cliente', () => {
  assert.equal(fraseEmailCliente(true), 'al cliente arriva un’email');
  assert.match(fraseEmailCliente(false), /non arriva nessuna email.*avvisalo tu/);
});
