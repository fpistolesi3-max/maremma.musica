# Il passaggio dalla riga unica alle tabelle: scaletta

Stato: **preparata il 5.11.2026, non eseguita.** Niente da qui è stato fatto: l'interruttore `MM_ARCHIVIO` non è impostato e Vercel non è stato toccato.
Riferimenti: `docs/PIANO-SCHEMA.md` (sezioni 3.4 e 3.5). Nessun segreto e nessun dato personale è scritto qui.

---

## 0. Cosa è già vero (controllato il 5.11.2026)

- Le 7 migrazioni sono applicate sul database vero (progetto `iowbljhcjfppjjwbumsm`). Le tabelle nuove hanno RLS accesa e le funzioni non sono eseguibili da anon/authenticated.
- La prova generale (`importa_archivio()` + `verifica_importo()` + confronto campo per campo di serate e iscrizioni dentro il database) è andata: conteggi uguali, 0 differenze, segreto uguale.
- Sul sito online le route `/api/admin/verifica-archivio` e `/api/admin/ripristina-riga` esistono già (rispondono 401 senza accesso): il codice delle tappe 4-5 è in produzione. **Da controllare a mano (il connettore Vercel non vede il progetto): che la produzione sia costruita da `9db6f36` (PR #58) o più nuovo.** Senza le tappe 6-7 il sito acceso a `tabelle` non può salvare vendite, porta e accessi.
- Lo stato dei dati online: Halloween Party ha tutte le 22 iscrizioni (21 valide); Ricky Le Roy 0; Solchi (7.11) e Capodanno in pineta (31.12) 0 iscrizioni, 1 tipo di prevendita ciascuna. **Le serate vere (Ricky Le Roy, Halloween Party) non si toccano**, nemmeno per le prove.

## 1. Il segreto dei QR: c'è un rischio?

Come lo usa il codice (`lib/dati/archivio.ts`, funzione `segreto()`):

```
segreto = MM_SEGRETO (variabile Vercel)  se c'è   →   altrimenti il segreto salvato nell'archivio
```

- Oggi: `/api/salute` dice che `MM_SEGRETO` **c'è** su Vercel → il sito firma e controlla QR, codici e cookie di accesso con la variabile, non con quello del database.
- Dopo il passaggio (`MM_ARCHIVIO=tabelle`): la regola è la stessa. La variabile vince ancora; il segreto nelle tabelle (`impostazioni.segreto`, copia identica di quello della riga) serve solo se la variabile sparisce.
- **Quindi il passaggio in sé non cambia il segreto usato: nessun QR già emesso smette di valere per colpa dell'interruttore.** Anche i cookie di accesso restano validi (firmati con lo stesso segreto, e gli utenti hanno gli stessi id).

Un fatto in più, trovato controllando le firme dei QR dentro il database senza mai mostrare i segreti:

| QR di Halloween Party | quanti | firmati col segreto salvato nel database |
|---|---|---|
| creati l'8–10 ottobre | 17 (tutti validi) | **sì** |
| creati il 10–29 ottobre | 5 (4 validi) | **no** |

Lettura più probabile: il valore di `MM_SEGRETO` su Vercel è **diverso** da quello salvato nel database; i 5 QR recenti sono stati firmati con la variabile (che oggi vince), i 17 più vecchi con il segreto del database, e quindi **già oggi non passano il controllo** (se sono ancora validi nello stato, ma non si scansionano). Non l'ho potuto confermare perché il valore della variabile non si legge dal connettore. Conseguenze:
1. Per il passaggio: nessuna. Non toccare né togliere `MM_SEGRETO`.
2. Rischio latente (non causato dal passaggio): se un giorno `MM_SEGRETO` viene tolta o cambiata, i 4 QR validi recenti smettono di valere. Per eliminarlo basterebbe, prima delle serate vere, scegliere un segreto definitivo, tenerlo sempre su Vercel e allineare `impostazioni.segreto` (decisione da prendere col cliente: gli ultimi QR sono quasi certamente di prova).
3. Se si vuole la certezza: l'utente può guardare su Vercel che `MM_SEGRETO` esista nell'ambiente **Production** (solo la presenza, senza copiarla da nessuna parte).

## 2. Cosa gira da solo (e quando è tranquillo)

| Cosa | Quando | Cosa fa |
|---|---|---|
| Cron `/api/cron/tavoli` (`vercel.json`: `0 8 * * *`) | ogni giorno alle **08:00 UTC = 09:00 ora italiana** (in inverno). Su piano gratuito Vercel può partire in un punto qualsiasi dell'ora (08:00–08:59 UTC). | controlla da Stripe i pagamenti in sospeso, chiude prevendite e prenotazioni scadute, manda promemoria/avvisi, anonimizza le iscrizioni vecchie di 30 giorni |
| Webhook Stripe `/api/pagamenti/stripe` | solo quando qualcuno paga (o rimborsa) | registra il pagamento |
| Telefoni alla porta `/api/door` | solo la sera di una serata | sincronizzano gli ingressi |
| Scadenze "pigre" | quando qualcuno apre la pagina di un biglietto, un tavolo o l'admin | scrivono **solo se c'è qualcosa di scaduto** |
| Accessi di PR, staff e admin (link/codice) | quando qualcuno fa il login | scrivono un accesso e una email nel registro |

**Finestra tranquilla: da 09:00 UTC (10:00 italiane) fino a domani 08:00 UTC (09:00 italiane).** Tra 08:00 e 09:00 UTC non fare niente. Oggi la finestra è aperta dopo le 10:00. Nessuna serata con porta aperta: Halloween è passata, Solchi è il 7.11 (fare il passaggio **prima** di sabato sera, meglio entro giovedì/venerdì così c'è tempo per accorgersi di problemi).
Il primo cron dopo il passaggio (il giorno dopo, 09:00 italiane) gira già sulle tabelle: va guardato (vedi punto 7).

### Attenzione: il cron è aperto
`/api/cron/tavoli` oggi risponde a **chiunque**, senza segreto: `CRON_SECRET` non è impostata e, in modalità prova (`MM_MODALITA_PROVA=1`), il codice autorizza la chiamata senza segreto. Il README dice invece che è protetta. Io stesso, controllando, l'ho chiamata una volta il 5.11 alle 09:00 UTC: ha risposto tutti zeri (nessun pagamento, promemoria, scadenza o anonimizzazione) e ha solo fatto salire la `versione` della riga da 277 a 279 (nessun contenuto cambiato: le quantità sono le stesse). **Da sistemare prima delle serate vere:** impostare `CRON_SECRET` su Vercel (Vercel lo manda da solo nel cron). È un'altra variabile e un altro deploy: meglio farlo **prima** del passaggio, separatamente, così se qualcosa non va si sa quale modifica è stata.

## 3. Chi fa cosa

- **L'utente, con le sue mani:** (a) pannello Vercel: controllare il commit in produzione, aggiungere `MM_ARCHIVIO`, fare il Redeploy, eventualmente il rollback; (b) restare **entrato come admin** in una finestra del browser per tutto il passaggio e aprire due indirizzi nel browser; (c) non usare né far usare il sito durante la finestra; (d) fare i giri di prova (accesso, acquisto di prova, scansione).
- **La regia (con il connettore Supabase, solo col sì dell'utente a ogni scrittura):** i comandi SQL qui sotto. In alternativa li lancia l'amico dal pannello Supabase.
- Il connettore Vercel **non vede il progetto** (nessun team): le variabili e i deploy li fa l'utente dal pannello.

## 4. La scaletta, passo per passo

Durata stimata: preparativi 10 min + copia e interruttore 10 min + controlli 20 min = **circa 40 minuti**. Il tempo in cui scritture sul sito andrebbero perse è solo quello tra la copia finale (4.2) e il momento in cui il nuovo deploy è online (4.5): **circa 3-5 minuti**, per questo nessuno deve usare il sito.

### 4.0 Prima (anche il giorno prima)
1. Vercel → progetto → **Deployments**: la produzione è `Ready` e viene dal commit `9db6f36` (PR #58) o più nuovo. Se no, aspettare/rifare il deploy di `main` e fermarsi qui.
2. Vercel → **Settings → Environment Variables**: `MM_SEGRETO` esiste per **Production**; `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` esistono. `MM_ARCHIVIO` **non** c'è ancora.
3. (Consigliato, a parte) impostare `CRON_SECRET` (valore casuale lungo) per Production e fare Redeploy. Verifica: `curl https://maremma-musica.vercel.app/api/cron/tavoli` deve rispondere **401**.
4. Entrare come admin in una finestra del browser e **lasciarla aperta** (la sessione dura 30 giorni, il login dopo il passaggio si prova in una finestra privata a parte, così non si rischia di restare fuori).

### 4.1 Silenzio
Avvisare chi lavora sul sito (PR, staff, amico) di non entrare né vendere/prenotare fino a fine controlli. Ora italiana tra 10:00 e 08:00 del giorno dopo.

### 4.2 Copia finale (SQL, dal connettore o dal pannello Supabase)
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
**Se (c) o (d) non tornano: non girare l'interruttore.** Se è solo la versione (qualcuno ha scritto), rifare da (a) in silenzio. Se ci sono differenze di conteggio, fermarsi e capire.

### 4.3 Il confronto vero, campo per campo (browser, admin entrato)
Aprire in una nuova scheda: `https://maremma-musica.vercel.app/api/admin/verifica-archivio`
Atteso: `"ok": true`, `"differenze": []`, `"sql": { "ok": true, … }`, conteggi uguali. Funziona anche con l'interruttore ancora spento (confronta riga e tabelle).
**Se `differenze` non è vuota: non girare l'interruttore** (la risposta dà solo il nome del campo, mai il valore).
Questo controllo va fatto **adesso, prima di qualsiasi altra cosa che scriva**: dopo il passaggio ogni login o acquisto cambierà le tabelle e la riga resterà ferma, quindi comparirebbero differenze "giuste" ma inutili da leggere.

### 4.4 L'interruttore (Vercel, a mano)
1. Rifare (4.2-d): `uguali` deve essere ancora `true`.
2. Vercel → **Settings → Environment Variables → Add**: nome `MM_ARCHIVIO`, valore `tabelle` (minuscolo), ambiente **solo Production** (non Preview né Development: restano sulla riga).
3. **Deployments** → il deployment di produzione più recente → **⋯ → Redeploy** → conferma. (Le variabili valgono solo per i deploy nuovi: finché il Redeploy non è `Ready` il sito lavora ancora sulla riga.) Aspettare `Ready` (1-2 minuti).

### 4.5 Subito dopo che il deploy è online
```sql
-- se la riga è salita, qualcuno ha scritto nel buco tra la copia e il deploy: quelle scritture NON sono nelle tabelle
select versione from public.archivio_mvp where id = 1;   -- deve essere uguale a copiata_da_versione di 4.2-d
```
Se è salita: fare il **ritorno indietro (sezione 5)** e rifare da 4.2. Se è uguale:
```sql
-- protezione: da ora importa_archivio() si rifiuta (altrimenti, rilanciata per sbaglio, cancellerebbe le tabelle e rifarebbe la copia da una riga ormai ferma)
update public.impostazioni set valore = 'tabelle', updated_at = now() where chiave = 'archivio';
```
(Nota: il codice dell'app non legge questo flag, serve solo a proteggere `importa_archivio()`. Se si torna indietro bisogna rimetterlo a `'jsonb'`, vedi sezione 5.)

### 4.6 Controlli a vista (in quest'ordine: i primi non scrivono)
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://maremma-musica.vercel.app/            # 200
curl -s -o /dev/null -w "%{http_code}\n" https://maremma-musica.vercel.app/eventi      # 200
curl -s https://maremma-musica.vercel.app/api/salute
```
- `/api/salute` deve mostrare `MM_ARCHIVIO` come `tabelle…` e `supabase.tabelle_nuovo_schema` = `{ "ok": true, "serate": 4 }`. (Il testo accanto a `tabelle`, "la scrittura non è ancora pronta", è un messaggio vecchio e ignorabile: la scrittura c'è dalle tappe 5-7.) Se invece c'è un errore su `tabelle_nuovo_schema`: ritorno indietro.
- Aprire una serata dalla lista `/eventi` (anche una passata) e Solchi: devono mostrare titolo, data, lineup e tipo di prevendita come prima.
- **Admin entrato:** `/api/admin/verifica-archivio` di nuovo → `ok: true`, `differenze: []` (non è cambiato niente, la riga è ferma e le tabelle non sono state scritte).
- Admin: aprire elenco serate, una serata, le sue iscrizioni (Halloween: 22), la sezione PR. Stessi numeri di prima.
- **Accesso (scrive: accessi e registro email):** in una **finestra privata**, richiedere il link di accesso con l'email dell'utente, entrare con link o codice. Se non riesce: ritorno indietro usando la finestra admin ancora aperta.
- **Acquisto di prova + scansione (scrive: iscrizione, pagamento, ingresso):** non usare Ricky Le Roy né Halloween Party. Proposta: **Capodanno in pineta**, un'iscrizione con una persona inventata ma maggiorenne e l'email dell'utente, pagamento in modalità prova, poi aprire il biglietto, scansionarlo da `/porta` con l'account staff/admin (stato `entrato`), riprovare la scansione (deve dire "già entrato"). Poi, se si vuole pulire, rimborsare il pagamento di prova dall'admin. Il record resta nei dati di Capodanno come prova (l'utente può chiedere di toglierlo con SQL).
- Facoltativo: ripetere `/api/admin/verifica-archivio`: ora **mostrerà differenze** (le scritture nuove sono solo nelle tabelle): è normale.

### 4.7 Domani
Il cron delle 09:00 italiane gira già sulle tabelle. Dopo le 10:00 guardare Vercel → **Logs** (filtro `/api/cron/tavoli`): deve esserci un `200` e nessun errore in rosso. Se c'è un errore: ritorno indietro (sezione 5) e farsi mandare il testo dell'errore.

## 5. Ritorno indietro

Quando farlo: `/api/salute` con errore, una pagina in 500, login che non funziona, differenze inspiegabili, versione della riga salita (4.5).

**A. Vale la pena salvare quello che è stato scritto nelle tabelle** (qualcuno ha comprato o prenotato davvero dopo il passaggio): con l'interruttore ancora acceso e l'admin entrato, aprire la console del browser (F12 → Console) sul sito e lanciare
```js
fetch('/api/admin/ripristina-riga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferma: 'ripristina' }) }).then(r => r.json()).then(console.log)
```
Atteso `{ ok: true, versione: N, serate: 4 }`: la riga unica è stata riscritta con quello che c'è nelle tabelle. (Si ferma da sola se le tabelle sono vuote, o se l'interruttore non è acceso.) Poi continuare con B.

**B. Spegnere l'interruttore** (due modi, a scelta):
1. **Più veloce, senza ricostruire:** Vercel → Deployments → il deployment di produzione **precedente** al Redeploy del passaggio → **⋯ → Promote to Production / Instant Rollback** (ogni deployment ricorda le variabili che aveva quando è stato costruito, quindi quello vecchio non ha `MM_ARCHIVIO`). Poi **togliere comunque `MM_ARCHIVIO`** dalle variabili, altrimenti il prossimo deploy la riprende.
2. **Più semplice:** Settings → Environment Variables → eliminare `MM_ARCHIVIO` (o metterla a `riga`) → Deployments → Redeploy.

**C. Rimettere il flag** (altrimenti la prossima copia viene rifiutata):
```sql
update public.impostazioni set valore = 'jsonb', updated_at = now() where chiave = 'archivio';
```
**D. Controllare:** `/api/salute` torna a "(non impostata: il sito usa la riga unica)", home e /eventi 200, accesso admin. Se si è passati da A, la riga ha dentro le scritture del periodo sulle tabelle; se NON si è fatto A, quelle scritture restano solo nelle tabelle (a oggi sono solo prove).

Se non c'è più nessun admin entrato e il login non funziona: si fa B + C direttamente (si perdono le scritture fatte sulle tabelle dopo il passaggio, a oggi solo prove). Per questo la finestra admin aperta di 4.0 non va chiusa prima dei controlli.

## 6. Cose da sapere / da decidere
- **`MM_SEGRETO` ≠ segreto del database** (probabile, sezione 1): non tocca il passaggio, ma va deciso prima delle serate vere.
- **`CRON_SECRET` mancante**: il cron è chiamabile da chiunque (sezione 2). Da impostare prima del lancio.
- **Messaggio vecchio in `/api/salute`** ("la scrittura sulle tabelle non è ancora pronta") e commento vecchio in `lib/dati/archivio.ts`: solo testi da aggiornare, non cambiano il comportamento.
- **Registro delle email di prova:** le 20 email che stanno nella riga non si portano nelle tabelle (scelta del piano). Dopo il passaggio il registro riparte vuoto.
- **Dopo il passaggio la riga `archivio_mvp` è ferma** ma intatta: resta come copia di sicurezza per almeno 14 giorni (piano 3.5). Poi: ripulirla dai dati personali, poi eliminarla, solo col sì dell'utente (tappa 9).
- **Non fatto da questa preparazione:** nessuna scrittura sul database, nessuna modifica su Vercel, nessun commit.
