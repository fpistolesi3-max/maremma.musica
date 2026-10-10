// Controllo di versione dell'archivio remoto, con uno store in memoria al posto di Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archivioRemoto, type Riga, type StoreRemoto } from './archivio-remoto';
import type { Archivio } from './tipi';

const vuoto = () => ({ segreto: 's', eventi: [], iscrizioni: [], posta: [] }) as unknown as Archivio;

/** Store in memoria; `prima` simula una scrittura di un'altra istanza tra la lettura e la scrittura. */
function finto(opzioni: { prima?: (riga: Riga) => void } = {}) {
  let riga: Riga | null = null;
  let creazioni = 0;
  const store: StoreRemoto = {
    async leggi() { return riga ? { versione: riga.versione, dati: structuredClone(riga.dati) } : null; },
    async crea(d) { creazioni++; riga ??= { versione: 1, dati: structuredClone(d) }; },
    async scrivi(v, d) {
      opzioni.prima?.(riga!);
      if (!riga || riga.versione !== v) return false;
      riga = { versione: v + 1, dati: structuredClone(d) };
      return true;
    },
  };
  return { store, riga: () => riga!, creazioni: () => creazioni };
}

test('al primo avvio crea la riga con i dati iniziali', async () => {
  const f = finto();
  const a = archivioRemoto(f.store, vuoto, (d) => d);
  assert.equal((await a.leggi()).segreto, 's');
  assert.equal(f.creazioni(), 1);
  await a.leggi();
  assert.equal(f.creazioni(), 1);
});

test('modifica scrive, alza la versione e restituisce il risultato', async () => {
  const f = finto();
  const a = archivioRemoto(f.store, vuoto, (d) => d);
  const r = await a.modifica((d) => { d.posta.push({ id: 'x' } as never); return 42; });
  assert.equal(r, 42);
  assert.equal(f.riga().versione, 2);
  assert.equal((await a.leggi()).posta.length, 1);
});

test('se un\'altra istanza scrive nel frattempo rilegge e riprova senza perdere nulla', async () => {
  let scontri = 0;
  const f = finto({
    prima: (riga) => {
      if (scontri++ < 2) { riga.versione += 1; riga.dati.posta.push({ id: 'altro' } as never); }
    },
  });
  const a = archivioRemoto(f.store, vuoto, (d) => d);
  let chiamate = 0;
  await a.modifica((d) => { chiamate++; d.posta.push({ id: 'mio' } as never); });
  assert.equal(chiamate, 3);
  assert.deepEqual(f.riga().dati.posta.map((m: { id: string }) => m.id), ['altro', 'altro', 'mio']);
});

test('con troppi scontri si ferma con un errore chiaro', async () => {
  const f = finto({ prima: (riga) => { riga.versione += 1; } });
  const a = archivioRemoto(f.store, vuoto, (d) => d);
  await assert.rejects(a.modifica(() => 1), /troppe scritture/);
});

test('due modifiche insieme nello stesso processo si sommano', async () => {
  const f = finto();
  const a = archivioRemoto(f.store, vuoto, (d) => d);
  await Promise.all([1, 2, 3, 4, 5].map((n) => a.modifica((d) => { d.posta.push({ id: String(n) } as never); })));
  assert.equal(f.riga().dati.posta.length, 5);
});
