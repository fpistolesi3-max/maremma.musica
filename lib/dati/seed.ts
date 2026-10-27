import { randomUUID } from 'node:crypto';
import type { Archivio, Evento, Iscrizione, Lotto, Pr, Utente } from './tipi';
import { creaCodice, creaTokenQr } from '../qr-token';

// Dati di partenza, creati al primo avvio in .data/db.json.
// Per ripartire da zero: `npm run dati:reset` e riavvia `npm run dev`.
//
// Halloween Party è la serata vera (dal piano d'azione e dalla locandina).
// Le altre serate, i PR e le persone in lista sono ESEMPI dei mockup: da togliere prima del lancio.

const ora = () => new Date().toISOString();

function evento(p: Partial<Evento> & Pick<Evento, 'slug' | 'nome' | 'data'>): Evento {
  return {
    id: randomUUID(), numero: null, dataFine: null, location: null, comune: null, lat: null, lng: null,
    locationSegreta: false, tipoIngresso: 'lista', descrizione: null, highlight: null, dressCode: null,
    lineup: [], infoArrivo: null, locandinaUrl: null, piantinaUrl: null, prezzoLista: 0, cassaAttiva: true, prezzoCassa: null, etaMinima: 18, pubblicato: true,
    prAbilitati: null, createdAt: ora(), updatedAt: ora(), ...p,
  };
}

export function datiIniziali(segreto: string): Archivio {
  const halloween = evento({
    numero: 25,
    slug: 'halloween-party',
    nome: 'Halloween Party',
    data: '2026-10-31T22:00:00+01:00',          // TODO: cliente — orario di apertura
    dataFine: '2026-11-01T04:00:00+01:00',      // TODO: cliente — orario di chiusura
    location: null,                              // TODO: cliente — location (non è sulla locandina)
    comune: null,                                // TODO: cliente — comune
    highlight: 'Premio 500 € alla maschera migliore',
    dressCode: 'Mascherato',
    descrizione: 'La notte più lunga dell’anno, sotto cassa e in maschera. In palio 500 € per la maschera migliore.',
    infoArrivo: null,                            // TODO: cliente — parcheggio, navetta
    locandinaUrl: '/img/locandine/halloween-party-31-10-26.jpg',
    prezzoLista: 10,                             // TODO: cliente — prezzo della prevendita online
    prezzoCassa: 15,                             // TODO: cliente — prezzo per chi entra in cassa senza prevendita
    etaMinima: 18,                               // TODO: cliente — età minima
  });
  const solchi = evento({ // ESEMPIO dai mockup
    numero: 26, slug: 'solchi', nome: 'Solchi',
    data: '2026-11-07T23:00:00+01:00', dataFine: '2026-11-08T04:00:00+01:00',
    comune: 'Massa Marittima', prezzoLista: 12,
  });
  const capodanno = evento({ // ESEMPIO dai mockup
    numero: 27, slug: 'capodanno-in-pineta', nome: 'Capodanno in pineta',
    data: '2026-12-31T22:00:00+01:00', dataFine: '2027-01-01T06:00:00+01:00',
    location: 'Pineta', comune: 'Maremma', locationSegreta: true, prezzoLista: 15,
  });
  const ricky = evento({ // serata passata, dalla locandina del Design System
    numero: 24, slug: 'ricky-le-roy-monteverdi', nome: 'Ricky Le Roy',
    data: '2026-09-19T22:00:00+02:00', dataFine: '2026-09-20T03:00:00+02:00',
    location: 'Campo G. Scirea', comune: 'Monteverdi M.mo', lat: 43.1512, lng: 10.7713,
    tipoIngresso: 'libero', lineup: ['Ricky Le Roy', 'B&G Twins', 'Alex Ferro'],
    locandinaUrl: '/img/locandine/ricky-le-roy-monteverdi-19-09.png',
  });

  const lotti: Lotto[] = [
    { id: randomUUID(), eventoId: halloween.id, nome: 'Lista', prezzo: 10, quantita: 400, // TODO: cliente — posti
      dataInizio: null, dataFine: '2026-10-31T21:00:00+01:00', visibileDaPr: true, ordine: 0 },
    { id: randomUUID(), eventoId: solchi.id, nome: 'Lista', prezzo: 12, quantita: 400,
      dataInizio: null, dataFine: null, visibileDaPr: true, ordine: 0 },
    { id: randomUUID(), eventoId: capodanno.id, nome: 'Lista', prezzo: 15, quantita: 600,
      dataInizio: '2026-12-01T00:00:00+01:00', dataFine: null, visibileDaPr: true, ordine: 0 },
  ];

  const pr: Pr[] = [
    { id: randomUUID(), handle: 'test-pr', nomeDisplay: 'Test PR', stato: 'attivo', createdAt: ora() },
    { id: randomUUID(), handle: 'zarro-pollicino', nomeDisplay: 'Zarro Pollicino', stato: 'attivo', createdAt: ora() },
    { id: randomUUID(), handle: 'bomber-tirreno', nomeDisplay: 'Bomber Tirreno', stato: 'attivo', createdAt: ora() },
    { id: randomUUID(), handle: 'la-butteressa', nomeDisplay: 'La Butteressa', stato: 'attivo', createdAt: ora() },
  ];
  const [testPr, zarro, bomber, butteressa] = pr;

  // Accesso senza password: il link arriva per email (in sviluppo lo trovi su /dev/posta).
  const utenti: Utente[] = [
    { id: randomUUID(), email: 'admin@maremmamusica.test', ruolo: 'admin', prId: null, createdAt: ora() },
    { id: randomUUID(), email: 'porta@maremmamusica.test', ruolo: 'staff', prId: null, createdAt: ora() },
    { id: randomUUID(), email: 'test-pr@maremmamusica.test', ruolo: 'pr', prId: testPr.id, createdAt: ora() },
    { id: randomUUID(), email: 'zarro@maremmamusica.test', ruolo: 'pr', prId: zarro.id, createdAt: ora() },
  ];

  // Prevendite di esempio, per vedere classifica e scanner al lavoro.
  // [nome, cognome, nascita, PR, ore fa, canale di arrivo]
  const esempi: [string, string, string, Pr | null, number, string][] = [
    ['Giulia', 'Bianchi', '2001-05-14', zarro, 2, 'whatsapp'],
    ['Tommaso', 'Pucci', '1999-02-03', zarro, 5, 'instagram'],
    ['Sara', 'Gori', '2003-11-21', zarro, 9, 'whatsapp'],
    ['Irene', 'Nesi', '2000-07-08', zarro, 30, 'instagram'],
    ['Elena', 'Conti', '1998-04-17', bomber, 3, 'instagram'],
    ['Andrea', 'Cecchi', '2002-09-30', bomber, 7, 'whatsapp'],
    ['Pietro', 'Salvadori', '1997-12-12', bomber, 20, 'diretto'],
    ['Luca', 'Neri', '2001-01-25', bomber, 44, 'whatsapp'],
    ['Noemi', 'Galli', '2004-03-02', butteressa, 11, 'instagram'],
    ['Marco', 'Verdi', '1999-08-21', testPr, 1, 'whatsapp'],
    // Senza PR: arrivati dai social della crew o dal sito
    ['Davide', 'Rossi', '1996-06-19', null, 4, 'instagram'],
    ['Marta', 'Lenzi', '2000-10-10', null, 26, 'instagram'],
    ['Chiara', 'Fabbri', '2002-02-17', null, 6, 'instagram'],
    ['Niccolò', 'Bartoli', '1998-11-03', null, 12, 'tiktok'],
    ['Alice', 'Mori', '2001-08-29', null, 15, 'facebook'],
    ['Federico', 'Landi', '1997-05-06', null, 33, 'locandina'],
    ['Veronica', 'Pieri', '2003-01-12', null, 50, 'diretto'],
  ];
  const lottoHalloween = lotti[0];
  // Esempi: tutte prevendite pagate online (pagamento di prova).
  const iscrizioni: Iscrizione[] = esempi.map(([nome, cognome, dataNascita, p, oreFa, canale]) => {
    const id = randomUUID();
    const creata = new Date(Date.now() - oreFa * 3_600_000);
    return {
      id, eventoId: halloween.id, lottoId: lottoHalloween.id, prId: p?.id ?? null,
      nome, cognome, dataNascita, email: `${nome}.${cognome}@esempio.it`.toLowerCase(),
      tokenQr: creaTokenQr(segreto, id, halloween.id, creata), codice: creaCodice(segreto, id),
      stato: 'pagato', metodoPagamento: 'online',
      importo: lottoHalloween.prezzo, pagatoAt: creata.toISOString(),
      scade: null, pagamentoOnline: { sessione: null, pagamento: `prova_esempio_${id}`, daRimborsare: false },
      oraCheckIn: null, porta: null, consensoPrivacyAt: creata.toISOString(), consensoMarketing: false,
      annullatoAt: null, createdAt: creata.toISOString(),
      canale, consegnaId: null, origine: 'lista', rifCassa: null,
    };
  });

  return {
    versione: 1, segreto,
    eventi: [halloween, solchi, capodanno, ricky], lotti, pr, iscrizioni, utenti,
    accessi: [], posta: [], porte: [], consegne: [], tavoli: [], prenotazioni: [],
  };
}
