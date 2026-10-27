# Maremma Musica — sito MVP (offline)

Prevendita online + cassa alla porta per serata (decisione del 26.10): lista e tavoli si pagano solo sul sito con Stripe,
niente pagamenti segnati a mano né soldi dai PR. Alla porta resta l'ingresso in cassa (anche in contanti) per chi non ha
la prevendita, attivabile serata per serata. Il bar resta fuori dal sito.

```bash
npm install
npm run dev        # http://localhost:3000 — anche dal telefono in rete: http://<IP-del-PC>:3000
```

Altri comandi: `npm test` (29 test: token QR, età, doppioni, lotti, prevendita online, porta, cassa, permessi, tavoli), `npm run typecheck`,
`npm run dati:reset` (a server fermo: al prossimo avvio riparte dai dati di esempio), `npm run dev:https`
(serve per la fotocamera dello scanner su telefono: i browser la danno solo su https o localhost).

## Dati

Per ora niente database: tutto sta in `.data/db.json`, creato e riempito da solo al primo avvio
(`lib/dati/seed.ts`). Le locandine caricate dall'admin finiscono in `.data/media/`.
Tutto l'accesso ai dati passa da `lib/dati/*` e ogni funzione controlla il ruolo di chi chiede,
come faranno le policy RLS: il PR riceve solo i propri iscritti, lo staff porta vede l'elenco ma dei PR
solo il nome della lista, l'admin vede tutto. Quando si passa a Supabase lo schema con le stesse regole
è già pronto in `supabase/migrations/` e va riscritto solo `lib/dati/archivio.ts` + le query.

## Accessi (senza password)

Si entra da `/accedi` con l'email: arriva un link e un codice a 6 cifre. Finché il servizio email vero
non è configurato, le email si leggono su **`/dev/posta`** (anche i QR delle iscrizioni).

In sviluppo `/accedi` mostra anche gli **account di prova**: un tocco e poi "Entra subito".
Per cambiare account usa "Esci" (area PR in alto, admin in alto, scanner nelle impostazioni della porta).
Da telefono: menu ☰ → "Area PR e staff".

| Email | Ruolo | Dove va |
| --- | --- | --- |
| `admin@maremmamusica.test` | admin | `/admin` |
| `porta@maremmamusica.test` | staff porta | `/door` |
| `test-pr@maremmamusica.test` | PR "Test PR" | `/pr/test-pr` |
| `zarro@maremmamusica.test` | PR "Zarro Pollicino" | `/pr/zarro-pollicino` |

Per un servizio email vero: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_MITTENTE` in `.env.local`.

## Pagine

- Pubbliche: `/`, `/eventi`, `/e/[slug]`, `/chi-siamo`, `/galleria`, `/privacy`, `/cookie`, `/condizioni`, 404.
- Prevendita: `/e/[slug]/prevendita?pr=[handle]` e il link PR `/e/[slug]/[handle]` (Lista bloccata).
  Il link PR lascia un cookie di 3 giorni: vince l'ultimo link visitato. Senza link: "Lista: Maremma Musica".
- Prevendita pagata online: chi compila il modulo va subito alla pagina di pagamento (Stripe Checkout: carta, Apple Pay,
  Google Pay). Fino al pagamento l'iscrizione è "in attesa": il posto del lotto è tenuto 30 minuti (`MINUTI_PAGAMENTO_ONLINE`),
  poi scade e torna libero. Il QR c'è (a schermo e per email) solo a pagamento ricevuto: webhook `/api/pagamenti/stripe`,
  ritorno del cliente sulla pagina del biglietto e controllo giornaliero del cron, come per i tavoli. Chi riprova prima di
  pagare ritrova la stessa iscrizione. Un pagamento arrivato tardi vale se nel lotto c'è ancora posto e la serata non è
  iniziata, altrimenti è "da rimborsare" (email agli admin, filtro nelle Iscrizioni). Il rimborso lo fa solo l'admin
  ("Rimborsa" restituisce i soldi su Stripe); il cliente non annulla da solo. Lotti a 0 € e serate libere: QR subito.
  Il link del PR attribuisce la vendita al PR come prima. Senza chiave Stripe c'è la pagina di prova `/dev/pagamento`;
  sul sito vero senza `STRIPE_SECRET_KEY` la prevendita a pagamento resta chiusa ("Prevendita in arrivo").
- Biglietto: `/biglietto/[id]?email=…` (stato del pagamento, poi QR, PDF, calendario; "Paga" apre `/biglietto/[id]/paga`,
  "Lascia il posto" lo libera), recupero da `/biglietto`.
- Tavoli: `/tavoli/[slug]` (mappa e richiesta; `?pr=[handle]` la attribuisce al PR, qualunque tavolo scelga il cliente; "affidato ai PR" decide solo quali tavoli il PR può prenotare lui per un cliente) e `/tavolo/[id]?email=…` (stato della prenotazione e, a pagamento ricevuto, il QR unico del tavolo). La spesa minima si paga sul sito (vedi il punto sotto): nessun pagamento si segna a mano. Dall'apertura della serata i tavoli non si chiedono più dal sito. Una prenotazione pagata si annulla con o senza rimborso (stato "rimborsata"). Gli stati sono gli stessi dappertutto: Libero, In attesa di pagamento, Pagato, Non in vendita; il PR vede solo i propri tavoli e può inserire la richiesta per un cliente (poi torna nella sua area con la conferma). Alla porta il QR del tavolo vale per tutto il gruppo: ogni passaggio fa entrare una persona fino al numero prenotato ("3 di 6"), poi "Tavolo pieno"; un tavolo non pagato non entra. Funziona anche offline come il resto dello scanner. Gli admin ricevono un'email a ogni tavolo pagato; una volta al giorno `/api/cron/tavoli` (cron in `vercel.json`, protetto da `CRON_SECRET`) controlla i pagamenti, manda i promemoria e fa decadere le prenotazioni scadute (vedi sotto); l'email al cliente parte subito anche quando la crew annulla o rimborsa. Tavoli e piantina si riprendono da un'altra serata (stesso locale), anche creando la serata. "Il mio QR" rimanda anche i link dei tavoli; storico e CSV delle prenotazioni nella serata. Un tavolo con prenotazioni nello storico non si elimina: si mette "Non in vendita".
- Pagamento dei tavoli: tutti i pagamenti passano dal sito, con Stripe (alla serata si paga solo il bar). Il cliente sceglie il tavolo e paga subito
  la spesa minima sul sito (Stripe Checkout: carta, Apple Pay, Google Pay). Il tavolo resta fermo solo 30 minuti
  (`MINUTI_PAGAMENTO_ONLINE`, il minimo di Stripe); a pagamento fatto la prenotazione si conferma da sola e parte il QR,
  senza "Segna pagato". Chi chiude la pagina di pagamento può riprovare subito o lasciare libero il tavolo dalla sua pagina.
  Se il PR inserisce la richiesta, o l'admin per un tavolo venduto a voce ("Prenota per un cliente" nella serata: qualunque
  tavolo, lista Maremma Musica), il cliente riceve per email il link per pagare e ha 24 ore; se non ha ancora pagato, il controllo
  del mattino (dopo almeno 3 ore dal link, `ORE_MINIME_PROMEMORIA_PR`) gli rimanda il link e avvisa il PR, che può contattare il cliente; se scade senza pagamento lo sanno sia il cliente sia il PR. Nell'area del PR, sulle richieste
  ancora da pagare, "Manda il link su WhatsApp" (al numero del cliente) e "Copia il link per pagare". Anche il link dei tavoli
  del PR (`/tavoli/[serata]?pr=…`) il sito lo ricorda per 3 giorni, come quello della lista. La conferma arriva dal webhook
  `/api/pagamenti/stripe` (firma con `STRIPE_WEBHOOK_SECRET`) e, se tarda, dal ritorno del cliente sulla sua pagina. Un pagamento
  arrivato quando il tavolo era già di un altro finisce nello storico come "da rimborsare"; "Rimborsa" restituisce i soldi
  su Stripe. Senza chiave Stripe, in sviluppo e sull'istanza di prova, c'è la pagina finta `/dev/pagamento`: tutto il giro
  senza soldi veri. Sul sito vero senza `STRIPE_SECRET_KEY` i tavoli si vedono ma non si prenotano. Una volta al giorno il cron
  chiede a Stripe l'esito delle pagine di pagamento rimaste senza risposta, così un tavolo pagato non torna libero se il webhook
  non arriva. Non esiste "Segna pagato": un tavolo diventa "in attesa" o "pagato" solo con una prenotazione pagata sul sito.
- PR: `/pr/[handle]` — chi apre il link vede le prossime serate; il PR entrato vede la sua area.
- Porta: `/door` — fotocamera o codice, "cerca per nome", contatore live, funziona senza rete
  (elenco e ingressi in coda salvati sul telefono, sincronizzati al ritorno del segnale).
- Alla porta chi è in lista ha già pagato online: non si incassa niente. Una prevendita chiesta e non pagata dà
  "Non pagato": la persona può pagarla dal telefono (rifà la prevendita con gli stessi dati e ritrova il posto) e poi "Riprova", oppure passare dalla cassa se la serata ce l'ha.
  Offline vale l'elenco salvato: chi ha pagato dopo l'ultimo aggiornamento non c'è ancora e si aspetta la rete.
- Ingresso in cassa (staff e admin, da `/door` → "Ingresso in cassa"), solo nelle serate con "Ingresso in cassa alla
  porta" acceso nel form della serata (sezione Ingresso; di default acceso). Spento: la porta non mostra il pulsante, la
  pagina della serata, il modulo e le email dicono "Ingresso solo in prevendita". La porta riceve l'interruttore a ogni
  sincronizzazione; un ingresso in cassa fatto offline prima dello spegnimento si registra comunque. Chi arriva senza lista paga alla porta
  e viene registrato con nome, cognome e data di nascita (età minima e doppioni). Niente email e niente QR:
  entra subito, anche offline. Prezzo di default = "Prezzo in cassa" della serata (vuoto = come la lista),
  modificabile al momento. Nelle metriche è a parte: non gonfia la lista né la classifica PR, conta negli
  ingressi e nell'incasso (riquadro "In cassa" nella serata live, filtro nelle Iscrizioni, colonna nel CSV).
- Gestione attività PR: `/gestione/pr` — solo admin e staff porta (i PR non entrano). Per ogni PR: in lista,
  nuovi nelle 24 ore, entrati, resa, prevendita pagata online, annullati, ultima attività (contano solo le prevendite pagate);
  scheda del singolo PR con iscritti al giorno, serate, lista e cronologia. Lo staff la apre dalle impostazioni
  dello scanner, l'admin dal menu "Attività PR". Lo staff non vede le email dei PR e non modifica nulla.
- I PR non incassano: niente "Ha pagato" e niente consegne di soldi. Il PR vede nella sua area solo i clienti che hanno
  pagato (o sono entrati); la classifica conta solo le prevendite pagate. Serata live dell'admin: prevendita incassata
  online, cassa alla porta (contanti e POS) e tavoli a parte, più le prevendite da rimborsare.
- Canali `/gestione/canali` (admin e staff): chi si iscrive senza PR, per canale (Instagram, Facebook, TikTok,
  WhatsApp, Google, locandina, diretto). Il canale si riconosce dal social di provenienza o dal link
  etichettato `/e/[slug]?da=instagram` (la pagina dà i link pronti da copiare). Anche nella serata live
  dell'admin e alla porta ("Lista: Maremma Musica · da Instagram").
- Admin: `/admin` serate · serata live (si aggiorna ogni 4 s) · nuova/modifica serata con lotti e tavoli (spesa minima, zona, posti, stato, mappa con piantina del locale) · PR · iscrizioni
  (annulla/rimborsa/CSV) · staff.

## Da completare con il cliente (`TODO: cliente` nel codice)

Location, orari, prezzo e posti di Halloween Party · regolamento del premio · ragione sociale e P.IVA ·
testi di chi siamo, residenti, foto · servizio email · revisione legale di privacy e termini.
Le serate Solchi e Capodanno, i PR e le persone in lista sono esempi dei mockup: da togliere prima del lancio.

## Istanza online di test (Vercel + Supabase)

Serve per provare il sito dal telefono, sempre all'ultima versione. Ogni push sul branch collegato aggiorna l'indirizzo in 1–2 minuti.

1. **Supabase** → nuovo progetto (regione EU). Applica le migrazioni di `supabase/migrations/` (SQL editor, o `supabase db push`);
   per ora serve solo `20261005000000_archivio_mvp.sql` (tabella provvisoria + bucket `locandine`). Le migrazioni dei tavoli
   (`20261006…`–`20261012…`) e della prevendita online (`20261013…`) sono per lo schema relazionale, con le stesse regole di
   `lib/dati/tavoli.ts`, `lib/dati/prevendita.ts` e `lib/dati/porta.ts`. Sull'archivio provvisorio i dati vecchi (in lista senza
   aver pagato, pagati al PR) si sistemano da soli alla lettura: diventano pagati online con un pagamento di prova.
   Copia *Project URL* e la chiave *service_role* (Settings → API).
2. **Vercel** → *Add New Project* → importa il repo GitHub. Regione funzioni `fra1` (già in `vercel.json`).
   In *Environment Variables* inserisci quelle di `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MM_SEGRETO`,
   `SITO_URL` (l'indirizzo `*.vercel.app` che Vercel assegna) e `MM_MODALITA_PROVA=1`. Poi *Deploy*.
3. Al primo accesso l'archivio si crea da solo con i dati di esempio. `/accedi` mostra gli account di prova e `/dev/posta` la posta.
   Con `MM_MODALITA_PROVA=1` chiunque abbia l'indirizzo entra come admin: tienilo solo con dati finti.
4. **iPhone**: apri l'indirizzo in Safari → Condividi → *Aggiungi a Home*. Dall'icona la web-app ha cookie suoi: per entrare in area
   PR/porta/admin usa il **codice a 6 cifre** (il link dell'email si aprirebbe in Safari).

Limiti dell'archivio provvisorio: l'intero archivio è una riga `jsonb` (con controllo di versione contro le scritture simultanee),
va bene per qualche decina di persone in prova, non per il lancio: prima va collegato lo schema relazionale. Le locandine vanno
su Storage e il modulo le riduce prima dell'invio (limite 4 MB, quello di Vercel è 4,5 MB per richiesta).

## Test su iPhone / Instagram

1. PC e iPhone sulla stessa Wi-Fi, `npm run dev`, apri `http://<IP-del-PC>:3000` su Safari.
2. Per il browser di Instagram: manda il link a te stesso in DM su Instagram e aprilo da lì.
3. Scanner con fotocamera: avvia `npm run dev:https` e apri `https://<IP-del-PC>:3000/door`
   (accetta l'avviso sul certificato di sviluppo).
