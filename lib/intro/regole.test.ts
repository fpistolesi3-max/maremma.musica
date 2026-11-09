import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, decidiIntro, scriptIntro } from './regole';
import { DURATA, FORO } from './sketch';

test('intro: solo alla prima pagina pubblica della sessione, mai con movimento ridotto, sul biglietto o sulle pagine legali', () => {
  const base = { giaVista: false, movimentoRidotto: false, percorso: '/', dalSito: false };
  assert.ok(decidiIntro(base));
  assert.ok(decidiIntro({ ...base, percorso: '/eventi' }));
  assert.ok(decidiIntro({ ...base, percorso: '/e/halloween-party' }));
  assert.ok(!decidiIntro({ ...base, giaVista: true }), 'seconda apertura nella stessa sessione');
  assert.ok(!decidiIntro({ ...base, movimentoRidotto: true }), 'prefers-reduced-motion');
  assert.ok(!decidiIntro({ ...base, percorso: '/biglietto' }), 'biglietto dalla mail');
  assert.ok(!decidiIntro({ ...base, percorso: '/biglietto/abc' }));
  assert.ok(decidiIntro({ ...base, percorso: '/bigliettone' }), 'solo il segmento esatto');
  for (const percorso of ['/privacy', '/condizioni', '/cookie', '/privacy/'])
    assert.ok(!decidiIntro({ ...base, percorso }), `pagina legale ${percorso}`);
  assert.ok(decidiIntro({ ...base, percorso: '/privacy-extra' }), 'solo il segmento esatto');
  assert.ok(!decidiIntro({ ...base, dalSito: true }), 'arrivo da un\'altra pagina del sito (link in una scheda nuova)');
});

// esegue lo script inline in un browser finto e restituisce cosa ha lasciato
function esegui(s: { storage?: Record<string, string>; ridotto?: boolean; percorso?: string; senzaStorage?: boolean; referrer?: string }) {
  const storage = { ...(s.storage ?? {}) };
  const attributi: Record<string, string> = {};
  const finto = {
    window: {
      get sessionStorage() {
        if (s.senzaStorage) throw new Error('bloccato');
        return { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v; } };
      },
    },
    matchMedia: () => ({ matches: !!s.ridotto }),
    location: { pathname: s.percorso ?? '/', origin: 'https://maremmamusica.it' },
    document: { referrer: s.referrer ?? '', documentElement: { setAttribute: (k: string, v: string) => { attributi[k] = v; } } },
  };
  new Function('window', 'matchMedia', 'location', 'document', scriptIntro())(finto.window, finto.matchMedia, finto.location, finto.document);
  return { storage, intro: 'data-intro' in attributi };
}

test('script inline: segna la sessione, mette data-intro e salta il caricamento della home', () => {
  const prima = esegui({});
  assert.ok(prima.intro);
  assert.equal(prima.storage['mm-intro'], '1');
  assert.equal(prima.storage['mm-caricamento'], '1', 'nella stessa sessione l\'intro sostituisce il caricamento');

  const seconda = esegui({ storage: prima.storage });
  assert.ok(!seconda.intro, 'seconda apertura: niente intro');

  const ridotto = esegui({ ridotto: true });
  assert.ok(!ridotto.intro);
  assert.equal(ridotto.storage['mm-intro'], '1');
  assert.equal(ridotto.storage['mm-caricamento'], undefined, 'senza intro il caricamento resta com\'era');

  assert.ok(!esegui({ percorso: '/biglietto' }).intro);
  assert.ok(!esegui({ senzaStorage: true }).intro, 'senza storage niente intro, e nessun errore');
});

test('script inline: niente intro su privacy e termini aperti dal modulo in una scheda nuova, sì a chi arriva da fuori', () => {
  // scheda nuova = sessione nuova, ma si arriva dalla prevendita del sito
  const legale = esegui({ percorso: '/privacy', referrer: 'https://maremmamusica.it/e/halloween-party/prevendita' });
  assert.ok(!legale.intro);
  assert.equal(legale.storage['mm-caricamento'], undefined);
  assert.ok(!esegui({ percorso: '/condizioni' }).intro, 'pagina legale anche da link diretto');
  assert.ok(!esegui({ percorso: '/eventi', referrer: 'https://maremmamusica.it/' }).intro, 'qualsiasi pagina aperta dal sito');
  assert.ok(esegui({ referrer: 'https://l.instagram.com/' }).intro, 'da Instagram sì');
  assert.ok(esegui({ referrer: 'https://www.google.com/' }).intro, 'da Google sì');
  assert.ok(esegui({ referrer: 'https://maremmamusica.it.truffa.com/' }).intro, 'solo la stessa origine conta');
});

test('uscita foro: è quella in uso, dura circa 0,6 s e non allunga l\'intro', () => {
  assert.equal(INTRO.stile, 'giradischi');
  assert.equal(INTRO.uscita, 'foro');
  assert.equal(DURATA, 2.8, 'durata totale come prima');
  const tuffo = FORO.fine - FORO.inizio;
  assert.ok(tuffo >= 0.5 && tuffo <= 0.7, `tuffo di ${tuffo} s`);
  assert.ok(FORO.giro <= FORO.inizio && FORO.fine <= DURATA, 'il disco accelera prima del tuffo e tutto finisce entro la durata');
  assert.ok(FORO.curva > 1, 'lo zoom accelera (curva "in")');
});
