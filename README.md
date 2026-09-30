# Maremma Musica — sito MVP (offline)

Opzione A: iscrizione in lista + pagamento alla porta. Niente pagamenti online.

```bash
npm install
npm run dev        # http://localhost:3000 — anche dal telefono in rete: http://<IP-del-PC>:3000
```

Altri comandi: `npm test` (10 test: token QR, età, doppioni, lotti, porta, permessi), `npm run typecheck`,
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
- Biglietto: `/biglietto/[id]?email=…` (conferma, PDF, calendario), recupero da `/biglietto`.
- PR: `/pr/[handle]` — chi apre il link vede le prossime serate; il PR entrato vede la sua area.
- Porta: `/door` — fotocamera o codice, "cerca per nome", contatore live, funziona senza rete
  (elenco e ingressi in coda salvati sul telefono, sincronizzati al ritorno del segnale).
- Ingresso in cassa (staff e admin, da `/door` → "Ingresso in cassa"): chi arriva senza lista paga alla porta
  e viene registrato con nome, cognome e data di nascita (età minima e doppioni). Niente email e niente QR:
  entra subito, anche offline. Prezzo di default = "Prezzo in cassa" della serata (vuoto = come la lista),
  modificabile al momento. Nelle metriche è a parte: non gonfia la lista né la classifica PR, conta negli
  ingressi e nell'incasso (riquadro "In cassa" nella serata live, filtro nelle Iscrizioni, colonna nel CSV).
- Gestione attività PR: `/gestione/pr` — solo admin e staff porta (i PR non entrano). Per ogni PR: in lista,
  nuovi nelle 24 ore, entrati, resa, soldi incassati dal PR da ritirare, annullati, ultima attività;
  scheda del singolo PR con iscritti al giorno, serate, lista e cronologia. Lo staff la apre dalle impostazioni
  dello scanner, l'admin dal menu "Attività PR". Lo staff non vede le email dei PR e non modifica nulla.
- Consegna soldi dai PR: in `/gestione/pr` (e nella scheda del PR) "Ricevuti X €" registra che il PR ha
  consegnato i soldi incassati prima della serata: chi li ha presi, quando, quali clienti. Staff e admin
  confermano, solo l'admin annulla. Dopo la consegna il PR non può più togliere "pagato".
- Canali `/gestione/canali` (admin e staff): chi si iscrive senza PR, per canale (Instagram, Facebook, TikTok,
  WhatsApp, Google, locandina, diretto). Il canale si riconosce dal social di provenienza o dal link
  etichettato `/e/[slug]?da=instagram` (la pagina dà i link pronti da copiare). Anche nella serata live
  dell'admin e alla porta ("Lista: Maremma Musica · da Instagram").
- Admin: `/admin` serate · serata live (si aggiorna ogni 4 s) · nuova/modifica serata con lotti · PR · iscrizioni
  (annulla/rimborsa/CSV) · staff.

## Da completare con il cliente (`TODO: cliente` nel codice)

Location, orari, prezzo e posti di Halloween Party · regolamento del premio · ragione sociale e P.IVA ·
testi di chi siamo, residenti, foto · servizio email · revisione legale di privacy e termini.
Le serate Solchi e Capodanno, i PR e le persone in lista sono esempi dei mockup: da togliere prima del lancio.

## Test su iPhone / Instagram

1. PC e iPhone sulla stessa Wi-Fi, `npm run dev`, apri `http://<IP-del-PC>:3000` su Safari.
2. Per il browser di Instagram: manda il link a te stesso in DM su Instagram e aprilo da lì.
3. Scanner con fotocamera: avvia `npm run dev:https` e apri `https://<IP-del-PC>:3000/door`
   (accetta l'avviso sul certificato di sviluppo).
