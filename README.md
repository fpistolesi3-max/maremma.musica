# Maremma Musica — sito MVP (offline)

Prevendita online + cassa alla porta per serata (decisione del 26.10): lista e tavoli si pagano solo sul sito con Stripe,
niente pagamenti segnati a mano né soldi dai PR. Alla porta resta l'ingresso in cassa (anche in contanti) per chi non ha
la prevendita, attivabile serata per serata. Il bar resta fuori dal sito.

```bash
npm install
npm run dev        # http://localhost:3000 — anche dal telefono in rete: http://<IP-del-PC>:3000
```

Altri comandi: `npm test` (49 test: token QR, età, doppioni, lotti, prevendita online, porta, cassa, permessi, tavoli), `npm run typecheck`,
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
Per cambiare account usa "Esci" (sempre in alto a destra: area PR, admin e barra della porta); riporta a `/accedi`.
Da telefono: menu ☰ → "Accedi" (nel sito non c'è un link separato alla porta: lo staff entra da qui o dall'icona sul telefono).

| Email | Ruolo | Dove va |
| --- | --- | --- |
| `admin@maremmamusica.test` | admin | `/admin` |
| `porta@maremmamusica.test` | staff porta | `/door` |
| `test-pr@maremmamusica.test` | PR "Test PR" | `/pr/test-pr` |
| `zarro@maremmamusica.test` | PR "Zarro Pollicino" | `/pr/zarro-pollicino` |

Per un servizio email vero: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_MITTENTE` in `.env.local`.

## Area riservata (navigazione)

Admin e staff hanno lo stesso guscio (`components/area/guscio.tsx`): barra laterale su desktop, barra in basso su telefono,
sempre con **Porta** per prima (accesso allo scanner a un tocco). Voci: admin = Porta · Serate · PR · Iscrizioni · Staff;
staff = Porta · PR. "PR" ha tre schede: Attività, Canali · senza PR e (solo admin) Account PR. Dopo il login ogni ruolo
arriva alla sua pagina (admin `/admin`, staff `/door`, PR la sua area); chi apre un'area che non è sua torna alla propria,
senza passare dal login. Il sito pubblico ha una sola voce, "Accedi". Nelle impostazioni della porta: "PR", "Admin" (solo admin)
e, se la porta non è installata, il promemoria "Aggiungi a Home" (manifest `/porta.webmanifest`, parte da `/door`).
Le voci sono solo navigazione: i permessi restano in `richiedi` e `lib/dati/*`.

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

### Serata in copertina

*Modifica serata → In copertina nella home* (campo `inCopertina` dell'evento) sceglie quale serata la home mostra a tutto schermo. Una sola alla volta: spuntandola si toglie dalle altre (`salvaEvento`, solo admin); nella lista serate dell'admin porta il segno "Copertina". Se nessuna è scelta, o la scelta è in bozza o già passata, si mostra la prossima data; con due scelte per errore vince la più vicina (`sceltaCopertina` in `lib/regole.ts`). "Prossime date" e il nastro restano in ordine di data e includono anche la serata in copertina. Supabase: `supabase/migrations/20261027000000_serata_in_copertina.sql` (colonna `eventi.in_copertina`; RLS invariata).

### Serate senza telefono (ingresso con documento)
Per le serate dove il telefono non si porta: *Modifica serata → Ingresso senza telefono (con documento)* (campo `senzaTelefono` dell'evento). La prevendita si compra online come sempre (Stripe, nome, cognome e data di nascita obbligatori, un biglietto per persona).
- **Cliente**: il modulo, la pagina della serata, il biglietto e l'email dicono "serata senza telefono, porta un documento"; l'email non ha né QR né codice.
- **Porta**: la schermata iniziale è la ricerca per cognome (non c'è lo scanner), che usa l'elenco salvato sul telefono e quindi funziona anche offline. La scheda mostra nome, cognome, data di nascita ed età con **Fai entrare** / **Non corrisponde**; nulla si registra finché lo staff non tocca "Fai entrare". Il controllo vale anche sul server (`checkIn` legge `senzaTelefono` dall'evento): un telefono non può saltarlo. Un ingresso si registra una sola volta (il secondo passaggio dà "già entrato"); "Non corrisponde" salva il rifiuto come "Non rientra" e l'iscrizione resta valida. La cassa alla porta resta quella della serata.
- **Lista di riserva**: *Serata → Lista da stampare* (`/admin/eventi/[id]/lista`, Ctrl+P): cognome, nome, data di nascita, entrato sì/no, in ordine alfabetico.
- **Cambio nominativo**: solo l'admin, da *Iscrizioni → Cambia nome* (un piccolo modulo con nome, cognome, data di nascita ed email del biglietto, facoltativa), solo per chi non è ancora entrato; controlla età minima e doppioni, il biglietto resta lo stesso. Se cambia l'email, il link e il recupero usano la nuova; non parte nessuna email.
- **Privacy**: nessuna foto né numero del documento. I dati personali si cancellano per tutte le iscrizioni, vedi *Anonimizzazione* qui sotto.
- **Anonimizzazione** (tutte le iscrizioni, non solo le serate senza telefono): 30 giorni dopo la fine della serata il cron giornaliero (`/api/cron/tavoli`, `anonimizzaIscrizioniVecchie`; un errore non ferma i promemoria dei tavoli) cancella nome, cognome, email e data di nascita. La riga resta e serve alle analisi: **età alla serata** (calcolata prima di cancellare), tipo di prevendita, importo, PR o sito, data e ora d'acquisto, entrato sì/no con l'ora. Il consenso marketing non si tocca. Le righe anonime hanno `anonimizzata`, `etaAllaSerata`, `anonimizzataAt`; nell'archivio attuale i campi cancellati sono stringhe vuote, nel database relazionale sono `null` (`20261016000000_anonimizzazione.sql`: campi personali nullable, un solo vincolo "dati personali presenti oppure tutti null", indice unico su cognome e data di nascita solo per le righe non anonime). L'admin le vede come "Dati cancellati · N anni"; il CSV ha la colonna *Età alla serata*.
- Supabase: `supabase/migrations/20261015000000_senza_telefono.sql` (colonna `eventi.senza_telefono`; RLS invariata). `porta_elenco` non cambia.

### Creare una serata (un solo prezzo, un solo Salva)
- **Un solo prezzo.** Il prezzo di prevendita si decide solo nei *Tipi di prevendita*. Nel modulo di una serata nuova il campo "Prezzo del primo tipo" serve a creare il primo tipo («Lista», segnato come creato in automatico); dopo sparisce dal modulo. Intestazioni (serata live, area PR, pagina pubblica) mostrano il prezzo calcolato dai tipi ancora vendibili (aperti o in arrivo, non chiusi né esauriti), "da 8 €" se i prezzi sono diversi (`prezzoVendibile` e `testoPrezzoTipi` in `lib/regole.ts`); se non resta nulla da vendere (o la serata è passata) vale il prezzo dell'ultimo tipo. `prezzoDaTipi` considera tutti i tipi ed è solo per il prezzo del primo tipo (cassa) e per i modelli. `Evento.prezzoLista` resta nei dati solo come copia del prezzo del primo tipo (lo leggono le serate vecchie senza tipi, le email e il fallback della porta): si aggiorna da solo a ogni modifica dei tipi (`allineaPrezzoLista` in `lib/dati/admin.ts`). Il prezzo della cassa è un campo della sezione *Porta*, precompilato col prezzo del primo tipo; con la cassa accesa è obbligatorio, quindi `prezzoCassa` c'è sempre. Il campo opzionale `automatico` dei tipi manca nelle serate vecchie e vale `false`: nessuna migrazione.
- **Un solo Salva.** La barra in basso salva prima i tipi e i tavoli cambiati nella pagina (ognuno si iscrive a `RegistroSalvataggi`, `components/admin/salva-tutto.tsx`; si ferma al primo errore e dice quale modulo) e poi i dati della serata. Un tipo o un tavolo modificato dice "Modificato: si salva con «Salva» in basso" e, dopo il salvataggio, "Salvato ✓". I tipi e i tavoli *nuovi* si aggiungono con il loro pulsante ("Aggiungi il tipo", "Aggiungi N tavoli").
- **Bozza e "Cosa manca".** Il primo salvataggio di una serata nuova è sempre una bozza (`pubblicatoDopoSalvataggio`). Premendo "Pubblica serata" compare "Cosa manca" (`cosaManca`): tipi propri (non solo quello creato in automatico), locandina, tavoli, prezzo della cassa se la cassa è attiva. Si può pubblicare lo stesso.
- **Duplica serata** (menu *Altro* della serata live → `/admin/eventi/[id]/duplica`): chiede solo la nuova data. Copia dati, PR e impostazioni della porta, tipi (`copiaTipi`: uscite relative e date fisse spostate dello stesso numero di giorni di calendario, alla stessa ora di Roma anche a cavallo dell'ora legale; vale anche per la fine della serata) e tavoli con piantina (`copiaTavoli`); la copia nasce in bozza, con un altro numero e un altro indirizzo, fuori dalla copertina e senza iscrizioni.
- **Tavoli in serie.** "Aggiungi più tavoli in serie": quanti, nome di partenza (`nomiInSerie`: T1 → T1, T2…; T08 tiene gli zeri; senza numero parte da 1), zona, posti e spesa minima; poi si ritoccano i singoli. Tutto o niente se un nome c'è già. "Posti" è obbligatorio (modulo, serie e `salvaTavolo`).
- **Avanzate.** "Numero", "Indirizzo della pagina" e le coordinate stanno in una sezione chiusa in fondo; la locandina è dentro "Copertina e locandina"; le coordinate si ricavano incollando un link lungo di Google Maps (`coordinateDaLinkMaps`: `@lat,lng`, `!3d…!4d…`, `q=` o `ll=`; i link corti non si possono leggere).

### Tipi di prevendita
Ogni serata ha più tipi di prevendita (i "lotti": Early bird, Donne, Standard…), decisi dall'admin in *Modifica serata → Tipi di prevendita*:
nome, prezzo, posti, **categoria**, uscita e chiusura. **Il cliente non sceglie**: il sito vende il primo tipo aperto e con posti, nell'ordine
dell'elenco (`statoLista` in `lib/regole.ts`); gli altri si vedono nella pagina serata ("Esce tra 3 giorni", "Esaurito").
- **Uscita**: subito, N giorni prima della serata (segue la data se la serata si sposta) o data fissa. **Chiusura**: alla serata, N ore prima o data fissa.
  I tipi si avvicendano di norma per date decise dall'admin (es. il primo fino al 30/10, il successivo dal 31/10) anche se i posti non sono finiti; "Esce solo quando finiscono i posti del tipo prima" è un'opzione facoltativa.
- **Categoria** (es. *Donne*): chiunque può comprarla, ma è riservata. Il modulo lo dice con il rinvio ai termini e condizioni (dove vanno spiegate le regole) e, se l'admin lo vuole (spenta di default), chiede la casella "Dichiaro di rientrare nella categoria".
  **Alla porta** (tipi con una categoria vera; senza categoria o "Standard" si entra con la sola scansione): la scansione NON registra l'ingresso. La scheda mostra la categoria in grande, il nome e l'età, con due pulsanti grandi: **Fai entrare** registra l'ingresso, **Non rientra** salva il rifiuto (chi, quando, porta) e non registra nulla. L'iscrizione resta valida: l'admin vede i rifiutati nella serata live (*Rifiutati alla porta*) e in *Iscrizioni*, e decide se rimborsare. Se lo stesso QR viene ripassato la scheda dice "Rifiutato alle 23:40" e si può comunque far entrare. Offline funziona uguale: sia "Fai entrare" sia "Non rientra" vanno in coda e si sincronizzano al ritorno della rete (`lib/porta-logica.ts` `decidiIngresso`, `lib/dati/porta.ts` `rifiutaIngresso`). Il server non registra mai l'ingresso di una prevendita con categoria senza la conferma dello staff.
- **PR**: ogni tipo si vende da tutti i link PR, solo da alcuni PR o solo dal sito.
- **Modelli rapidi** (un prezzo · Early bird + Standard · Early bird + Donne + Standard) e **copia da un'altra serata** (le uscite relative seguono la nuova data; quelle a data fissa si spostano dello stesso numero di giorni e vanno controllate). Si possono sostituire i tipi solo se nessuno si è ancora iscritto, e il sito chiede conferma prima di sostituirli. I modelli partono dal prezzo più alto dei tipi di adesso, così applicarli due volte non abbassa i prezzi.
- La categoria resta sull'iscrizione; il CSV ha le colonne *Tipo di prevendita* e *Categoria*; la serata live ha la tabella *Per tipo di prevendita*.
- Supabase: `supabase/migrations/20261014000000_tipi_prevendita.sql` (colonne su `lotti` e `iscrizioni`, `porta_elenco` con la categoria; RLS invariata).
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
- Porta: `/door` — fotocamera o codice, "cerca per nome", contatore live separato ("Lista 1/17 · Cassa 1": la cassa non gonfia il totale
  della lista), funziona senza rete (elenco e ingressi in coda salvati sul telefono, sincronizzati al ritorno del segnale).
  In alto una barra leggera Porta / PR / Admin (Admin solo per l'admin) con "Esci" sempre a destra, come nel resto dell'area
  riservata; "Esci" chiede conferma e, se ci sono ingressi non ancora inviati, fa prima sincronizzare. "Esci" porta a `/accedi`
  per tutti i ruoli. L'elenco delle serate della porta non mostra le bozze.
- Alla porta chi è in lista ha già pagato online: non si incassa niente e la prevendita non si vende mai. Una prevendita
  "non completata" (modulo compilato o link del PR, pagamento mai arrivato: stato `in_attesa`) non è una prevendita: non ha un QR,
  non vale per entrare e non conta nel contatore. Nell'elenco e nella schermata del risultato dice "Prevendita non completata · non vale
  per entrare", con tre strade: "Ha pagato ora? Riprova" (ha pagato online dal telefono, il telefono riscarica l'elenco), "Ingresso in
  cassa" (se la serata ce l'ha: il modulo si apre già compilato con nome, cognome e data di nascita, lo staff sceglie contanti o POS e
  conferma) oppure "Non entra". Offline vale l'elenco salvato: chi ha pagato dopo l'ultimo aggiornamento non c'è ancora e si aspetta la rete.
- Niente doppioni tra lista e cassa: quando qualcuno entra dalla cassa con gli stessi dati (cognome senza accenti + data di nascita,
  stessa serata) di una prevendita non completata, quella richiesta si chiude (stato `scaduta`, campo `chiusaDaCassa` = id dell'ingresso
  in cassa) e la sua pagina di pagamento Stripe si chiude con `chiudiCheckout` (`/checkout/sessions/{id}/expire`), così non si può
  più pagare. La persona compare una sola volta nella ricerca della porta e in Iscrizioni. Se un pagamento arriva lo stesso, trova
  un ingresso valido (doppione) e finisce tra i pagamenti da rimborsare, visibili all'admin (`confermaPagamentoIscrizione`).
- QR di un'altra serata: se il QR è firmato ma non è in elenco, il telefono chiede al server di quale serata è
  (`/api/door?biglietto=…`, `serataDelBiglietto`: la serata si ricava dall'iscrizione o dal tavolo e la firma si verifica con quella
  serata, quindi un QR falso non dice niente) e mostra "Biglietto di <serata> (<data>). Cambia serata →": un tocco passa alla serata
  giusta (prima sincronizza la coda) e rilegge lo stesso QR. Serve la rete: il token porta solo l'id del biglietto, non la serata,
  quindi offline resta "Non è in elenco" (cambiare il formato del token invaliderebbe i biglietti già inviati).
- Ingresso in cassa (staff e admin, da `/door` → "Ingresso in cassa"), solo nelle serate con "Ingresso in cassa alla
  porta" acceso nel form della serata (sezione Ingresso; di default acceso). Spento: la porta non mostra il pulsante, la
  pagina della serata, il modulo e le email dicono "Ingresso solo in prevendita". La porta riceve l'interruttore a ogni
  sincronizzazione; un ingresso in cassa fatto offline prima dello spegnimento si registra comunque. Chi arriva senza lista paga alla porta
  e viene registrato con nome, cognome e data di nascita (età minima e doppioni). Niente email e niente QR:
  entra subito, anche offline. Prezzo di default = "Prezzo in cassa" della serata (con la cassa accesa c'è sempre: parte dal prezzo del primo tipo e si cambia nella sezione Porta),
  modificabile al momento. Nelle metriche è a parte: non gonfia la lista né la classifica PR, conta negli
  ingressi e nell'incasso (riquadro "In cassa" nella serata live, filtro nelle Iscrizioni, colonna nel CSV).
- Gestione attività PR: `/gestione/pr` — solo admin e staff porta (i PR non entrano). Per ogni PR: in lista,
  nuovi nelle 24 ore, entrati, resa, prevendita pagata online, annullati, ultima attività (contano solo le prevendite pagate);
  scheda del singolo PR con iscritti al giorno, serate, lista e cronologia. Lo staff la apre dalle impostazioni
  dello scanner (voce "PR"), l'admin dalla barra (voce "PR"). Lo staff non vede le email dei PR e non modifica nulla.
- I PR non incassano: niente "Ha pagato" e niente consegne di soldi. Il PR vede nella sua area solo i clienti che hanno
  pagato (o sono entrati); la classifica conta solo le prevendite pagate. Serata live dell'admin: prevendita incassata
  online, cassa alla porta (contanti e POS) e tavoli a parte, più le prevendite da rimborsare.
- Canali `/gestione/canali` (admin e staff): chi si iscrive senza PR, per canale (Instagram, Facebook, TikTok,
  WhatsApp, Google, locandina, diretto). Il canale si riconosce dal social di provenienza o dal link
  etichettato `/e/[slug]?da=instagram` (la pagina dà i link pronti da copiare). Anche nella serata live
  dell'admin e alla porta ("Lista: Maremma Musica · da Instagram").
- Admin: `/admin` home con la prossima serata e le cose da fare (rimborsi, tavoli in attesa) · serate · serata live (si aggiorna ogni 4 s) · nuova/modifica serata con tipi di prevendita e tavoli (spesa minima, zona, posti, stato, mappa con piantina del locale) · PR · iscrizioni
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

### Area admin da telefono
Da telefono le tabelle dell'admin (serate, iscrizioni, PR, staff) diventano schede (`.mm-schede` in `app/globals.css`, le etichette vengono da `data-et`). I filtri delle iscrizioni e i moduli "Aggiungi PR" / "Dai accesso" sono richiudibili (`Filtri`, `Apribile` in `components/admin/ui.tsx`): chiusi mostrano i filtri attivi e "Azzera". Le azioni secondarie di una serata stanno nel menu "Altro". Il modulo serata ha le sezioni Dati, Prevendite, Porta (cassa e prezzo in cassa, senza telefono), Copertina e locandina, PR, Tipi di prevendita, Tavoli, Avanzate; la barra Salva (un solo Salva per tutta la pagina) resta sopra la navigazione. La briciola mostra MM/NNN e non ripete il titolo. Gli stati hanno sempre lo stesso colore (`ChipSerata`, `ChipIscrizione`): in attesa/da rimborsare ambra, pagato bianco, entrato verde, rimborsato grigio tratteggiato, annullato/scaduta rosso barrato. La porta (`/door`) non è toccata.
