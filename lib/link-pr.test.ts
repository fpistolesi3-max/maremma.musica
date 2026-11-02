import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvisoLinkPr, valutaLinkPr } from './link-pr';
import type { Pr } from './dati/tipi';

const pr = (id: string, handle: string, nomeDisplay: string, stato: Pr['stato'] = 'attivo'): Pr => ({ id, handle, nomeDisplay, stato, createdAt: '2026-01-01T00:00:00Z' });
const prs = [pr('1', 'zarro', 'Zarro Pollicino'), pr('2', 'bomber', 'Bomber Tirreno'), pr('3', 'sospeso', 'Lista Sospesa', 'sospeso')];
const aperta = { prAbilitati: null as string[] | null };
const soloZarro = { prAbilitati: ['1'] };

test('link PR: valido se il PR è attivo e abilitato per la serata', () => {
  const l = valutaLinkPr(prs, aperta, 'zarro', null);
  assert.ok(l.tipo === 'valido' && l.pr.id === '1');
  assert.ok(valutaLinkPr(prs, soloZarro, 'ZARRO', null).tipo === 'valido', 'maiuscole non contano');
  assert.deepEqual(valutaLinkPr(prs, aperta, null, null), { tipo: 'nessuno' });
});

test('link PR: non abilitato per la serata → avviso, non la lista di un altro', () => {
  const l = valutaLinkPr(prs, soloZarro, 'bomber', null);
  assert.ok(l.tipo === 'non_valido' && l.motivo === 'non_abilitato' && l.da === 'link');
  assert.equal(avvisoLinkPr(l as never), 'Il link di Bomber Tirreno non vale per questa serata.');
});

test('link PR: sospeso e inesistente → avviso con il testo giusto', () => {
  const s = valutaLinkPr(prs, aperta, 'sospeso', null);
  assert.ok(s.tipo === 'non_valido' && s.motivo === 'sospeso');
  assert.equal(avvisoLinkPr(s as never), 'Il link di Lista Sospesa non è più attivo.');
  const i = valutaLinkPr(prs, aperta, 'non-esiste', null);
  assert.ok(i.tipo === 'non_valido' && i.motivo === 'inesistente' && i.nome === null);
  assert.equal(avvisoLinkPr(i as never), 'Questo link non è valido.');
});

test('link PR: il cookie di 3 giorni non porta in silenzio nella lista di un PR non abilitato', () => {
  const l = valutaLinkPr(prs, soloZarro, null, 'bomber');
  assert.ok(l.tipo === 'non_valido' && l.da === 'cookie', 'avviso, e il cliente resta nella Lista Maremma Musica');
  assert.ok(valutaLinkPr(prs, soloZarro, null, 'zarro').tipo === 'valido', 'il cookie di un PR abilitato vale');
});

test('link PR: il link nell’indirizzo vince; se non vale non si ripiega sul cookie', () => {
  const l = valutaLinkPr(prs, soloZarro, 'bomber', 'zarro');
  assert.ok(l.tipo === 'non_valido' && l.da === 'link');
  const v = valutaLinkPr(prs, soloZarro, 'zarro', 'bomber');
  assert.ok(v.tipo === 'valido' && v.pr.id === '1');
});

test('link PR: "Continua nella Lista Maremma Musica" ignora link e cookie', () => {
  assert.deepEqual(valutaLinkPr(prs, soloZarro, 'bomber', 'zarro', true), { tipo: 'nessuno' });
});
