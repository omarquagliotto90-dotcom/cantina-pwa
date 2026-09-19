# Analisi architetturale — database e struttura del codice

Data: 19/09/2026 · Baseline: `main` @ `8c591de` · Schema verificato in lettura diretta su Supabase `etbrgdldduadgbulasmy`.

Risponde a due domande: **come migliorare il database** e **come migliorare il modo in cui è scritto il progetto**.
Non contiene modifiche al codice né allo schema: è materiale per decidere.

---

## Premessa: lo stato è migliore di quanto il repo lasci pensare

A0–A3 hanno chiuso le criticità strutturali vere. Verificato sul DB attuale:

| Cosa | Stato |
|---|---|
| Identity su `wines.id` e `bevuti.uid` | presente (niente più `max(id)+1`) |
| FK `wine_images→wines` CASCADE, `bevuti→wines` SET NULL | presenti |
| CHECK su `bottiglie`, `prezzo`, `valore`, `tipologia`, `denominazione`, `rating` | presenti |
| UNIQUE `idx_wines_unique_normalizzato` | presente |
| 9 RPC `SECURITY DEFINER` transazionali | presenti e usate dal client (9 `sb.rpc`) |
| `anon` su tabelle | solo `SELECT` |

Quello che segue non sono errori da riparare: sono **le prossime scelte di modello**.

---

# Parte 1 — Database

## D1 · Sicurezza: la revoca dei permessi ad `anon` non ha ridotto la superficie ⚠️

È il punto più importante del documento.

A3 ha revocato INSERT/UPDATE/DELETE ad `anon` sulle 4 tabelle. Ma le 9 RPC sono `SECURITY DEFINER` ed **eseguibili da `anon`**. La chiave publishable è nel bundle JavaScript, quindi è pubblica per definizione. Risultato netto:

> Chiunque apra il sito ed estragga la chiave può leggere l'intera cantina e chiamare `elimina_bottiglia`, `bevi_bottiglia`, `modifica_vino`, `aggiungi_o_incrementa`. La porta è cambiata, non si è chiusa.

In più, l'advisor di Supabase segnala:

- **RLS disabilitata** su `public.bevuti` e `public.wine_websites` — le righe sono interamente esposte ai ruoli `anon` e `authenticated`.
- Su `wines` e `wine_images` RLS è attiva ma le policy sono `USING(true)` al ruolo `public`. La policy si chiama **"modifica autenticata"** ma è `ALL` a `public`: il nome dice l'opposto di ciò che fa.
- `wine_images` non ha policy DELETE (residuo di A0, ora mascherato dalla CASCADE della FK).

Il rimedio suggerito dall'advisor è:

```sql
ALTER TABLE "public"."bevuti" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wine_websites" ENABLE ROW LEVEL SECURITY;
```

**Da non eseguire così com'è**: abilitare RLS senza policy blocca ogni accesso e l'app smette di leggere. Va fatto dentro A4, insieme e nello stesso ordine:

1. Auth Supabase (anche un solo utente) e colonna `owner_id` sulle 4 tabelle.
2. `REVOKE EXECUTE ON FUNCTION ... FROM anon` + `GRANT ... TO authenticated` sulle 9 RPC.
3. Dentro ogni RPC, un `IF auth.uid() IS NULL THEN RAISE EXCEPTION` — `SECURITY DEFINER` bypassa RLS, quindi il controllo deve essere esplicito nel corpo della funzione.
4. RLS abilitata ovunque con policy `owner_id = auth.uid()`, e le policy attuali rinominate o rimosse.

Finché A4 non è fatto, **tutto il resto di questa analisi è secondario**. Non è un'emergenza — la cantina non è un dato sensibile e l'app non è pubblicizzata — ma è l'unico punto in cui un estraneo può causare un danno irreversibile.

## D2 · Il contatore `bottiglie` è il vero limite del modello

Oggi una riga di `wines` è un'etichetta+annata con un **contatore** `bottiglie`. È il motivo per cui `bevuti` deve conservare uno snapshot: la bottiglia fisica non esiste come entità, quindi quando viene bevuta non c'è niente da aggiornare, solo da copiare.

Questo blocca tre cose già nel piano:

- **formato** (0,75 / magnum / mezza): oggi un magnum e una standard della stessa etichetta sono lo stesso contatore
- **posizione in cantina** (decisione aperta #4)
- **finestra di beva** e quindi lo step 9 "cosa bere": si può stimare per etichetta, non per bottiglia

L'alternativa è il modello classico a due livelli:

```
wines        anagrafica: 1 riga per etichetta+annata (quello che è già)
bottiglie    1 riga per bottiglia fisica
             (wine_id, formato, posizione, acquistata_il, prezzo_pagato,
              stato: in_cantina | bevuta, consumed_on, nota, rating)
```

`wines.bottiglie` diventa una vista o una colonna mantenuta da trigger; `bevuti` diventa `bottiglie WHERE stato='bevuta'` e lo storico è immutabile per costruzione, senza snapshot duplicati.

**Raccomandazione:** è una migrazione seria (le 9 RPC vanno riscritte) e ha senso **solo se** formato, posizione o "cosa bere" entrano davvero nel piano. Se il piano resta "conto le bottiglie e segno quelle bevute", il modello attuale è adeguato e questa è complessità non necessaria. Va decisa **prima** di B e C, non dopo: entrambi toccano la stessa UI.

## D3 · `produttore` è testo libero ripetuto — manca `produttori`

80 produttori distinti su 125 vini, il nome è ripetuto come stringa in `wines`, in `bevuti` e come **chiave primaria** di `wine_websites`.

Conseguenze misurate (rimisurate il 19/09/2026, vedi correzione sotto):

- **"Vina Krapez" e "Vina Krapež"** sono lo stesso produttore scritto in due modi:
  due righe distinte, due voci di cache, due schede. È l'unica collisione su 80
  produttori, ma è reale e nessun vincolo la impedisce
- **3 righe su 29** in `wine_websites` non corrispondono ad alcun produttore in
  `wines`: sono residui di vini eliminati o refusi già corretti (`Fattoria
  Milziade Antano`, `Francesco Tollador`, `Valentini`). Non danno fastidio, ma
  nessuno li ripulirà mai perché non c'è una FK
- rinominare un produttore significa aggiornare 3 tabelle a mano
- **Slow Wine è spaccato in due fonti di verità**: `SW_CANTINA_CHIOCCIOLA` è un
  `Set` hardcoded nel bundle (6 nomi), mentre `slow_vino_bott` è una colonna del
  DB. Aggiornare la guida 2026 richiederà un deploy. `SW_VINO_BOTTIGLIA` è
  dichiarato e **mai letto**: codice morto.

> **Correzione (19/09/2026), in due tempi.**
>
> 1. In una prima stesura avevo scritto che il lookup del sito "fallisce
>    silenziosamente su spazi e maiuscole". **Causa sbagliata:** 26 righe su 29
>    combaciano con match esatto, e il confronto normalizzato dà le stesse 26.
>    I nomi non sono il problema.
> 2. Poi avevo concluso che "la cache dei siti funziona". **Anche questo era
>    sbagliato.** Durante P3 ho catturato con l'harness e2e l'URL che il client
>    costruisce davvero:
>    `wine_websites?produttore=eq.Pieropan&select=url,source?order=created_at.asc`
>    — due `?` nella stessa query string, perché `sb.get` appende `?order=` a un
>    percorso che ne ha già uno. PostgREST risponde 400, `sb.get` inghiotte
>    l'errore e torna `[]`.
>
> **Conclusione:** la cache non è mai stata letta, e ogni apertura della tab
> "Web" richiamava Serper da capo. L'effetto che avevo intuito era reale, la
> causa era un'altra — ed era già stata individuata come `F18` nel vecchio
> `PIANO_FIX.md`, che avevo proposto di archiviare. Chiuso in P3: il sito arriva
> con l'anagrafica caricata all'avvio, nessuna query per vino.

Proposta:

```sql
produttori (
  id           identity PK,
  nome         text not null,
  nome_norm    text generated always as (lower(trim(nome))) stored unique,
  sito         text,
  sito_source  text,
  slow_chiocciola boolean not null default false,
  regione      text            -- abilita le statistiche per zona
)
wines.produttore_id  → FK produttori(id)
```

`wine_websites` viene assorbita (è già 1:1 con il produttore). La chiocciola Slow Wine smette di essere codice.

**Costo:** medio. **Beneficio:** manutenibilità, non un guasto da riparare. Toglie
Slow Wine dal bundle, rende sicura la rinomina di un produttore, unifica i due
"Krapez" e apre le statistiche per regione. Nulla di questo si vede il giorno dopo.

## D4 · `bevuti`: il contratto dello snapshot non è scritto, e i tipi sono divergenti

Due problemi distinti.

**Tipi.** A2b ha migrato `wines.annata` da `text` a `smallint`, ma `bevuti.annata` è rimasta `text`. Lo snapshot e la sorgente hanno ora tipi diversi per lo stesso dato: ogni confronto tra i due passa da una coercizione implicita.

**Precedenza.** `resolveWine()` (riga 117) privilegia `wines` sullo snapshot:

```js
return wineMap[b.id] || (b.produttore ? { ...snapshot } : null)
```

Quindi se modifichi l'annata o il prezzo di un vino che hai già bevuto, **cambia anche il passato**: la bevuta del 2024 mostra il prezzo di oggi. Lo snapshot viene usato solo come fallback quando il vino è stato cancellato. Questo contraddice il vincolo "storico bevuti immutabile" dichiarato in `CLAUDE.md`.

C'è inoltre 1 bevuta orfana (`wine_id NULL`) — corretta per design, è la FK `SET NULL` che funziona, ma conferma che il caso "vino cancellato" è reale e va gestito bene.

**Decisione da prendere:** lo snapshot è autoritativo per lo storico (raccomandato, coerente con l'immutabilità), oppure `wines` lo è e lo snapshot serve solo da lapide. Una volta decisa, `resolveWine` va invertita e i tipi allineati. Oggi il codice fa una cosa e il documento ne dichiara un'altra.

Nota collaterale: il fallback di `resolveWine` assegna `tipologia: "Bianco fermo"` a un vino senza tipologia. Un orfano senza tipologia diventa silenziosamente un bianco nelle statistiche.

## D5 · Rating: lo schema ha già ragione, la UI no

Decisione aperta #1 in `CLAUDE.md`. I dati hanno già deciso:

- lo schema è **per bevuta** (`bevuti.rating`, `numeric(2,1)`, CHECK 1–5)
- la UI è **per vino** (`ratings` è una mappa `wineId → voto`)
- `handleRate` scrive lo stesso voto su **tutte** le bevute di quel vino
- al caricamento, `useCantinaData` collassa le bevute prendendo il massimo
- **5 vini hanno già rating divergenti in DB**: sono valutazioni distinte di annate bevute in momenti diversi, che la UI attuale appiattisce e la prossima modifica sovrascrive

Raccomandazione: rating per bevuta anche nella UI (è ciò che rende sensato avere `RatingDial` nel modale "segna come bevuto"), e media per etichetta come vista o colonna calcolata per la card. Da fare **prima** che altri voti vengano sovrascritti.

## D6 · Non esistono migrazioni versionate

Lo schema vive solo dentro Supabase. Il corpo delle 9 RPC — la parte più delicata del sistema, quella che contiene le transazioni — non è in nessun file del repo. L'unico registro è la prosa di `CLAUDE.md`.

Effetto concreto, verificato durante questa analisi: partendo dal repo ho ricostruito uno schema che non esisteva più da settimane (colonna `bevuti.data`, `annata` text, nessuna FK). Le conclusioni erano corrette rispetto al codice e sbagliate rispetto alla realtà.

Rimedio, a costo quasi zero e **senza violare alcun vincolo** (sono file `.sql`, nessuna dipendenza npm, nessun SDK):

```
supabase/
  migrations/0001_baseline.sql     schema attuale, generato una volta
  migrations/0002_....sql          ogni DDL futuro
  functions/*.sql                  il corpo delle 9 RPC
```

Ogni DDL eseguito nel SQL Editor viene anche committato. Da lì in poi repo e DB raccontano la stessa storia, e un `pg_dump --schema-only` di controllo dice subito se hanno divergato.

## D7 · Minori, per completezza

- **`wine_images` conserva URL esterni** (risultati Serper, 62 righe). Sono hot-link a siti terzi: destinati a rompersi, e nessuna colonna registra quando l'URL è stato verificato. Supabase Storage risolve alla radice; in alternativa almeno un `checked_at`.
- **`tipologia` e `denominazione` sono CHECK duplicati nel client** (`TIPO`, `FILTERS`, `DENOMINAZIONI`). Aggiungere una tipologia oggi richiede di toccare DB e bundle in modo coordinato. Una lookup table le unifica; in subordine, almeno un commento incrociato nei due punti.
- **`unaccent` e `pg_trgm` assenti**: la ricerca è client-side su tutte le righe. A 125 vini va benissimo; se la cantina cresce o arriva la ricerca per vitigno, servono.
- **Nessun `updated_at`** su `wines`: non è possibile sapere cosa è cambiato di recente, né implementare la cache stale-while-revalidate prevista in B senza riscaricare tutto.

---

# Parte 2 — La struttura del codice

## Il vincolo dichiarato non è quello che pesa

`CLAUDE.md` elenca fra i vincoli duri: niente dipendenze npm, niente librerie CSS, niente SDK Supabase — e poi *«split di `App.jsx`: in discussione, nessuna decisione presa»*.

Vale la pena separare le due cose: **lo split non ha nulla a che fare con gli altri tre vincoli**. Create React App compila già moduli ES. Spezzare `App.jsx` significa spostare testo fra file e aggiungere `import`/`export`: zero dipendenze nuove, zero configurazione, zero build diversa. Il vincolo "niente dipendenze" non è un argomento contro lo split — è un argomento che è stato applicato per estensione a qualcosa di diverso.

## Il costo reale non è la lunghezza, è il raggio d'azione

2.084 righe non sono ingestibili in sé. Il problema è che ogni modifica, per piccola che sia, ha come unità di lavoro **l'intero file**.

Questo si vede già nel repo: `PIANO_FIX.md` contiene una sezione intitolata *"Risparmio token"*, la regola *"una sessione = un batch"*, e la nota che il file pesa *"~108 KB ~ 25-30k token"*. Quella disciplina esiste perché il file è monolitico. Non è una scelta di metodo: è il monolite che detta il metodo.

Misure sul file attuale:

| | |
|---|---|
| righe | 2.084 |
| `style={{...}}` inline | 303 |
| `fontFamily: 'Roboto'` ripetuto | 115 |
| `<svg>` inline | 54 |
| colori hex distinti | 59 |
| `useState` | 44 |
| componenti top-level | 43 |

Per correggere la formula del valore di giacenza — **9 righe** — la sessione ne carica 2.084.

## Il criterio: tagliare per dipendenza, non per dimensione

Il file ha già strati netti e ben scritti. Non sono mescolati: sono **impilati**. Le funzioni di dominio di A1 (`normalizzaWine`, `valoreBottiglia`, `costoGiacenza`) sono pure e non toccano React; `sb` non tocca React; le icone non toccano niente.

Questo significa che lo split è in gran parte **taglia e incolla**, non refactoring. Ecco la struttura proposta, ordinata dallo strato più stabile al più volatile:

```
src/
  lib/
    sb.js                  client REST, rpc, timeout             ~85 righe   nessuna dipendenza
  domain/
    wine.js                normalizzaWine, resolveWine,
                           valoreBottiglia, costoGiacenza,
                           valoreMercatoGiacenza, opzionale,
                           annataDaForm, formatDataIt            ~70         nessuna dipendenza
    tipologie.js           TIPO, FILTERS, DENOMINAZIONI, SlowWine ~25        → ui/icons
  ui/
    tokens.js              M3, S, RATING_GRADIENT, ratingColor   ~45         nessuna dipendenza
    icons.jsx              i 24 componenti icona + IC            ~230        → tokens
    primitives.jsx         FilterChip, PressableRow, TipoBadge,
                           TipoLabel, SwBadge, Lightbox          ~110        → tokens, icons
  features/
    immagini/BottleImage.jsx    + imgQueue, imgSessionCache      ~115        → lib, ui
    sito/WebsiteView.jsx        + websiteCache                   ~120        → lib, ui
    rating/RatingDial.jsx                                        ~110        → ui
    vino/WineCard.jsx · WineDetail.jsx                           ~290        → tutto sopra
    vino/WineForm.jsx           unifica ModalAggiungi/Modifica   ~180
    bevuta/ModalBevi.jsx                                         ~40
  tabs/
    TabLista.jsx · TabBevuti.jsx · TabStatistiche.jsx            ~260        → features
  state/
    useCantinaData.js      caricamento                           ~45         → lib, domain
    useCantinaActions.js   le 7 azioni di scrittura + rollback   ~135        → lib, domain
  App.jsx                  shell: appbar, nav, banner, modali    ~150
```

**Regola di dipendenza:** le frecce puntano sempre verso il basso. `lib`, `domain` e `ui` non importano mai da `features`, `tabs` o `state`. Nessun ciclo, e la direzione è verificabile a colpo d'occhio dagli import in cima a ogni file.

**Perché questi tagli e non altri:**

- `lib/sb.js` e `domain/wine.js` sono le uniche parti testabili senza montare React. Separarle è la precondizione per avere dei test, un giorno — e sono anche le parti dove i bug costano di più (le formule del valore erano già divergenti in 3 punti prima di A1).
- `ui/icons.jsx` da solo porta via ~230 righe e 54 SVG dal file che modifichi ogni giorno. È il taglio col miglior rapporto beneficio/rischio dell'intero elenco: zero logica, nessuna possibilità di regressione.
- `state/` separa le 7 azioni di scrittura dal rendering. Oggi `Cantina()` è contemporaneamente shell, router, store e controller: è il punto in cui il file è davvero difficile da leggere, non le icone.

## Ordine di esecuzione

Ogni passo è un commit autonomo, verificabile e reversibile. **Nessuno cambia il comportamento dell'app.**

| # | Passo | Righe tolte | `App.jsx` dopo | Rischio |
|---|---|---|---|---|
| 1 | `ui/tokens.js` + `ui/icons.jsx` | ~275 | ~1.810 | nullo — puro spostamento |
| 2 | `lib/sb.js` + `domain/` | ~180 | ~1.630 | nullo — puro spostamento |
| 3 | `ui/primitives.jsx` + BottleImage, WebsiteView, RatingDial | ~455 | ~1.175 | basso — componenti già autonomi |
| 4 | `tabs/` | ~260 | ~915 | basso |
| 5 | `state/` | ~180 | ~735 | **medio** — tocca lo stato, va fatto da solo |
| 6 | `WineForm` unico + `WineDetail`/`WineCard` | ~580 | ~155 | medio — unifica due form divergenti |

I passi 1 e 2 insieme valgono mezz'ora, non cambiano una riga di logica e tolgono già il 22% del file. Sono il modo più economico di verificare se lo split conviene davvero, **senza impegnarsi a completarlo**: se dopo i primi due il beneficio non si sente, ci si ferma lì e non si è perso nulla.

Il passo 6 chiude anche un bug già in elenco: *«`ModalAggiungi` e `ModalModifica` duplicano il form, con validazioni diverse; l'enrichment è duplicato in due punti con logiche di merge diverse»*. È l'unico passo che vale sia come struttura sia come correzione — ed è già previsto in B come `WineForm` unico.

## Cosa non spostare

**Gli stili inline.** I 303 `style={{}}` sono un problema reale ma di natura diversa: è mancanza di un sistema di token e di primitive, non cattiva divisione in file. Spostarli in altri file li rende solo 303 stili inline distribuiti su dodici file, cioè peggio. Si affrontano in C con `Button`/`Card`/`Field`/`Sheet`, **dopo** lo split, quando la loro casa naturale esiste già.

L'ordine giusto è: prima i file, poi le primitive. Al contrario si costruiscono primitive dentro un monolite e poi si spostano due volte.

## Il rischio da tenere d'occhio: il service worker

Lo split cambia i nomi dei chunk generati. `public/sw.js` fa cache-first su tutto e ha **già** un difetto indipendente:

```js
const urlsToCache = [
  '/', '/index.html',
  '/static/js/main.chunk.js',   // ← percorsi del dev server CRA 4
  '/static/js/bundle.js',       // ← non esistono nella build di produzione
  'https://fonts.googleapis.com/...'
];
```

`cache.addAll()` è atomico: se **un solo** URL della lista risponde 404, l'intera Promise viene rifiutata e l'evento `install` fallisce. In produzione quei due percorsi non esistono, quindi il service worker non completa mai l'installazione — il che spiega la nota in `ISTRUZIONI.md` sul dover fare hard refresh.

Va sistemato **prima** dello split (rimuovendo i due percorsi fissi, o passando a un precache generato), altrimenti sarà impossibile distinguere un problema di cache causato dallo split da uno che c'era già.

## Una nota sul repo come fonte di verità

Tre disallineamenti rilevati fra documenti, repo e realtà:

- `CLAUDE.md` cita `ask-wine.js` fra le route serverless e dice *«route pronta»*: il file **non esiste** in `api/` (ci sono solo `analyze-label`, `enrich-wine`, `search-image`, `search-website`).
- `PIANO_FIX.md` descrive un'architettura superata (batch 4 e 5 su `bottleOverrides`, `sb.get` malformato) ed è ormai in contraddizione con `CLAUDE.md`. Andrebbe archiviato o eliminato: due roadmap divergenti nello stesso repo costano più di quanto rendano.
- `ISTRUZIONI.md` descrive ancora il localStorage come meccanismo di persistenza e il deploy via drag & drop.

Non sono urgenti, ma sono la stessa classe di problema di D6: **il repo non è la fonte di verità**, e ogni sessione che ci si appoggia parte da premesse sbagliate.

---

# Sintesi operativa

**Database, in ordine:**

1. **A4 / sicurezza** — l'unico punto con rischio irreversibile. Auth + `owner_id` + RLS + `REVOKE EXECUTE` sulle RPC, nell'ordine indicato in D1.
2. **Migrazioni nel repo** (D6) — mezza giornata, elimina la classe di errore più costosa. Non richiede decisioni.
3. **Rating per bevuta** (D5) — decidere presto: ogni valutazione fatta ora sovrascrive dati già divergenti.
4. **Contratto snapshot `bevuti`** (D4) — chiarire la precedenza e allineare `annata`.
5. **Tabella `produttori`** (D3) — sblocca i siti produttore e toglie Slow Wine dal bundle.
6. **Bottiglie come righe** (D2) — solo se formato/posizione/"cosa bere" entrano nel piano. Da decidere **prima** di B e C.

**Codice:**

Lo split non è in conflitto con i vincoli del progetto e non richiede di impegnarsi in anticipo. I passi 1 e 2 sono puro spostamento, mezz'ora, reversibili, e portano `App.jsx` da 2.084 a ~1.630 righe. Sono anche il test più onesto della domanda: se dopo quei due il lavoro non risulta più leggero, la risposta è no e ci si è fermati a costo quasi zero.

Prima di iniziare, sistemare `public/sw.js`.
