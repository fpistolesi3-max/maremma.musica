# Il passaggio dalla riga unica alle tabelle: scaletta

Stato (5.11.2026): **preparata, non ancora eseguita.** Il database ha già le 7 migrazioni e la copia di prova è riuscita. L'interruttore non è più una variabile di Vercel da girare a mano: **è la PR che rende `tabelle` il predefinito della produzione.** Il passaggio avviene quando la regia unisce quella PR in `main`, col sì dell'utente, subito dopo la copia finale (4.2).
Riferimenti: `docs/PIANO-SCHEMA.md` (sezioni 3.4 e 3.5). Nessun segreto e nessun dato personale è scritto qui.

---

## 0. Cosa è già vero (controllato il 5.11.2026)

- Le 7 migrazioni sono applicate sul database vero (progetto `iowbljhcjfppjjwbumsm`). Le tabelle nuove hanno RLS accesa e le funzioni non sono eseguibili da anon/authenticated.
- La prova generale (`importa_archivio()` + `verifica_importo()` + confronto campo per campo di serate e iscrizioni dentro il database) è andata: conteggi uguali, 0 differenze, segreto uguale.
- Sul sito online le route `/api/admin/verifica-archivio` e `/api/admin/ripristina-riga` esistono già (rispondono 401 senza accesso). Il codice delle tappe 6-7 (vendite, tavoli, porta, accessi sulle tabelle) è in `main` dalla PR #58 e il deploy della PR di passaggio lo include comunque.
- **Vercel non è raggiungibile dall'utente né dal connettore:** il progetto è sull'account dell'amico (team `fpistolesi3-2138`). Tutto ciò che richiede variabili o pannello Vercel passa da lui; il passaggio è pensato per non averne bisogno.
- Stato dei dati: Halloween Party ha tutte le 22 iscrizioni (21 valide); Ricky Le Roy 0; Solchi (7.11) e Capodanno in pineta (31.12) 0 iscrizioni, 1 tipo di prevendita ciascuna. **Le serate vere (Ricky Le Roy, Halloween Party) non si toccano**, nemmeno per le prove.

## 1. Il segreto dei QR: c'è un rischio?

Come lo usa il codice (`lib/dati/archivio.ts`, funzione `segreto()`):

```
segreto = MM_SEGRETO (variabile Vercel)  se c'è   →   altrimenti il segreto salvato nell'archivio
```

- Oggi: `/api/salute` dice che `MM_SEGRETO` **c'è** su Vercel → il sito firma e controlla QR, codici e cookie di accesso con la variabile, non con quello del database.
- Dopo il passaggio: la regola è la stessa. La variabile vince ancora; il segreto nelle tabelle (`impostazioni.segreto`, copia identica di quello della riga) serve solo se la variabile sparisce.
- **Quindi il passaggio non cambia il segreto usato: nessun QR già emesso smette di valere.** Anche i cookie di accesso restano validi (stesso segreto, stessi id utente).

Un fatto in più, trovato controllando le firme dei QR dentro il database senza mai mostrare i segreti:

| QR di Halloween Party | quanti | firmati col segreto salvato nel database |
|---|---|---|
| creati l'8–10 ottobre | 17 (tutti validi) | **sì** |
| creati il 10–29 ottobre | 5 (4 validi) | **no** |

Lettura più probabile: il valore di `MM_SEGRETO` su Vercel è **diverso** da quello del database; i 5 QR recenti sono firmati con la variabile (che oggi vince), i 17 più vecchi col segreto del database e quindi già oggi non passano il controllo alla porta. Non l'ho potuto confermare (il valore della variabile non si legge). Conseguenze:
1. Per il passaggio: nessuna. `MM_SEGRETO` non va toccata né tolta.
2. Rischio latente, non causato dal passaggio: se un giorno `MM_SEGRETO` viene tolta o cambiata, i 4 QR validi recenti smettono di valere. Prima delle serate vere conviene scegliere un segreto definitivo, tenerlo sempre su Vercel e allineare `impostazioni.segreto` (gli ultimi QR sono quasi certamente di prova).

### Allineare il segreto dal sito (nessun accesso a Vercel)
`POST /api/admin/allinea-segreto` (solo admin; pulsante «Allinea la chiave dei QR» in **Admin → Staff → Chiave segreta dei QR**) copia il valore di `MM_SEGRETO` nel segreto del database attivo (`impostazioni.segreto` sulle tabelle, il campo della riga unica altrimenti). Senza variabile, o con il database già uguale, non scrive niente. Risponde solo `{ ok, allineato, motivo }`: il valore non compare mai, né nella risposta né nei log.
- Dopo l'allineamento `/api/admin/verifica-archivio` e `verifica_importo()` **non vanno in errore**, ma segnalano `segreto` diverso dalla riga vecchia (`ok: false`, `differenze: ["segreto"]`, `segreto_ok: false`). **È atteso**: la riga `archivio_mvp` è ferma e conserva il segreto vecchio. Non va corretto.
- Per lo stesso motivo il ritorno indietro (`ripristina-riga`) riscrive la riga con il segreto nuovo, che è quello giusto.
- Se qualcuno rilancia `importa_archivio()` (solo con l'interruttore a `jsonb`) il segreto delle tabelle torna a essere quello della riga: in quel caso rilanciare l'allineamento.

## 2. Cosa gira da solo (e quando è tranquillo)

| Cosa | Quando | Cosa fa |
|---|---|---|
| Cron `/api/cron/tavoli` (`vercel.json`: `0 8 * * *`) | ogni giorno alle **08:00 UTC = 09:00 ora italiana** (in inverno). Su piano gratuito Vercel può partire in un punto qualsiasi dell'ora (08:00–08:59 UTC). | controlla da Stripe i pagamenti in sospeso, chiude prevendite e prenotazioni scadute, manda promemoria/avvisi, anonimizza le iscrizioni vecchie di 30 giorni |
| Webhook Stripe `/api/pagamenti/stripe` | solo quando qualcuno paga (o rimborsa) | registra il pagamento |
| Telefoni alla porta `/api/door` | solo la sera di una serata | sincronizzano gli ingressi |
| Scadenze "pigre" | quando qualcuno apre la pagina di un biglietto, un tavolo o l'admin | scrivono **solo se c'è qualcosa di scaduto** |
| Accessi di PR, staff e admin (link/codice) | quando qualcuno fa il login | scrivono un accesso e una email nel registro |

**Finestra tranquilla: da 09:00 UTC (10:00 italiane) fino al giorno dopo alle 08:00 UTC (09:00 italiane).** Tra 08:00 e 09:00 UTC non fare niente. Nessuna serata con porta aperta: Halloween è passata, Solchi è il 7.11 (meglio fare il passaggio prima, così c'è tempo di accorgersi di problemi).
Il primo cron dopo il passaggio (il giorno dopo, 09:00 italiane) gira già sulle tabelle. Non servono i log di Vercel per provarlo: vedi 4.6 (chiamata manuale).

### Punto aperto: il cron è aperto
`/api/cron/tavoli` oggi risponde a **chiunque**, senza segreto: `CRON_SECRET` non è impostata e, in modalità prova (`MM_MODALITA_PROVA=1`), il codice autorizza la chiamata senza segreto. Il README dice invece che è protetta. Il 5.11 alle 09:00 UTC l'ho chiamata una volta per controllare: tutti zeri, ha solo fatto salire la `versione` della riga da 277 a 279 senza cambiare contenuti. **Da chiedere all'amico, su Vercel, prima delle serate vere:** impostare `CRON_SECRET` (valore casuale lungo, solo Production) e fare Redeploy; dopo, `curl https://maremma-musica.vercel.app/api/cron/tavoli` deve rispondere 401 (Vercel manda il segreto da solo quando lancia il cron). Non blocca il passaggio.

## 3. Chi fa cosa

- **La regia:** lancia i comandi SQL (con il connettore Supabase) e unisce la PR di passaggio in `main`, entrambi col sì dell'utente. Prima di ogni scrittura SQL dice in una riga cosa sta per lanciare.
- **L'utente, con le sue mani:** restare **entrato come admin** in una finestra del browser per tutto il passaggio; aprire due indirizzi nel browser (4.3 e 4.6); non usare né far usare il sito durante la finestra; fare i giri di prova (login in finestra privata, acquisto di prova, scansione).
- **L'amico (solo se serve):** Instant Rollback su Vercel (5.B.1) e, a parte, `CRON_SECRET`.

## 4. La scaletta, passo per passo

Durata stimata: circa 40 minuti in tutto. Il tempo in cui le scritture sul sito andrebbero perse è quello **dall'unione della PR al deploy `Ready`: circa 2-3 minuti**, per questo nessuno deve usare il sito.

### 4.0 Prima
1. La PR di passaggio è passata dalla Revisione ed è pronta (test, tipi e build verdi).
2. L'utente entra come admin in una finestra del browser e **la lascia aperta** (la sessione dura 30 giorni; il login dopo il passaggio si prova in una finestra privata a parte, così non si rischia di restare fuori).
3. Orario: dalle 10:00 italiane in poi (mai tra le 09:00 e le 10:00).

### 4.1 Silenzio
Avvisare chi lavora sul sito (PR, staff, amico) di non entrare né vendere/prenotare fino a fine controlli.

### 4.2 Copia finale (SQL, regia) — subito prima dell'unione
```sql
-- (a) la riga com'è adesso
select versione, updated_at from public.archivio_mvp where id = 1;

-- (b) la copia: svuota le tabelle nuove e le riempie dalla riga (rilanciabile finché il flag è 'jsonb')
select public.importa_archivio();

-- (c) la verifica
select public.verifica_importo();

-- (d) la riga non deve essere cambiata durante la copia
select a.versione as versione_riga, i.valore::bigint as copiata_da_versione, (a.versione = i.valore::bigint) as uguali
from public.archivio_mvp a, public.impostazioni i where a.id = 1 and i.chiave = 'importato_da_versione';
```
Attesi (con i dati di oggi): `eventi 4, lotti 3, pr 4, utenti 4, porte 4, iscrizioni 22, pagamenti 21, accessi 1, tavoli 0, prenotazioni 0, ingressi 0`; `verifica_importo()` → `"ok": true`, `"differenze": []`, `"segreto_ok": true`, `"versione_ok": true`; (d) → `uguali = true`.
**Se (c) o (d) non tornano: non unire la PR.** Se è solo la versione (qualcuno ha scritto), rifare da (a) in silenzio. Se ci sono differenze di conteggio, fermarsi e capire.

### 4.3 Il confronto vero, campo per campo (browser, admin entrato)
Aprire in una nuova scheda: `https://maremma-musica.vercel.app/api/admin/verifica-archivio`
Atteso: `"ok": true`, `"differenze": []`, `"sql": { "ok": true, … }`, conteggi uguali. Funziona anche prima dell'unione (confronta riga e tabelle).
**Se `differenze` non è vuota: non unire la PR** (la risposta dà solo il nome del campo, mai il valore).
Questo controllo va fatto **adesso, prima di qualsiasi cosa che scriva**: dopo il passaggio ogni login o acquisto cambia le tabelle e la riga resta ferma, quindi comparirebbero differenze "giuste" ma inutili da leggere.

### 4.4 L'interruttore: unire la PR (regia, col sì dell'utente)
1. Rifare (4.2-d): `uguali` deve essere ancora `true`. Se no, rifare la copia.
2. Unire la PR in `main`. Vercel costruisce e pubblica la produzione da solo (2-3 minuti).
3. Aspettare il deploy: ripetere ogni 15 secondi `curl -s https://maremma-musica.vercel.app/api/salute` finché `MM_ARCHIVIO` dice `tabelle (predefinito della produzione…)`. Finché dice ancora "non impostata" il sito è ancora sulla riga. Se dopo 5 minuti dice ancora "predefinito fuori dalla produzione", il deploy è pronto ma Vercel non espone `VERCEL_ENV` al sito (impostazione del progetto "Automatically expose System Environment Variables"): il sito è rimasto sulla riga, senza danni; si accende allora impostando `MM_ARCHIVIO=tabelle` su Vercel (lo fa l'amico) e rifacendo il deploy.

### 4.5 Subito dopo che il deploy è online (SQL, regia)
```sql
-- se la riga è salita, qualcuno ha scritto nel buco tra la copia e il deploy: quelle scritture NON sono nelle tabelle
select versione from public.archivio_mvp where id = 1;   -- deve essere uguale a copiata_da_versione di 4.2-d
```
Se è salita: fare il **ritorno indietro (sezione 5)** e rifare da 4.2. Se è uguale:
```sql
-- protezione: da ora importa_archivio() si rifiuta (altrimenti, rilanciata per sbaglio, cancellerebbe le tabelle e rifarebbe la copia da una riga ormai ferma)
update public.impostazioni set valore = 'tabelle', updated_at = now() where chiave = 'archivio';
```
(Il codice dell'app non legge questo flag, serve solo a proteggere `importa_archivio()`. Se si torna indietro bisogna rimetterlo a `'jsonb'`, vedi 5.C.)

### 4.6 Controlli a vista (in quest'ordine: i primi non scrivono)
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://maremma-musica.vercel.app/            # 200
curl -s -o /dev/null -w "%{http_code}\n" https://maremma-musica.vercel.app/eventi      # 200
curl -s https://maremma-musica.vercel.app/api/salute
```
- `/api/salute`: `MM_ARCHIVIO` = `tabelle (predefinito della produzione; MM_ARCHIVIO=riga lo spegne)` e `supabase.tabelle_nuovo_schema` = `{ "ok": true, "serate": 4 }`. Un errore su `tabelle_nuovo_schema` → ritorno indietro.
- Aprire una serata dalla lista `/eventi` e Solchi: titolo, data, lineup e tipo di prevendita come prima.
- **Admin entrato:** `/api/admin/verifica-archivio` di nuovo → `ok: true`, `differenze: []` (nulla ha ancora scritto).
- Admin: elenco serate, una serata, le sue iscrizioni (Halloween: 22), la sezione PR. Stessi numeri di prima.
- **Cron (scrive solo se c'è qualcosa da fare; la regia lo chiama una volta):** `curl -s https://maremma-musica.vercel.app/api/cron/tavoli` → `200` con `{"ok":true,…}` e nessun errore. Prova che il cron di domani alle 09:00 gira sulle tabelle senza errori.
- **Accesso (scrive: accessi e registro email):** in una **finestra privata**, richiedere il link di accesso con l'email dell'utente, entrare con link o codice. Se non riesce: ritorno indietro usando la finestra admin ancora aperta.
- **Acquisto di prova + scansione (scrive: iscrizione, pagamento, ingresso):** mai Ricky Le Roy né Halloween Party. Si usa **Capodanno in pineta**: un'iscrizione con una persona inventata maggiorenne e l'email dell'utente, pagamento in modalità prova, aprire il biglietto, scansionarlo da `/porta` con l'account staff/admin (stato `entrato`), riprovare la scansione (deve dire "già entrato"). Poi, se si vuole pulire, rimborsare il pagamento di prova dall'admin.
- Facoltativo: ripetere `/api/admin/verifica-archivio`: ora **mostrerà differenze** (le scritture nuove sono solo nelle tabelle): è normale.

### 4.7 Domani
Il cron delle 09:00 italiane gira da solo sulle tabelle. Se si vuole una conferma, dopo le 10:00 italiane si richiama a mano (4.6) o si chiede all'amico di guardare Vercel → Logs (`/api/cron/tavoli`).

## 5. Ritorno indietro

Quando farlo: `/api/salute` con errore, una pagina in 500, login che non funziona, differenze inspiegabili, versione della riga salita (4.5). **Prima di tutto silenzio**: dal momento in cui si sceglie di tornare indietro fino alla fine nessuno deve scrivere.

**A. Salvare quello che è stato scritto nelle tabelle** (solo se è roba vera, non prove): con il sito ancora sulle tabelle e l'admin entrato, console del browser (F12 → Console) sul sito:
```js
fetch('/api/admin/ripristina-riga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferma: 'ripristina' }) }).then(r => r.json()).then(console.log)
```
Atteso `{ ok: true, versione: N, serate: 4 }`: la riga unica è stata riscritta con quello che c'è nelle tabelle. (Si ferma da sola se le tabelle sono vuote o se il sito non usa le tabelle.)

**B. Tornare alla riga unica** (la A va fatta *prima*, mentre il sito è ancora sulle tabelle):
1. **Più veloce, se l'amico è raggiungibile:** su Vercel, Deployments → il deployment di produzione **precedente** al passaggio → **Instant Rollback**. Il vecchio deployment ha il vecchio codice (riga unica). Poi va comunque annullata la PR (punto 2), altrimenti il prossimo deploy riporta le tabelle.
2. **Da codice, senza Vercel:** la regia apre una PR di annullamento (`git revert` del commit di unione della PR di passaggio) e la unisce col sì dell'utente; il deploy dura 2-3 minuti. In alternativa all'annullamento, l'amico può impostare `MM_ARCHIVIO=riga` su Vercel e fare Redeploy (la variabile vince sul predefinito; il valore deve essere scritto `riga`: una variabile lasciata vuota conta come non impostata e in produzione resterebbero le tabelle).

**C. Rimettere il flag** (altrimenti la prossima copia viene rifiutata):
```sql
update public.impostazioni set valore = 'jsonb', updated_at = now() where chiave = 'archivio';
```
**D. Controllare:** `/api/salute` torna a "riga unica", home e /eventi 200, accesso admin. Se si è passati da A, la riga ha dentro le scritture del periodo; se NON si è fatto A, quelle scritture restano solo nelle tabelle (a oggi sarebbero solo prove).

Se non c'è più nessun admin entrato e il login non funziona: si fa B + C direttamente (si perdono le scritture fatte sulle tabelle dopo il passaggio). Per questo la finestra admin aperta di 4.0 non va chiusa prima dei controlli.

## 6. Cose da sapere / da decidere
- **`CRON_SECRET` mancante** (sezione 2): da chiedere all'amico prima delle serate vere.
- **`MM_SEGRETO` ≠ segreto del database** (probabile, sezione 1): non tocca il passaggio, ma va allineato prima delle serate vere: un clic da Admin → Staff → «Chiave segreta dei QR» (sezione 1).
- **Registro delle email di prova:** le 20 email che stanno nella riga non si portano nelle tabelle (scelta del piano). Dopo il passaggio il registro riparte vuoto.
- **Dopo il passaggio la riga `archivio_mvp` è ferma** ma intatta: resta come copia di sicurezza per almeno 14 giorni (piano 3.5). Poi: ripulirla dai dati personali, poi eliminarla, solo col sì dell'utente (tappa 9).
- **Anteprime di Vercel (Preview) e sviluppo locale restano sulla riga unica** (il predefinito `tabelle` vale solo con `VERCEL_ENV=production`).
