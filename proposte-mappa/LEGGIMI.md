# Mappa "Come arrivare": 3 proposte

Nelle immagini di questa cartella c'è la serata **Tenuta Eleonora di Toledo** (Campiglia Marittima: le coordinate vengono dall'annuncio della location, "Via di Bandita 6/D" — da controllare con chi organizza) e, dove serve, il **Campo G. Scirea** di Monteverdi Marittimo, che sta più ai bordi della zona.

Per ogni proposta c'è una foto a 375 px (telefono) e una a 1280 px (computer). `0-attuale-*` è la mappa che c'è ora online, per confronto.

| Proposta | Telefono | Computer |
|---|---|---|
| 1 · Locandina | `1-locandina-375.png`, `1-locandina-scirea-375.png` | `1-locandina-1280.png`, `1-locandina-scirea-1280.png` |
| 2 · Cartina | `2-cartina-375.png`, `2-cartina-scirea-375.png` | `2-cartina-1280.png`, `2-cartina-scirea-1280.png` |
| 3 · Le due insieme | `3-insieme-cartina-375.png` (all'inizio), `3-insieme-mappa-375.png` e `3-insieme-mappa-scirea-375.png` (dopo "Vedi la mappa") | gli stessi con `-1280` |

Fuori zona (una serata a Firenze, per prova): `2-cartina-fuori-zona-375.png` e `3-insieme-fuori-zona-375.png`.

**Per provarle dal vivo** (in sviluppo): `/dev/mappa?variante=1`, `2` o `3`. In alto ci sono i pulsanti per cambiare proposta e luogo. Usa la sezione "Come arrivare" vera della pagina serata.

---

## 1 · Mappa vera "da locandina"
**Com'è:** una mappa vera dall'alto, vista larga (circa 40 km su telefono): si vedono la costa, il mare in blu notte ben staccato dalla terra, le strade in osso (autostrade e statali più spesse, strade piccole appena accennate) e i paesi scritti con il carattere del sito (Big Shoulders, maiuscolo). Il punto della serata ha l'etichetta arancio con nome, data e luogo. Grana come nel resto del sito.
**Pregi:** è una mappa vera, quindi vale per qualsiasi serata in Italia; sempre aggiornata; molto più ricca della versione attuale.
**Difetti:** in campagna, lontano dal mare e dai paesi, resta un po' più spoglia (per questo ho aggiunto i paesini vicini). L'etichetta copre una parte della mappa su telefono. Mostra solo una zona piccola: non dà il "colpo d'occhio" sulla Maremma.
**Peso aggiunto:** circa 4 KB di codice. La libreria della mappa c'è già (è quella di adesso) e si scarica solo quando la sezione sta per comparire; ogni visita scarica anche qualche centinaio di KB di tasselli di mappa.
**Senza rete:** no. Resta un riquadro blu con l'etichetta e la scritta "MAPPA · SEGNAPOSTO".
**Lavoro che manca:** poco, mezza giornata: provarla su un iPhone vero, rifinire i colori, scegliere lo zoom definitivo, aggiungere i paesini che servono.

## 2 · Cartina illustrata della Maremma
**Com'è:** un disegno in stile poster, senza servizi esterni: costa, Argentario, Giglio ed Elba, Monte Amiata e colline come curve di livello, i paesi principali, scala dei 20 km e nord. Il punto è calcolato dalle coordinate, quindi funziona per qualsiasi serata in zona. Sotto, una riga con i tempi in auto ("10 min da Campiglia · 15 da San Vincenzo · 20 da Piombino").
**Pregi:** ha personalità, dà subito l'idea di dove siamo ("a mezz'ora da Grosseto"); carica subito e non dipende da nessuno.
**Difetti:** non si vedono le strade, quindi da sola non basta per arrivare (c'è "Indicazioni"). **I tempi sono una stima** dalla distanza in linea d'aria (strada = 1,35 volte, 55 km/h di media), non un percorso vero: la riga lo dice. Vale solo dentro il riquadro Maremma (da Piombino a Capalbio e dal mare all'Amiata); fuori da lì torna il segnaposto di prima.
**Peso aggiunto:** 25 KB (il disegno, 61 KB non compresso) + circa 6 KB di codice. Nessuna libreria di mappe.
**Senza rete:** sì, una volta caricata la pagina non serve altro.
**Lavoro che manca:** mezza giornata: far controllare i nomi e le posizioni dei paesi, decidere se aggiungerne, ritoccare il disegno. Il disegno si rifà con `node scripts/cartina-maremma.mjs` se cambia il riquadro.
**Dati e licenze:** costa da OpenStreetMap (© contributori di OpenStreetMap, licenza ODbL: va citato, e lo scrive la cartina in basso a destra); rilievo da tessere Mapzen/AWS, derivate da SRTM e altri dati aperti (anche questo citato). Niente di tutto ciò viene chiesto dal sito: sono usati una volta sola per fare il disegno.

## 3 · Le due insieme
**Com'è:** si parte dalla cartina (proposta 2); un tocco su **"Vedi la mappa"** la sostituisce con la mappa vera (proposta 1) nello stesso riquadro, e "← Torna alla cartina" riporta indietro. Fuori dalla Maremma si vede direttamente la mappa vera.
**Pregi:** il meglio dei due mondi: carattere e distanze subito, strade e dettaglio a richiesta. La mappa vera si scarica solo se qualcuno la chiede, quindi la pagina resta leggera.
**Difetti:** è la più grossa da mantenere (due cose da tenere belle); un tocco in più per chi vuole le strade. Se manca la rete, il tocco non fa nulla di grave: resta la cartina e compare un avviso.
**Peso aggiunto:** come la 2 (circa 31 KB) più, solo dopo il tocco, quello della 1.
**Senza rete:** la cartina sì; la mappa vera no (avviso e si resta sulla cartina).
**Lavoro che manca:** circa una giornata: quello della 1 e della 2, più rifinire il passaggio e provare il tocco su telefono.

---

## Cosa c'è di comune
- Pulsante **"Indicazioni"** (Apple Maps su iPhone/iPad, Google Maps altrove) in alto a destra, con le funzioni già presenti.
- Nessun cookie e nessun Google Maps incorporato. La mappa non cattura lo scorrimento: sul telefono si scorre la pagina come sempre.
- Con "riduci movimento" attivo il punto non pulsa e le dissolvenze si fermano.
- Attribuzioni piccole in basso a destra (OpenStreetMap, OpenMapTiles, OpenFreeMap; nella cartina OpenStreetMap e Mapzen).
- La mappa dei tavoli non è stata toccata.

## Note tecniche (per chi sviluppa)
- Nuovi file: `components/mappa/`, `components/come-arrivare.tsx` (la sezione, ora usata anche dalla pagina serata: con la variante "attuale" il comportamento non cambia), `lib/cartina.ts` (proiezione, paesi, distanze, con test in `lib/cartina.test.ts`), `scripts/cartina-maremma.mjs`, `public/img/cartina-maremma.svg`, `app/dev/mappa/page.tsx` (solo sviluppo).
- Aggiunti ai pacchetti di sviluppo `d3-contour` e `pngjs`: servono solo allo script del disegno.
- Lo zoom della mappa vera dipende dalla larghezza del riquadro (8,9 su telefono, 9,5 su schermo largo): nella scala di MapLibre è la vista "da 40 km", non gli zoom 11–12 della scala a 256 px.
- A 1280 px il riquadro della mappa è largo come su telefono (~390 px), perché la colonna a destra è stretta: le misure dei testi seguono la larghezza del riquadro, non quella dello schermo.
- Da decidere, se si sceglie la 2 o la 3: i paesi da mostrare (elenco in `lib/cartina.ts`) e il riquadro coperto.
