# Piano: dalla riga unica alle tabelle vere

Stato: **solo piano**, nessun codice e nessuna scrittura sul database. Scritto il 4.11.2026 su `main` alla #50.
Cosa ho guardato sul database online: solo struttura e conteggi (`list_tables`, `list_migrations`, SELECT di conteggio). Nessun dato personale e nessun segreto è copiato qui.

---

## 1. In parole semplici

**Perché serve.** Oggi tutto il sito (serate, prevendite, tavoli, PR, scansioni alla porta) sta in *una sola riga* del database, come un unico foglio di carta. Ogni volta che qualcuno compra, scansiona un QR o modifica qualcosa, il sito riscrive *l'intero foglio*. Se due persone lo fanno nello stesso istante, una delle due deve riprovare (il sito prova fino a 12 volte). Con pochi utenti va bene. Una sera vera, con il pagamento di Stripe che arriva mentre tre telefoni scansionano alla porta e un admin modifica una serata, è esattamente il caso che vogliamo evitare. Le tabelle vere sono come schede separate (una per ogni prevendita, ogni tavolo, ogni pagamento): due persone che toccano schede diverse non si disturbano, e le regole importanti ("questo posto è già venduto", "questo QR è già entrato", "questo pagamento è già stato registrato") le fa rispettare il database stesso, anche se le richieste arrivano insieme.

**Cosa cambia per te e per il cliente.** Niente, se va bene. Il sito deve apparire e funzionare identico. La differenza si vede solo nei momenti di punta: meno attese, nessun "riprova" e nessun rischio di vendere due volte lo stesso posto.

**I rischi e come li evitiamo.**
- *Perdere o sbagliare dei dati nella copia.* Oggi i dati sono pochi e tutti di prova (22 iscrizioni, tutte con pagamenti di prova; 4 serate; nessun tavolo; nessun rimborso). La copia si fa dentro il database, in un colpo solo, e poi un controllo automatico confronta tutto riga per riga. La riga vecchia resta intatta come copia di sicurezza.
- *Il sito che va in errore durante il passaggio.* Tutto il codice nuovo arriva "spento": finché non giri tu l'interruttore, il sito continua a usare la riga come oggi. Nessuna novità va online prima che la sua migrazione sia applicata, come già facciamo.
- *Una sera dal vivo con metà dei dati nel posto sbagliato.* Il passaggio vero si fa **una volta sola**, in un momento senza vendite né porta, e dura un paio di minuti. Se qualcosa non torna si rigira l'interruttore e si torna come prima.
- *Dati personali che restano dove non devono.* La riga vecchia contiene nomi ed email: dopo un periodo di sicurezza (14 giorni) la ripuliamo e poi la eliminiamo, altrimenti l'anonimizzazione dopo 30 giorni non varrebbe su quella copia.

**Quante tappe e cosa devi fare tu.** 9 piccole PR (le prime 7 non cambiano nulla di visibile), più un solo "passaggio" fatto insieme. Tu devi: (1) dare il via a ogni migrazione sul database (le applico io col connettore solo se mi dici sì, oppure le applica l'amico); (2) scegliere il giorno tranquillo del passaggio; (3) girare l'interruttore su Vercel quando ti dico (una variabile, 1 minuto) e controllare la home; (4) rispondere alle domande in fondo. Il resto lo facciamo noi, con la revisione di ogni PR prima del merge.

---

## 2. Tabelle proposte

### 2.1 Regole comuni
- **Tutti gli id restano uguali a oggi**: nel database online sono tutti UUID (verificato su serate, tipi, PR, utenti, iscrizioni), quindi si copiano senza conversioni e i link già inviati (QR, biglietti) continuano a funzionare.
- **Testo + CHECK invece degli `enum`.** Con i `enum`, aggiungere un valore non si può usare nella stessa transazione (è già successo: `…13000000` e `…13000001`). Con `text` e `CHECK` si cambia con una migrazione sola.
- **Soldi**: i prezzi come oggi in `numeric(8,2)` (euro, come il codice); i pagamenti Stripe in **centesimi interi**.
- **Orari** in `timestamptz`. Nota: il codice oggi salva stringhe ISO con fusi diversi (`+02:00`, `Z`); tornano come istanti identici ma scritte in modo diverso. La verifica li confronta come istanti, non come testo.
- **RLS accesa su tutte le tabelle, nessuna policy, permessi solo a `service_role`** (stesso schema già usato per `archivio_mvp` e le foto). Motivo: nessun browser parla mai con Supabase; tutto passa da `lib/dati/*`, che controlla il ruolo (admin / staff / PR). Le policy della prima migrazione (basate su `auth.uid()`) quindi non servono e sarebbero una seconda fonte di verità da tenere allineata. Dopo ogni migrazione si lancia `get_advisors` (sicurezza) per controllare che non ci sia niente di esposto.
- **Funzioni SQL**: `security definer`, `set search_path = ''`, `revoke execute … from public, anon, authenticated`, `grant execute … to service_role`, e in fondo a ogni migrazione `notify pgrst, 'reload schema'` (altrimenti l'API non le vede subito).
- Nomi in italiano e snake_case come oggi. Il codice continua a vedere gli stessi oggetti TypeScript (`Evento`, `Iscrizione`…): la traduzione tabella ↔ oggetto sta in un solo modulo.

### 2.2 Le tabelle

**Anagrafiche (cambiano poco, le modifica quasi solo l'admin)**

| Tabella | Colonne principali | Chiavi, vincoli, indici |
|---|---|---|
| `eventi` | tutte quelle di `Evento`: `numero`, `slug`, `nome`, `data`, `data_fine`, luogo (`location`, `comune`, `lat`, `lng`, `location_segreta`), `tipo_ingresso`, testi, `lineup text[]`, `locandina_url`, `piantina_url`, `prezzo_lista`, `senza_telefono`, `prevendita_fino_alle timestamptz`, `capienza`, `eta_minima`, `pubblicato`, `in_copertina`, `pr_abilitati uuid[]` (null = tutti), `invio_link_pr jsonb`, `created_at`, `updated_at` | PK `id`; `slug` unico (con regex); `numero` unico; `capienza > 0`; **indice unico parziale su `in_copertina` dove vero** (una sola serata in copertina, garantito dal database). Non si portano `cassa_attiva` e `prezzo_cassa` (cassa tolta). |
| `lotti` (tipi di prevendita) | `evento_id`, `nome`, `prezzo`, `quantita` (null = illimitata), `data_inizio`, `data_fine`, `visibile_da_pr`, `ordine`, `categoria`, `conferma_categoria`, `uscita_giorni_prima`, `fine_ore_prima`, `dopo_precedente`, `pr_abilitati uuid[]`, `automatico` | FK `evento_id` → `eventi` *on delete cascade*; indice `(evento_id, ordine)`; i CHECK di `…14000000` (uscita unica, chiusura unica, conferma solo con categoria) **riusati identici**. |
| `pr` | `handle`, `nome_display`, `stato`, `created_at` | `handle` unico con regex; `stato in ('attivo','sospeso')`. Un PR non si cancella mai, si sospende. |
| `utenti` | `email`, `ruolo`, `pr_id`, `created_at` | `lower(email)` unico; `ruolo in ('admin','staff','pr')`; `pr_id` FK → `pr` e unico; CHECK "ruolo pr ⇔ ha un `pr_id`". **Non** punta a `auth.users`: il sito ha il suo accesso con link/codice via email. |
| `impostazioni` | `chiave` (PK), `valore` | contiene il `segreto` HMAC dei QR, **copiato byte per byte** (se cambia, tutti i QR già emessi smettono di valere). Se su Vercel è già impostato `MM_SEGRETO` il codice usa quello come oggi. |
| `porte` | `evento_id`, `nome`, `ultimo_sync` | PK `(evento_id, nome)`; il numero di ingressi per porta si calcola, non si salva. |
| `posta_inviata` | `a`, `oggetto`, `html`, `inviata_at`, `via` | solo per la modalità "email nell'archivio" (prove); si svuota a 30 giorni dal cron. Le 20 email di prova di oggi non si copiano. |

**Vendite (qui servono le garanzie)**

| Tabella | Colonne principali | Chiavi, vincoli, indici |
|---|---|---|
| `iscrizioni` | tutte quelle di `Iscrizione`: `evento_id`, `lotto_id`, `pr_id`, `nome`, `cognome`, `data_nascita date`, `email`, `token_qr`, `codice`, `stato`, `metodo_pagamento`, `importo`, `pagato_at`, `scade`, `ora_check_in`, `porta`, `rifiuto_ingresso jsonb`, `categoria`, `canale`, `consenso_privacy_at`, `consenso_marketing`, `annullato_at`, `created_at`, `anonimizzata`, `eta_alla_serata`, `anonimizzata_at`, `pagamento_online bool`, `pagamento_sessione`, **`chiave_cognome`** (calcolata dal codice con `chiaveCognome()`) | FK `evento_id` *restrict*, `lotto_id` e `pr_id` *set null*; `token_qr` e `codice` unici; `stato in ('in_attesa','scaduta','in_lista','pagato','entrato','annullato','rimborsato')`; `metodo_pagamento in ('online')` o null; CHECK `in_attesa ⇒ scade non nulla`; CHECK `iscrizioni_dati_personali` della `…16000000` **riusato** (nome/cognome/email/nascita nulli solo se `anonimizzata`). **Unico "una persona, un QR"**: `(evento_id, chiave_cognome, data_nascita)` dove `stato in ('in_lista','pagato','entrato') and not anonimizzata` (stessa regola di `giaIscritto`; la vecchia usava `lower(btrim(cognome))`, che non toglie accenti e apostrofi, quindi diversa dal codice). Altri indici: `(evento_id, created_at desc)`, `(pr_id, evento_id)`, `lower(email)`, `(lotto_id)` per il conteggio posti, `(scade) where stato='in_attesa'`, `(evento_id, canale)`. Non si portano `origine`, `rif_cassa`, `chiusa_da_cassa`, `consegna_id` (cassa e consegne: nessun dato online le usa, verificato). |
| `tavoli` | `evento_id`, `nome`, `zona`, `posti`, `spesa_minima`, `in_vendita`, `nota`, `visibile_da_pr`, `pr_abilitati uuid[]`, `ordine`, `x`, `y` | FK *cascade*; nome unico per serata (`lower(btrim(nome))`); `(x is null) = (y is null)`. **Lo stato `libero / riservato / confermato` non si salva più**: lo decide la prenotazione attiva (vedi sotto), vista `tavoli_con_stato`. Oggi sono due informazioni da tenere allineate a mano (ogni funzione del codice deve ricordarsi di liberare il tavolo): in tabelle diventa impossibile dimenticarsene. `non_in_vendita` diventa `in_vendita = false`. |
| `prenotazioni_tavoli` | tutte quelle di `PrenotazioneTavolo`: `tavolo_id`, `evento_id`, `pr_id`, dati cliente, `persone`, `spesa_minima`, `stato`, `scade`, `token_qr`, `codice`, `inserita_da`, `consenso_privacy_at`, `pagato_at`, `metodo_pagamento`, `pagato_da`, `chiusa_at`, `chiusa_da`, `promemoria_at`, `avviso_chiusura_at`, `pagamento_online`, `pagamento_sessione`, `telefono_cifre` (colonna generata: ultime 9 cifre) | **Indice unico parziale `(tavolo_id) where stato in ('in_attesa','confermata')`** (già nella `…08000000`, riusato): due persone non possono tenere lo stesso tavolo, neanche con richieste simultanee. Altri due unici parziali per le richieste dei clienti: `(evento_id, email)` e `(evento_id, telefono_cifre)` dove `inserita_da='cliente'` e stato attivo (oggi sono controlli nel codice). `token_qr` e `codice` unici. |
| `ingressi_tavoli` | `prenotazione_id`, `rif`, `ora`, `porta` | `unique (prenotazione_id, rif)` (riusata dalla `…09000000`): la sincronizzazione ripetuta dello stesso passaggio non conta due volte. |
| `pagamenti` | `id text` (id del pagamento Stripe o `prova_…`), `iscrizione_id` *o* `prenotazione_id` (CHECK: esattamente uno), `ruolo` (`principale` / `in_piu`), `centesimi`, `valuta`, `motivo` (i 6 `MotivoRimborso`), `da_rimborsare`, `rimborso_stato` (`in_corso` / `fatto`), `rimborso_chiave`, `rimborso_avviato_at`, `rimborso_fatto_at`, `rimborso_da`, `at` | **PK sull'id del pagamento**: lo stesso pagamento non si registra mai due volte. Unico parziale: un solo pagamento `principale` per ordine. Sostituisce `pagamentoOnline.pagamento`, `inPiu[]`, `daRimborsare`, `motivo`, `rimborso` (oggi dentro la riga di ogni ordine). |
| `accessi` | `utente_id`, `token_hash`, `codice_hash`, `scade`, `usato`, `tentativi` | FK *cascade*; `token_hash` unico; il cron toglie quelli scaduti. |

**Foto (già online)**: `foto_serate` e `serate_foto_credito` restano com'è; nella tappa finale `evento_id` passa da `text` a `uuid` con chiave esterna verso `eventi` *on delete cascade*, come previsto nel commento della migrazione (è sicuro: gli id sono UUID; oggi 2 righe).
**Wallet**: oggi non salva niente nel database (genera il pass dai dati del biglietto). Nessuna tabella ora; se si attivano gli aggiornamenti Apple serviranno tabelle di registrazione, ma è un lavoro a parte.
**`consegne`**: non si crea (0 righe online, la funzione non esiste più).

### 2.3 Cosa riusare delle 19 migrazioni già nel repo

Nessuna si può applicare così com'è (non sono mai state applicate online e il modello è cambiato più volte); molte però hanno idee e vincoli buoni. Conclusione: **si scrivono 3 migrazioni nuove** (anagrafiche, vendite, tavoli e resto) copiando i pezzi giusti, e le vecchie si lasciano nel repo come storia (non vengono applicate).

| File | Giudizio |
|---|---|
| `…01 schema` | **Da riscrivere.** Si tengono: colonne di base, indici, unico "una persona un QR" (corretto con `chiave_cognome`). Si scartano: `enum` (stato incompleto), `utenti → auth.users` (il sito non usa Supabase Auth), tutte le policy `auth.uid()`, `inserisci_iscrizione`/`porta_check_in`/`classifica_pr` (modello vecchio: PR che incassano). |
| `…02 attivita_pr`, `…03 canali_consegne` | Si tiene solo la colonna `canale` con il suo CHECK e l'indice. `consegne`, `conferma_consegna`, `pr_segna_pagato`, `attivita_pr`, `canali_serata` si scartano (il PR non incassa più; classifiche e canali sono già calcolati in `lib/dati/gestione-pr.ts` e `classifica.ts`). |
| `…04 ingresso_cassa` | Scartata (cassa tolta). |
| `…05 archivio_mvp` | Resta fino alla pulizia finale. |
| `…06 tavoli`, `…07 mappa_tavoli`, `…08 prenotazioni_tavoli`, `…09 ingressi_tavoli` | **Riusabili quasi uguali**: tabelle, posizione `x/y`, indice unico del tavolo attivo, unico `(prenotazione, rif)`. Cambia: lo stato del tavolo diventa derivato. |
| `…10 tavoli_allineamento`, `…11 tavoli_pagamenti` | Colonne (`promemoria_at`, `pagato_da`, `chiusa_da`…) riusate; le funzioni `tavoli_pubblici`, `porta_tavoli`, `porta_ingresso_tavolo`, `tavoli_fai_decadere` si scartano (le riscrivo come descritto in 2.4: la lettura pubblica e la porta restano nel codice, come oggi). |
| `…12 tavoli_pagamento_online`, `…13 prevendita_stati/online` | L'idea (pagamento unico, `tiene_posto`, lock sul tipo) è giusta ma **superata**: manca il controllo dell'importo, il secondo pagamento, il motivo di rimborso, il rimborso in due fasi con chiave. Sostituite dalla tabella `pagamenti` e dalle funzioni di 2.4. L'`update` dei "dati vecchi" (`prova_import_…`) non va ripetuto: il codice l'ha già fatto sui dati online. |
| `…14 tipi_prevendita`, `…15 senza_telefono`, `…27 in_copertina` | **Riusate identiche** (colonne e CHECK). |
| `…16 anonimizzazione` | Colonne e CHECK `iscrizioni_dati_personali` riusati; l'indice unico va rifatto (vedi sopra). |
| `…30 foto_serate` | Già online. Resta; vedi "Foto" sopra. |

Nota pratica: online la migrazione delle foto risulta con versione `20261103104800`, nel repo il file è `20261030000000`. Non è un problema (le applica il connettore, non la CLI) ma i nomi dei file nuovi devono avere una data successiva a entrambe.

### 2.4 Operazioni sicure con più persone insieme

Principio: **lascio in TypeScript tutte le regole che dipendono da orari e testi** (orario limite 01:00, scadenza dei 30 minuti, età, link PR, ecc. — restano in `lib/regole.ts`, già testate) e **faccio garantire al database solo quello che può andare storto per colpa di richieste simultanee**: posti finiti, tavolo già preso, pagamento già registrato, QR già entrato. Alla funzione SQL il codice passa anche i valori già decisi (per esempio "l'orario limite è passato: sì/no"), così le regole di orario non si duplicano in SQL.

| Cosa | Meccanismo | Perché regge |
|---|---|---|
| **Posti di un tipo di prevendita** (iscriversi) | funzione `crea_iscrizione(…)`: `select … from lotti where id = … for update` (blocca solo *quel* tipo), conta le righe che "tengono posto" (`in_lista`, `pagato`, `entrato`, oppure `in_attesa` non scaduta), inserisce. Nella stessa funzione: ripresa della richiesta "in attesa" della stessa persona (blocco `pg_advisory_xact_lock` sulla chiave persona) e conflitto sull'indice unico → "già iscritto". | Due richieste per l'ultimo posto: la seconda aspetta la prima e poi vede il lotto pieno. Il blocco è sul singolo tipo, non su tutto il sito. |
| **Capienza della serata** | solo conteggio (come oggi: serve a dire quanti posti restano dopo l'orario limite, non blocca nessuno). Vedi domanda 5. | Non serve un lock: è un'informazione. |
| **Tavolo già preso** | l'indice unico parziale `(tavolo_id) where attiva`. `prenota_tavolo(…)` prima chiude le richieste lasciate a metà dallo stesso cliente (stessa email/telefono) poi inserisce; se l'unico scatta → "Qualcuno ha appena preso questo tavolo". Stesso discorso per "un tavolo per cliente" (due unici parziali). | È il database a dire no, anche se le due richieste sono arrivate nello stesso millisecondo. |
| **Pagamento registrato una volta sola (webhook di Stripe, ritorno cliente, cron)** | funzione `conferma_pagamento_iscrizione(id, pagamento, centesimi, valuta, serata_chiusa, adesso)` e gemella per i tavoli. Prima riga: `insert into pagamenti … on conflict (id) do nothing`; se non inserisce niente → risponde `gia`. Poi blocca l'ordine (`for update`) e decide: ordine chiuso / serata chiusa / lotto pieno / doppione / tavolo ormai di un altro / importo sbagliato / secondo pagamento. Registra tutto nella stessa transazione. | Due webhook identici in parallelo: il secondo si ferma sulla chiave primaria del pagamento finché il primo non ha finito, poi trova che esiste già. Niente "metà confermato": o tutto o niente. Le 3 ragioni dipendenti dalle gare (`ordine_chiuso`, `lotto_pieno`, `doppione`, più il tavolo) le decide SQL; `serata_iniziata` e `importo` arrivano già decise dal codice. |
| **Scansione QR una volta sola** | un solo `UPDATE iscrizioni SET stato='entrato', ora_check_in=…, porta=… WHERE id=… AND stato IN ('pagato','in_lista') RETURNING …`. Se non restituisce righe, qualcuno è già entrato: si rilegge e si risponde "già entrato" con l'ora del primo. La decisione (orario limite, categoria, serata senza telefono) resta in `decidiIngresso`. | Un singolo `UPDATE` condizionato è atomico per natura. Con due telefoni offline che sincronizzano lo stesso QR, vince il primo che arriva al server (come oggi). |
| **Ingressi di un tavolo (fino a N persone)** | funzione `ingresso_tavolo(prenotazione, rif, ora, porta)`: blocca la prenotazione, se `rif` esiste già risponde "già contato", se gli ingressi ≥ `persone` risponde "completo", altrimenti inserisce. | Mai più persone del prenotato; la sincronizzazione ripetuta non conta doppio. |
| **Rimborso (Stripe) senza doppioni** | fase 1: `UPDATE pagamenti SET rimborso_stato='in_corso', rimborso_chiave=coalesce(rimborso_chiave, nuova), … WHERE id=… AND (rimborso_stato IS NULL OR (rimborso_stato='in_corso' AND avviato da più di 30 s))`; se 0 righe → "già fatto" o "già in corso". La stessa chiave viene riusata dopo un errore di rete, come ora. Fase 2: funzione `concludi_rimborso(pagamento)` che in una transazione segna `fatto` (solo se non lo è già), chiude l'ordine (`rimborsato`/`rimborsata`) e dice se è la prima volta (così l'email parte una volta sola). | Due clic o due webhook sullo stesso rimborso: uno solo passa. Il tavolo si libera da solo perché lo stato è derivato. |
| **Scadenze** (posti e tavoli non pagati) | `UPDATE … SET stato='scaduta' WHERE stato='in_attesa' AND scade <= now()`, idempotente; il conteggio dei posti già ignora le scadute. | Si può lanciare da più punti insieme senza effetti doppi. |
| **Accesso con link/codice** | link: `UPDATE accessi SET usato=true WHERE token_hash=… AND NOT usato AND scade > now() RETURNING utente_id`; codice: `UPDATE … SET tentativi = tentativi + 1 … RETURNING` (contatore atomico, blocco dopo 5). | Un link vale una volta sola anche se cliccato due volte insieme. |
| **Anonimizzazione dopo 30 giorni** | il codice calcola l'età alla serata (`anniCompiuti`, già testata) e aggiorna a lotti di 500 con `WHERE NOT anonimizzata`; idempotente. | Si può ripetere senza danni. |
| **Una sola serata in copertina** | indice unico parziale + funzione `imposta_copertina(id)` che spegne la vecchia e accende la nuova nella stessa transazione. | Due admin insieme non ne lasciano due. |

**Scritture dell'admin** (serate, tipi, tavoli, PR, staff…): una sola persona alla volta, nessuna gara critica. Per non riscrivere 25 funzioni a mano, la funzione `modifica()` attuale continua a funzionare così com'è per le **tabelle anagrafiche**: esegue la funzione su una copia, calcola cosa è cambiato riga per riga e applica solo quelle righe in una transazione, controllando `updated_at` (se qualcun altro ha cambiato *la stessa riga* nel frattempo, rilegge e riprova, come oggi ma solo per quella riga). Una guardia fa sbagliare *forte* (nei test) qualunque tentativo di cambiare iscrizioni, prenotazioni o pagamenti con `modifica()`: quelli passano solo dalle operazioni nominate sopra.

**Lettura**: nella prima fase `leggi()` continua a restituire l'oggetto `Archivio` intero, ma lo costruisce con **una sola chiamata** a una funzione `leggi_tutto()` che restituisce le tabelle in un solo JSON (un solo viaggio di rete, e nessun problema del limite di 1000 righe di Supabase). È una soluzione *di passaggio*: va bene finché i dati sono pochi; prima di serate vere con centinaia di prevendite si passa a letture per serata (tappa 8). Così tutti i punti del codice che oggi leggono l'archivio (ci sono 49 chiamate a `modifica(` e ~20 funzioni pure) restano come sono.

---

## 3. Passaggio dei dati

Stato reale online (solo conteggi): una riga `archivio_mvp` (versione 273, ~16 kB): 4 serate, 3 tipi di prevendita, 4 PR, 4 utenti (1 admin, 1 staff, 2 PR), 22 iscrizioni (21 pagate con pagamenti di prova, 1 annullata), 4 porte, 20 email di prova, 1 codice di accesso. Nessun tavolo, nessuna prenotazione, nessuna consegna, nessun rimborso. Controlli già fatti sulla riga: id tutti UUID, nessun doppione di slug/handle/email/QR/codice, nessun riferimento rotto (PR, tipo o serata mancanti), importi e date di nascita nel formato giusto, nessun doppione di persona nelle iscrizioni valide. **Quindi la copia non incontrerà sorprese note.**

### 3.1 Come si copia
- **Una funzione SQL `importa_archivio()`** (nella migrazione) che legge `archivio_mvp.dati` *dentro il database* e riempie le tabelle con `jsonb_to_recordset`, in una sola transazione, nell'ordine delle dipendenze (serate → tipi → PR → utenti → iscrizioni → tavoli → prenotazioni → pagamenti → resto). I dati personali non passano mai dal mio terminale né dal PC di nessuno.
- I `pagamentoOnline` di ogni ordine si "spezzano" in righe di `pagamenti` (principale e `in_piu`); lo `stato` dei tavoli non si copia (derivato).
- **Rilanciabile**: all'inizio svuota le tabelle nuove (solo se l'interruttore è ancora spento) e rifà la copia; registra la `versione` della riga che ha copiato. Quindi si può provare quante volte si vuole prima del passaggio vero.
- Il `segreto` si copia in `impostazioni`; la verifica confronta un'impronta (hash), mai il valore.

### 3.2 Come si verifica che siano uguali
Tre controlli, in ordine, tutti senza mostrare dati personali (solo "OK" o i *nomi* dei campi che differiscono):
1. **Conteggi** per tabella (SQL): righe nel jsonb = righe nelle tabelle, per ogni gruppo.
2. **Confronto completo in TypeScript**: `leggi_tutto()` ricostruisce l'oggetto `Archivio` dalle tabelle; il test lo confronta con l'archivio normalizzato della riga, serata per serata e iscrizione per iscrizione. Il confronto è *completo nelle chiavi* (ogni chiave presente nel jsonb deve ritrovarsi, a parte l'elenco esplicito dei campi non portati: cassa, consegne) e confronta le date come istanti. Il codice che scrive (SQL) e quello che legge (TypeScript) sono indipendenti: un campo perso da uno dei due si vede.
3. **Impronta del segreto** uguale nelle due parti, e stessa `versione` di `archivio_mvp` prima e dopo (se è cambiata durante la copia, qualcuno ha scritto: si rifà).

Il controllo 2 è disponibile in due modi: come test automatico (sui dati del `seed` e su scenari costruiti: pagamento doppio, rimborso in corso, tavolo prenotato, serata anonimizzata…) e come pagina solo-admin `/api/admin/verifica-archivio` che gira sui dati veri e restituisce solo esiti e nomi di campi.

### 3.3 Come si prova prima di toccare il database vero
- **Nei test**: un Postgres vero *dentro* `npm test` ([PGlite](https://pglite.dev), un Postgres compilato in WebAssembly, nessun Docker da installare). **Verificato nella tappa 1**: regge `for update`, indici unici parziali, `security definer`, `jsonb_to_recordset`, `pg_advisory_xact_lock`, ruoli e RLS. **Limite scoperto**: PGlite ha una sola connessione, quindi le richieste "in parallelo" si mettono in fila invece di intrecciarsi: i test provano le regole (esiti, indici, atomicità di ogni funzione, 50 iscrizioni per 10 posti → 10 vanno e 40 no, lo stesso pagamento 20 volte → una sola registrazione, lo stesso QR da 5 telefoni → un solo ingresso), ma non l'attesa reciproca dei blocchi tra connessioni diverse. Quella si prova solo su un Postgres vero: per questo il secondo progetto Supabase di prova (domanda 2) o Postgres con Docker passano da "comodo" a **consigliato prima del passaggio**.
- **Su Supabase**: idealmente un secondo progetto gratuito di prova (domanda 2) con Vercel Preview collegata; altrimenti solo i test sopra e il passaggio con ritorno indietro facile.

### 3.4 Il passaggio vero (una volta, ~2 minuti, in un momento senza vendite né porta)
1. Applicare le 3 migrazioni (con il tuo sì ogni volta). Non cambia niente per il sito.
2. `importa_archivio()` → verifica (1-2-3 sopra). Si può ripetere finché non è tutto OK.
3. Subito prima: controllare che `versione` di `archivio_mvp` non sia cambiata; poi girare su Vercel `MM_ARCHIVIO=tabelle` e rifare il deploy (~1 minuto). Prima ancora, la pagina di verifica conferma "tabelle = riga".
4. Controllo a vista: `curl` della home (deve rispondere 200, come dopo ogni merge), apertura di una serata, accesso come admin, una scansione di prova.
5. La riga `archivio_mvp` viene "congelata" (resta com'è, il sito non la scrive più).

**Finestra**: nessuna chiusura del sito. L'unico rischio è una scrittura fatta tra il punto 2 e il punto 3 (pochi secondi): il controllo della `versione` la rileva e in quel caso si ripete la copia prima di girare l'interruttore. Per questo la scelta di un momento tranquillo.

### 3.5 Tornare indietro
- **Prima di girare l'interruttore**: basta non girarlo. Le tabelle nuove non le usa nessuno; si possono anche svuotare.
- **Dopo, nei primi giorni**: riportare `MM_ARCHIVIO` al valore di prima e rifare il deploy rimette in uso la riga vecchia. Se nel frattempo sono arrivate scritture reali nelle tabelle, prima si lancia l'operazione "ripristina nella riga" (usa lo stesso codice che ricostruisce l'`Archivio` dalle tabelle e lo scrive in `archivio_mvp`: nessun SQL in più da mantenere). Questa operazione si prova nei test.
- **La riga vecchia resta** almeno 14 giorni dopo il passaggio, poi si **ripulisce dai dati personali** e infine si elimina (serve il tuo sì). Il vecchio codice (`archivio-remoto.ts`) si toglie solo con la tappa finale.

---

## 4. Tappe

Strategia: **un solo interruttore globale (`MM_ARCHIVIO`), spento di default, e nessuna doppia scrittura.** Il codice nuovo arriva in `main` a pezzi piccoli ma *dormiente*: finché l'interruttore è spento il sito usa la riga come oggi. Ho scartato la doppia scrittura (scrivere su riga e tabelle insieme) perché con 22 righe di prova non serve, crea due "verità" che possono divergere e raddoppia il codice da provare. Ho scartato anche l'interruttore per area (serate, vendite, porta…) perché le aree si riferiscono l'una all'altra (un'iscrizione punta a serata, tipo e PR): metà nelle tabelle e metà nella riga renderebbe impossibili le chiavi esterne. Con pochi dati e nessun incasso vero, la strada più semplice e sicura è: costruire tutto, provarlo a fondo, copiare, girare l'interruttore una volta, con il ritorno indietro pronto.

Regola per ogni PR: *funziona anche prima che la migrazione sia applicata online* (con l'interruttore spento il codice non nomina mai le tabelle nuove) e *il sito non va in 500* (la route di salute `/api/salute` segnala se l'interruttore è acceso ma le tabelle mancano). Ogni PR passa dalla chat di revisione.

| # | Tappa | Cosa fa | Sicura prima/dopo la migrazione | Come si prova | Taglia |
|---|---|---|---|---|---|
| 1 | **Schema anagrafiche + importatore** | Migrazione 1: `eventi`, `lotti`, `pr`, `utenti`, `impostazioni`, `porte`, `posta_inviata`, `importa_archivio()` per questi gruppi. Aggiunge PGlite ai test di sviluppo. | Solo SQL e test, nessun codice dell'app lo usa. | Test: migrazione + import dei dati del `seed`; `get_advisors`. | ~350 righe SQL + ~250 di test |
| 2 | **Schema vendite + funzioni atomiche** | Migrazione 2: `iscrizioni`, `pagamenti`, `accessi` e le funzioni di 2.4 (iscrizione, conferma pagamento, rimborso, check-in, accessi, scadenze). Estende `importa_archivio()`. | Come sopra: nessun uso. | **Test di gara in sequenza su PGlite** (posti, webhook doppio, QR doppio, rimborso doppio); prova con connessioni vere sul progetto di prova; import di scenari. | ~500 righe SQL + ~500 di test |
| 3 | **Schema tavoli + resto** | Migrazione 3: `tavoli`, `prenotazioni_tavoli`, `ingressi_tavoli`, vista `tavoli_con_stato`, funzioni `prenota_tavolo`, `ingresso_tavolo`, `imposta_copertina`; estende l'importatore. | Come sopra. | Test di gara sui tavoli (stesso tavolo da 20 richieste insieme). | ~300 righe SQL + ~300 di test |
| 4 | **Lettura dalle tabelle (spenta)** | `leggi_tutto()` + modulo di traduzione tabelle ↔ `Archivio`; `archivio.ts` sceglie il lato con `MM_ARCHIVIO` (spento = come oggi); pagina `/api/admin/verifica-archivio`; "ripristina nella riga". | Spento: nessun cambiamento. Acceso senza tabelle: errore chiaro in `/api/salute`, non una pagina rotta. | Test "tabelle → Archivio = riga normalizzata"; `npm test` + typecheck; `curl` della home dopo il merge. | ~400 righe |
| 5 | **Scritture anagrafiche** | `modifica()` per le tabelle anagrafiche (cambiamenti riga per riga con controllo `updated_at`) + la guardia contro le tabelle di vendita. | Con interruttore spento usa la riga come oggi. | Test dei permessi esistenti (`permessi.test.ts`) lanciati su entrambi i lati; test di conflitto sulla stessa riga. | ~350 righe |
| 6 | **Vendite: prevendite, pagamenti, rimborsi** | `pubblico.ts` (iscrizione), `prevendita.ts` (conferma, scadenze, anonimizzazione), `rimborsi.ts`, parti di `admin.ts` sulle iscrizioni passano alle operazioni nominate; ramo jsonb invariato. | Il ramo jsonb non si tocca; il ramo tabelle è dormiente. | `rimborsi.test.ts` e `permessi.test.ts` su entrambi i lati; gara su webhook e rimborsi. | ~600 righe |
| 7 | **Vendite: tavoli, porta, accessi, posta** | `tavoli.ts`, `porta.ts` (check-in, ingressi tavolo, "non rientra", porte), `sessione.ts` (accessi), `posta.ts`, `invio-link-serata.ts`. | Come sopra. | Test sulla porta con scansioni ripetute e offline, tavoli in parallelo. | ~600 righe |
| — | **PASSAGGIO** (nessun codice) | Sezione 3.4: migrazioni, copia, verifica, interruttore, controllo a vista, congela la riga. | Ritorno indietro in 3.5. | Pagina di verifica + `curl` + giro a mano su admin, PR, porta. | tu + io, ~2 min |
| 8 | **Letture per serata** (prima di serate vere) | `leggi()` intero diventa letture mirate (porta, pagina serata, area PR, admin serata) con paginazione esplicita; l'oggetto intero resta solo dove serve davvero. | Con dati veri alleggerisce le richieste (alla porta il telefono sincronizza spesso). | Test con 5.000 iscrizioni finte e tempi misurati. | ~500 righe |
| 9 | **Pulizia** (dopo ≥ 14 giorni senza problemi) | Via il codice jsonb (`archivio-remoto.ts` e relativi test), via `consegne`/`origine` dai tipi, `foto_serate.evento_id` → `uuid` con chiave esterna, ripulire e poi eliminare `archivio_mvp` (con il tuo sì). | Solo dopo che le tabelle sono in uso stabile. | Test + `get_advisors`. | −800 righe circa |

Le tappe 1-3 si possono sviluppare in parallelo solo se non toccano gli stessi file (sono tre file SQL diversi, ma l'`importa_archivio()` è comune: meglio una dopo l'altra). Dopo la 3 tutto è pronto per il passaggio *a livello di database*; dopo la 7 anche a livello di codice. Tempo indicativo: 6-8 sessioni di lavoro più la tua parte; il rischio principale (tappa 2: gare e pagamenti) merita una revisione più attenta delle altre.

### Rischi residui che tengo d'occhio
- **Regole duplicate fra SQL e TypeScript** (posti pieni, doppione, tavolo preso). Le tengo al minimo (solo quelle dipendenti dalle gare), le provo con gli stessi casi sui due lati e le elenco nella descrizione della PR.
- **Il mio fidarmi di PGlite**: se non regge `for update` o gli indici parziali, passo a Postgres in Docker per i test di gara (lo scopro nella tappa 1).
- **Differenze di formato** (date, numeri, `null` contro stringa vuota per i dati anonimizzati: oggi `''`, in tabella `null`): il traduttore le uniforma e il confronto le tratta come uguali; è il punto dove cercherei per primo se la verifica mostrasse una differenza.
- **Cron e webhook durante il passaggio**: il cron dei tavoli gira alle 08:00; non fare il passaggio in quella finestra.

---

## 5. Domande aperte (5)

1. **Quando facciamo il passaggio?** Serve un momento senza vendite e senza porta, una ventina di minuti con calma. *Raccomando* un giorno infrasettimanale mattina, lontano dalle serate in vendita (il cron dei tavoli è alle 08:00: meglio dopo le 09:00) e prima del collaudo di Stripe. Mi dici tu le date in cui davvero ci sono vendite: online ci sono Solchi (7.11) e Capodanno, ma non so se sono serate vere o esempi.
2. **Possiamo avere un secondo progetto Supabase gratuito per le prove?** Sul tuo account amico, vuoto, con dati finti: lì proverei tutto e il passaggio intero con Vercel Preview, prima di toccare quello vero. *Raccomando sì*: costa zero e toglie quasi tutta l'ansia del giorno del passaggio. Se l'amico preferisce no, mi affido ai test e al ritorno indietro.
3. **Che piano ha Supabase sul progetto dell'amico, e ci sono backup?** Se è il piano gratuito, i backup sono limitati; dal momento in cui ci sono soldi veri servono backup giornalieri (e meglio il ripristino a un istante preciso). *Raccomando* di passare al piano a pagamento prima del lancio (circa 25 $/mese, da verificare con l'amico). Per il passaggio in sé non è necessario: la riga vecchia fa da copia.
4. **Anche le prenotazioni dei tavoli vanno anonimizzate dopo 30 giorni?** Oggi la regola vale solo per le iscrizioni; le prenotazioni dei tavoli conservano nome, email e telefono per sempre. *Raccomando sì*, stessi 30 giorni, tenendo serata, tavolo, persone, spesa minima, PR e ingressi. Va deciso col cliente (è anche una questione di privacy da dichiarare nelle condizioni).
5. **La capienza della serata deve diventare un limite vero?** Oggi serve solo a mostrare quanti posti restano dopo l'orario limite e non blocca nessuno alla porta. *Raccomando* di lasciarla informativa: chi ha un QR valido non va mai bloccato da un contatore, e il rischio di errori alla porta supera il vantaggio.

### Scelte che ho fatto io (dimmi se non ti vanno)
- Cassa e consegne non vengono portate nello schema (nessun dato online le usa).
- Le 20 email di prova non si copiano; in futuro il registro delle email dura 30 giorni.
- La riga `archivio_mvp` resta 14 giorni, poi si ripulisce dai dati personali e si elimina.
- Le 22 iscrizioni di prova si copiano (servono a verificare la copia); la pulizia dei dati di prova prima del lancio è un lavoro a parte.

---

## Appendice: com'è andata la tappa 2 (4-5.11.2026)

Scelte fatte scrivendo la migrazione `20261105000000_schema_vendite.sql`, dove si è scostata dal piano:
- **La chiave "stessa persona" la calcola il database** (`chiave_cognome()`), non la passa il codice: così righe copiate e righe nuove usano la stessa funzione. Un test la confronta con `chiaveCognome()` di `lib/regole.ts` su 24 cognomi (accenti, apostrofi, `ß`, `ø`, `İ`…).
- **Il check-in è una funzione** (`segna_ingresso`) che contiene l'`UPDATE` condizionato, invece di un `UPDATE` scritto dal codice: stesso effetto, ma si prova una volta sola.
- **`concludi_rimborso` mette `da_rimborsare = false`** per ogni pagamento rimborsato (principale o "in più"), e dice con `chiusa_ordine` se ha chiuso l'ordine per la prima volta (l'email al cliente parte solo allora).
- **Persona che paga due volte insieme**: `conferma_pagamento_iscrizione` prende lo stesso blocco sulla persona di `crea_iscrizione`, così due richieste della stessa persona che pagano insieme non arrivano mai a scontrarsi con l'indice "un QR a persona": una conferma, l'altra va restituita con motivo `doppione`.
- **La copia si ferma** (con un errore chiaro, senza copiare niente) davanti a ingressi in cassa, consegne, tavoli e prenotazioni: le prime due cose le tabelle non le portano, le altre arrivano con la tappa 3. Gli accessi di utenti che non esistono più non si portano. Una prevendita "in attesa" senza termine (oggi non ce ne sono) vale come già scaduta.
- **Test di gara**: pronti (`npm run test:gara`), da far girare sul database di prova. Con PGlite dietro un server si è solo verificato che gli script girino.

## Appendice: com'è andata la tappa 3 (5.11.2026)

Migrazione `20261106000000_schema_tavoli.sql` (tavoli, prenotazioni, ingressi, vista `tavoli_con_stato`, funzioni). Scelte e scostamenti dal piano:
- **Si applica solo dopo le tappe 1 e 2**: in cima c'è un controllo che si ferma con un errore chiaro, senza creare niente, se mancano.
- **Lo stato del tavolo è derivato** (vista): `libero`, `riservato` (richiesta in attesa nel termine), `confermato`, `non_in_vendita`. Nessun codice deve più ricordarsi di liberare il tavolo.
- **Blocco sempre nello stesso ordine: prima il tavolo, poi la prenotazione** (`prenota_tavolo` e `conferma_pagamento_prenotazione`): niente blocchi incrociati. Le richieste scadute decadono solo per il tavolo richiesto e, per un cliente, per le sue: così due richieste su tavoli diversi non si contendono le stesse righe.
- **Un cliente, un tavolo**: il controllo dice di no se *qualunque* richiesta attiva della serata (anche inserita da un PR) ha la stessa email o lo stesso numero; gli indici unici proteggono solo le richieste dei clienti, come nel codice. Una pagina di pagamento lasciata a metà dallo stesso cliente si chiude e si riparte (regola di `lib/dati/tavoli.ts`): se due richieste dello stesso cliente si vedono, vince l'ultima; quello che non succede mai è che ne restino due aperte.
- **Anonimizzazione dei tavoli: la durata è un parametro** (`anonimizza_prenotazioni(p_giorni)`, obbligatorio e senza valore predefinito): si decide col cliente; cancella nome, cognome, email e telefono e lascia serata, tavolo, persone, spesa minima, PR, pagamenti e ingressi.
- **Altre funzioni**: `annulla_prenotazione` (una volta sola, mai le pagate), `scadenze_prenotazioni`, `avvisi_chiusura` e `promemoria_prenotazioni` (segnano e restituiscono gli id: l'email parte una volta sola), `ingresso_tavolo` (fino al numero prenotato, un `rif` ripetuto non conta), `concludi_rimborso` esteso ai tavoli.
- **`importa_archivio()` e `verifica_importo()`** coprono ora tutto: tavoli, prenotazioni, ingressi e pagamenti dei tavoli. Un errore trovato scrivendo i test: nella verifica l'alias `x` dell'elemento JSON veniva scambiato con la colonna `x` (posizione) dei tavoli; ora l'alias è `el`.
- **Prove**: 17 test su PGlite e 13 test di gara su un Postgres vero (tre giri di fila, tutti verdi, prima che il progetto di prova venisse fermato). Le funzioni `importa_archivio()` e `verifica_importo()` con i tavoli sono provate solo su PGlite.

## Appendice: com'è andata la tappa 4 (5.11.2026)

Migrazione `20261107000000_leggi_tutto.sql` (una sola funzione, `leggi_tutto()`) e il codice che la usa, tutto spento di default.
- **`leggi_tutto()`** restituisce in un solo viaggio tutte le tabelle come righe JSON; `lib/dati/tabelle.ts` le ricompone nell'`Archivio` che il resto del codice conosce (`componiArchivio`). Le righe anonime tornano con stringhe vuote come nella riga unica; lo stato dei tavoli e gli ingressi per porta si calcolano.
- **`MM_ARCHIVIO`**: `tabelle` solo con Supabase configurato; qualunque altro valore (anche scritto male) = riga unica, così il sito non va mai in errore per una variabile. Con l'interruttore acceso `leggi()` legge dalle tabelle e `modifica()` si ferma con un errore chiaro: la scrittura arriva con le tappe 5-7 e non si scrive "da un'altra parte" per sbaglio.
- **Confronto campo per campo** (`confrontaArchivi`): restituisce solo i *nomi* dei campi che differiscono (`iscrizioni[3f9a1c2b].stato`), mai i valori. Non confronta ciò che le tabelle non portano o calcolano: registro delle email, consegne, campi della cassa, ingressi per porta; le date si confrontano come istanti; lo stato dei tavoli si calcola dalle prenotazioni sui due lati. Provato anche con serate e tipi salvati prima dei campi nuovi.
- **Strumenti admin**: `GET /api/admin/verifica-archivio` (confronto + `verifica_importo()`) e `POST /api/admin/ripristina-riga` (il ritorno indietro: riscrive la riga unica con le tabelle, solo con l'interruttore acceso, con conferma esplicita, mai con le tabelle vuote).
- **`/api/salute`** mostra l'interruttore e, se acceso, controlla che `leggi_tutto()` risponda.
- **Non provato su Supabase**: il progetto di prova era già stato fermato; `leggi_tutto()` è provata su PGlite. Da fare appena c'è un Postgres vero: applicare la migrazione e chiamare `GET /api/admin/verifica-archivio` su dati copiati.

## Appendice: com'è andata la tappa 5 (5.11.2026)

Migrazione `20261108000000_applica_anagrafiche.sql` (una funzione, `applica_anagrafiche()`) e il codice che la usa, sempre dietro `MM_ARCHIVIO` (spento di default).
- **Come si scrive**: `modifica(fn)` sulle tabelle funziona come prima (la funzione modifica una copia dell'`Archivio`), poi `calcolaModifiche` (`lib/dati/scrittura-tabelle.ts`) confronta prima e dopo *riga per riga*: righe nuove, colonne cambiate e righe tolte. Si manda solo questo a `applica_anagrafiche()`, che lo applica in una transazione.
- **Niente colonna di versione**: per ogni riga cambiata o tolta il codice rimanda la riga com'era quando l'ha letta; la funzione la blocca (`for update`) e la confronta con quella attuale. Se è diversa risponde `conflitto_scrittura`, non applica niente (nemmeno le altre righe) e il codice rilegge e rifà tutta la funzione sui dati nuovi (fino a 12 volte). Due persone che toccano righe diverse non si disturbano mai; due che toccano la stessa riga non perdono nessuno dei due cambiamenti.
- **Solo sette tabelle**: eventi, pr, utenti, lotti, tavoli (la configurazione), porte, posta_inviata. Qualunque altra tabella (iscrizioni, pagamenti, accessi, prenotazioni, impostazioni) è rifiutata dalla funzione. Il nome delle colonne da cambiare è controllato contro l'elenco vero delle colonne della tabella; le chiavi non si cambiano.
- **Cose derivate non sono modifiche**: lo stato dei tavoli (libero / riservato / confermato), gli ingressi per porta e le date riscritte in un altro fuso non producono scritture; "non in vendita" sì.
- **La guardia sulle vendite**: se la funzione modifica iscrizioni, prenotazioni, accessi, consegne o il segreto, `modifica()` si ferma con un errore che lo dice e non scrive nemmeno le anagrafiche della stessa modifica. Vale finché non arrivano le tappe 6-7.
- **Il registro delle email** si legge ora con le più recenti per prime, come lo tiene l'archivio (`inviaEmail` le mette in testa e taglia le vecchie).
- Un errore scoperto scrivendo i test: nelle interrogazioni dinamiche l'alias `x` della tabella veniva scambiato con la colonna `x` (posizione) dei tavoli; ora l'alias è `riga`.
- **Prove**: 15 test su PGlite, tra cui una serie di modifiche tipiche dell'admin (serate, tipi, PR, utenti, tavoli, porte, email) applicate e poi ricomposte uguali, conflitti, riprove, errori; 4 test di gara con più "istanze" (nessun aggiornamento perso, righe diverse che non si disturbano, due PR uguali insieme, serata cambiata e tolta insieme). Le gare non sono passate su un Postgres vero (progetto di prova fermo); gli script sono verificati solo dietro un server PGlite.

## Appendice: com'è andata la tappa 6 (5.11.2026)

Le prevendite sulle tabelle, dietro `MM_ARCHIVIO` (spento di default). Migrazione `20261109000000_operazioni_vendite.sql` e il codice che la usa.
- **Come funziona**: ogni funzione delle vendite ha due strade. Con la riga unica fa quello che faceva (nessuna riga è cambiata di significato); con le tabelle prende le decisioni di sempre in TypeScript (età, link del PR, orario limite, importo giusto) e poi affida al database quello che può andare storto con richieste simultanee, tramite le funzioni SQL delle tappe 2-3 e 6: `crea_iscrizione`, `conferma_pagamento_iscrizione`, `avvia_rimborso` / `rimborso_respinto` / `concludi_rimborso`, `scadenze_iscrizioni`, `anonimizza_iscrizioni`, e le quattro nuove `salva_sessione_iscrizione`, `lascia_posto`, `cambia_stato_iscrizione`, `cambia_nominativo`.
- **`creaIscrizione`** è stata divisa in due: una decisione (`valutaIscrizione`) uguale per le due strade, e la scrittura (la riga unica la fa dentro `modifica`, le tabelle con `crea_iscrizione`). Il database ridecide da solo ultimo posto, stessa persona insieme e richiesta già aperta.
- **Rimborsi**: i tre passi (avvia, respinto, concludi) e il rimborso fatto dalla dashboard di Stripe valgono per prevendite e tavoli; l'email al cliente parte solo quando `concludi_rimborso` dice di aver chiuso l'ordine per la prima volta.
- **Annulla / ripristina**: il controllo "un QR solo a persona" usa ora la stessa chiave del database (`chiave_cognome`, senza accenti) invece del solo minuscolo. È l'unica differenza voluta rispetto alla riga unica: più severa e coerente con l'indice unico.
- **La prova principale** (`vendite-tabelle.test.ts`): la STESSA storia di una cinquantina di passi (iscrizioni, doppioni, minorenni, pagamenti ripetuti e in più, importo sbagliato, pagamento dopo l'orario limite, rimborsi in tutte le fasi, lascia il posto, scadenze, anonimizzazione, annulla e ripristina, cambio di nominativo, un tipo gratuito salvato dall'admin) viene fatta girare due volte, con la riga unica e con le tabelle; esiti, messaggi di errore e dati finali devono essere identici.
- **Non ancora sulle tabelle** (tappa 7): tavoli (prenotazione, pagamento, annulla, scadenze, promemoria), porta (check-in, ingressi dei tavoli, "non rientra", porte), accessi (link e codice) e invio email. Con l'interruttore acceso queste funzioni si fermano con l'errore chiaro della tappa 5.
- **Prove**: 14 test nuovi su PGlite (il confronto a due strade, le quattro funzioni nuove nei loro casi, la forma delle risposte) e 4 test di gara (lascia il posto e annulla ripetuti, due nominativi verso la stessa persona, ripristina contro nuova iscrizione). Gli script di gara sono verificati solo dietro un server PGlite.

## Appendice: com'è andata la tappa 7 (5.11.2026)

Tavoli, porta e accessi sulle tabelle, dietro `MM_ARCHIVIO` (spento di default). Migrazione `20261110000000_operazioni_tavoli_porta.sql` e il codice che la usa. Con questa tappa **tutte le scritture dell'app hanno la loro strada sulle tabelle**: anagrafiche (tappa 5), prevendite (tappa 6), tavoli, porta e accessi (qui). Il passaggio vero (sezione 3.4) può farsi appena le sette tappe sono in main.
- **Tavoli** (`lib/dati/tavoli.ts`): richiesta (cliente, PR, crew), annulla, lascia il tavolo, scadenze, avvisi di chiusura, promemoria, sessione di pagamento e pagamento. Il codice controlla quello che non dipende dalle gare (serata pubblicata e non iniziata, link del PR, tavolo affidato al PR); il database decide tavolo preso, limiti del cliente (un tavolo per email e per telefono) e pagamento registrato una volta sola. `prenota_tavolo` controlla ora anche i posti del tavolo (`troppe_persone`), nell'ordine in cui li controllava il codice: tavolo preso, poi posti, poi i limiti del cliente.
- **Porta** (`lib/dati/porta.ts`): `checkIn` decide come prima (`decidiIngresso`) e affida al database "una volta sola": `segna_ingresso` per le prevendite, `ingresso_tavolo` per i tavoli (mai più persone del prenotato, la stessa sincronizzazione ripetuta non conta due volte). Se qualcuno è arrivato prima il codice ridecide sui dati nuovi (già entrato, tavolo completo…). Il "non rientra" è `rifiuta_ingresso`. Lo stato delle porte (`segnaPorta`) usa già la scrittura delle anagrafiche.
- **Accessi** (`lib/sessione.ts`): `crea_accesso` (toglie i vecchi dello stesso utente e quelli scaduti o usati), `usa_accesso_token` (il link vale una volta sola) e `usa_accesso_codice` (cinque tentativi, contatore atomico).
- **Email**: il registro di prova passa già dalla scrittura delle anagrafiche, con le più recenti per prime.
- **Prova**: la stessa storia di tavoli, porta ed email (richieste, pagamenti, rimborso di un tavolo, scadenze, avvisi, promemoria, check-in di prevendite e tavoli, "non rientra", stato delle porte, email) fatta girare con la riga unica e con le tabelle: esiti, messaggi e dati finali identici. Gli accessi con link e codice (che passano dai cookie del browser) sono provati a livello di funzione SQL, non dalla storia.
- **Resta fuori da queste sette tappe**: le letture per serata (tappa 8, "prima di serate vere") e la pulizia dopo il passaggio (tappa 9).
