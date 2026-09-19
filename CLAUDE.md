# La Mia Cantina (cantina-pwa) — contesto progetto

Sei un software architect senior. Stiamo evolvendo "La Mia Cantina", una PWA personale per la gestione della cantina vini. Lavori sul repo `cantina-pwa`.

## Stack

- React/JSX, singolo file `src/App.jsx` (~2016 righe), stili inline, nessuna libreria CSS
- Material Design 3, seed vinaccia `#7B1D1D` (primary 2.0: `#9B3535`)
- Deploy: Vercel `cantina-pwa-five.vercel.app`, auto-build dal push su GitHub `omarquagliotto90-dotcom/cantina-pwa` (branch `main`) — **si lavora direttamente su `main`, niente branch dedicato/PR di preview salvo richiesta esplicita**
- Env vars su Vercel: `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GEMINI`
- Supabase `etbrgdldduadgbulasmy`, solo REST (`/rest/v1`), nessun SDK
- Route serverless in `/api/`: `analyze-label.js` (Anthropic Vision, `claude-sonnet-4-6`, `temperature: 0`, non cambiare modello), `enrich-wine.js` (Gemini 2.5 Flash con grounding), `search-image.js` (Serper), `ask-wine.js` (`claude-sonnet-5`, `temperature` va omesso o risponde 400)

## Vincoli duri

- Nessuna nuova dipendenza npm
- Nessuna libreria CSS
- Nessun SDK Supabase
- Split di `App.jsx` in più file: in discussione, nessuna decisione presa — non farlo senza via libera esplicita
- Vincoli del piano 2.0: solo tre destinazioni (Lista, Bevuti, Statistiche) e mai una quarta tab; `RatingDial` sempre, mai stelline; FAB con una sola azione primaria; storico bevuti immutabile; valore di mercato AI sempre mostrato come stima con "~"; input mai sotto 16px; niente gradienti né animazioni decorative
- Nel ridisegno della lista si possono aggiungere informazioni, mai toglierne

## Stato reale verificato il 18/09/2026

- `wines`: 125 righe, di cui 93 con bottiglie > 0, per 120 bottiglie totali. Id massimo 136
- `bevuti`: 46 righe. `wine_images`: 61. `wine_websites`: 29
- `extra_wines` e `wine_overrides` non esistono (404 PGRST205). Le tabelle attive sono 4
- `App.jsx` è a v0.3: `useCantinaData()` non è stato estratto, `handleSalva`, `handleSalvaModifica` e `handleSchedaTecnica` sono inline in `Cantina()`, la tab "AI" di `ask-wine` non è ancora in `WineDetail`

## Audit schema (passo A0, completato)

PostgreSQL 17.6. Estensioni presenti: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`. Assenti `unaccent` e `pg_trgm`.

Schema:
- `wines(id int4 NOT NULL, produttore text NOT NULL, vino text NOT NULL, annata text NOT NULL DEFAULT 'n.d.', tipologia text NOT NULL, bottiglie int4 NOT NULL DEFAULT 1, prezzo numeric NOT NULL DEFAULT 0, vitigno, macerazione, fermentazione, malolattica, note, note_cantina, denominazione, valore numeric, slow_vino_bott bool NOT NULL DEFAULT false, created_at timestamptz)`
- `bevuti(uid int8 NOT NULL, wine_id int4 NOT NULL, data text NOT NULL, nota text DEFAULT '', rating numeric(2,1) DEFAULT 0, produttore, vino, annata, tipologia, prezzo, created_at timestamp SENZA fuso)`
- `wine_images(wine_id int4 PK, image_url text NOT NULL, created_at timestamptz)`
- `wine_websites(produttore text PK, url text NOT NULL, source text DEFAULT 'serper', created_at timestamptz)`
- `tipologia` (`wines`): lista chiusa lato client in `TIPO`/`FILTERS` di `App.jsx` — Rosso fermo, Bianco fermo, Orange, Spumante, Spumante rosso, Sidro
- `denominazione` (`wines`): lista chiusa di acronimi (DOC, DOCG, IGT, AOC, IGP, QbA, QmP, AVA, n.d.) o NULL; il nome esteso sta in `vino`

Criticità confermate:
1. Scritture anonime. `anon` ha SELECT, INSERT, UPDATE e DELETE su tutte e 4 le tabelle. `bevuti` e `wine_websites` non hanno RLS. Su `wines` la policy "modifica autenticata" è in realtà `ALL` al ruolo `public` con `USING(true)`. Utenti in Auth: 0. La chiave publishable è nel bundle
2. Zero vincoli oltre alle PK: nessuna FK, nessun CHECK, nessun UNIQUE. Nessun trigger, funzione, sequenza o vista in `public`: lo spazio per le RPC è libero
3. `wine_images` non ha policy DELETE. La DELETE dell'app tocca 0 righe, PostgREST risponde 204 e `sb.delete` restituisce `true`: la pulizia immagini in `handleElimina` non ha mai funzionato
4. Due orfani, stesso vino: bevuto e immagine con `wine_id` 76 (Francesco Mariani – Raina, Umbria Grechetto), cancellato fisicamente da `wines`
5. `wines.id` senza identity né default: il client calcola `max(id)+1`, quindi race e riuso di id dopo un hard delete. `resolveWine` privilegia `wines` sullo snapshot, perciò lo storico può finire agganciato al vino sbagliato
6. Operazioni non atomiche: "Bevi" è insert + patch in due round-trip, con bottiglie lette dallo stato locale. Su rete lenta o con due dispositivi si perdono aggiornamenti
7. Date come testo: `bevuti.data` è "7 giugno 2025" in 46 righe su 46. Tutte convertibili (0 non parsabili). `bevuti.created_at` è senza fuso, le altre tabelle usano `timestamptz`
8. Vuoti ambigui: `prezzo` NOT NULL DEFAULT 0 (16 referenze in cantina a 0), `annata` NOT NULL DEFAULT 'n.d.' (26 righe), `denominazione` con 14 NULL e 51 'n.d.', segnaposto "—" salvati nel DB (47 in macerazione, 35 in malolattica), `rating` DEFAULT 0

## Debito nel codice

Misurato su `App.jsx`: 303 oggetti `style={{}}` inline, 114 ripetizioni di `fontFamily: 'Roboto'`, 59 colori hex distinti con 65 occorrenze fuori dai token M3, 54 SVG inline, 7 `fetch` che bypassano il client `sb`, 5 `catch` vuoti.

Effetto principale: la stessa grandezza ha formule diverse in punti diversi. Sullo stesso dataset il valore della cantina risulta 1.566 € nell'header (prezzo × bottiglie), 1.457,5 € in Statistiche (valore × bottiglie, ignora 61 bottiglie senza valore) e 2.051,5 € con il fallback. I bevuti valgono 1.055 € nella tab Bevuti e 114 € in Statistiche.

Altri bug aperti:
- `BottleImage`: se il componente si rimonta mentre una ricerca è in coda, esce senza aggiornare lo stato e lo spinner resta infinito
- Lista: l'annata compare due volte nella card; il chevron punta in basso invece che a destra
- Input sotto i 16px: ricerca (14px) e textarea di `ModalBevi` (14px) causano lo zoom su iOS
- Modifica da Bevuti di un vino orfano: l'upsert ricrea la riga in `wines` con 0 bottiglie e segnaposto "—"
- `WebsiteView`: timeout di 3s marca "bloccato" siti validi su rete lenta; con iframe cross-origin `onLoad` va sempre in "ok" anche a pagina bianca
- `TipoBadge`: una tipologia sconosciuta diventa "Bianco fermo" senza avviso
- `loadData` non distingue errore HTTP da risultato vuoto: su rete lenta appare "Nessun vino trovato"
- `handleRate` sovrascrive il voto di tutte le bevute dello stesso vino (5 vini hanno già voti divergenti)
- `ModalAggiungi` e `ModalModifica` duplicano il form, con validazioni diverse; l'enrichment è duplicato in due punti con logiche di merge diverse
- `Card` è definito dentro `TabStatistiche`, quindi si rimonta a ogni render
- Filtri, ricerca e scroll della Lista si perdono cambiando tab
- Il FAB cambia significato ("Scheda tecnica") e resta sopra il `WineDetail`

## Roadmap concordata

Prima i dati, perché gli step 4–6 del piano 2.0 dipendono dal modello.

- **A0** — fatto. Audit schema in sola lettura
- **A2a** — fatto (19/09/2026). Backup JSON eseguito, orfano vino 76 pulito (0 orfani residui su `bevuti`/`wine_images`), FK `wine_images`→`wines` ON DELETE CASCADE, FK `bevuti`→`wines` ON DELETE SET NULL + indice `idx_bevuti_wine_id`, CHECK su `bottiglie`/`prezzo`/`valore`/`tipologia`/`denominazione`/`rating`, `bevuti.consumed_on date` NOT NULL (default oggi Europe/Rome, backfill da testo italiano completato), `bevuti.created_at` convertito a `timestamptz`, indice UNIQUE `idx_wines_unique_normalizzato` su produttore/vino/annata normalizzati. Verificato via SQL Editor: tutti i vincoli, FK e indici presenti, 0 righe orfane
- **A1** — fatto (19/09/2026). `sb` con AbortController+timeout (15s), contratto di ritorno invariato; `sb.getOrThrow` per distinguere errore HTTP/timeout da vuoto. Funzioni pure: `normalizzaWine`, `resolveWine`, `valoreBottiglia` (mercato con fallback prezzo), `costoGiacenza` (prezzo×bottiglie, sostituisce le 3 duplicazioni in header/TabLista/Statistiche — **decisione presa: header e "Costo" in Statistiche restano costo d'acquisto, non valore di mercato**), `valoreMercatoGiacenza` (con fallback, non ignora più le bottiglie senza stima AI). Fix: "vini bevuti" in Statistiche allineato a "valore consumato" di Bevuti (stessa formula/fallback allo snapshot storico, non più azzerato per i vini cancellati). Estratto `useCantinaData()` da `Cantina()`; `wines` ora caricato via `sb.getOrThrow` invece di un fetch che bypassava `sb`; su fallimento del caricamento iniziale ora popola `dbError` invece di fallire in silenzio. Validato con `esbuild` (sintassi ok), non ancora verificato in browser
- **A2b** — contract, richiede A1: "—" e 'n.d.' a NULL, `annata` a `smallint` NULL, `prezzo` 0 a NULL se confermato, `rating` default NULL con CHECK 1–5, drop di `bevuti.data`
- **A3** — RPC atomiche: `bevi_bottiglia`, `riporta_bottiglia`, `aggiungi_o_incrementa`; identity su `wines.id` (start 137) con `setval` al passaggio; poi revoca ad `anon` delle DML dirette
- **A4** — Auth Supabase via REST + RLS per `owner_id`, rinomina policy fuorvianti
- **B** — interazione: "Bevi" in 2 tap con data modificabile, snackbar "Annulla" al posto delle conferme, stato Lista sollevato in `Cantina()`, cache stale-while-revalidate, `WineForm` unico, "Scheda tecnica" nel dettaglio
- **C** — UI (step 1–3, 5, 6 del piano 2.0): token tipografia/shape/colore, primitive `Button`/`Card`/`Field`/`Sheet`, riga Lista più densa, ordinamenti, palette M3 unica in `WineDetail`, card "Qualità dati" e trend in Statistiche

## Workflow obbligatorio

1. Un passo alla volta. Mai anticipare i passi successivi, mai accorpare modifiche non richieste, mai decisioni estetiche autonome
2. Prima di scrivere codice: scheda decisione con al massimo 3 domande, e solo su ciò che non è già deciso
3. Leggi le sezioni rilevanti prima di toccarle. Modifiche chirurgiche: mai riscrivere `App.jsx` per intero
4. Se la modifica tocca i dati: `curl` sulle tabelle Supabase coinvolte prima dell'edit (**limite noto**: da questo ambiente remoto la policy di rete blocca `etbrgdldduadgbulasmy.supabase.co` — i check vanno delegati a script che Omar esegue in locale, o incorporati come pre-check live nello script SQL stesso)
5. Valida la sintassi prima di proporre il commit (build locale o parser JSX)
6. Deploy: commit e push su `main`, Vercel builda da solo
7. Chiudi ogni passo con una checklist di verifica manuale

Fallback se una sostituzione di testo fallisce per match multiplo/nullo: script mirato con replace puntuale (max 1 occorrenza).

## Comunicazione

- Italiano, risposte concise
- Approvazioni spesso a una parola ("Procedi", "Ok") tra uno step e l'altro — non anticipare lo step successivo
- Niente spiegazioni tecniche dettagliate se non richieste

## Endpoint utili

```
REST:   https://etbrgdldduadgbulasmy.supabase.co/rest/v1
Header: apikey + Authorization: Bearer sb_publishable_OKQmpbDBpDbPTOmKclMwZw_fRtg1KKR
Raw:    https://raw.githubusercontent.com/omarquagliotto90-dotcom/cantina-pwa/main/src/App.jsx
```

## Learnings tecnici (da non re-imparare a caro prezzo)

- `claude-sonnet-5`: mai `temperature` non-default (400 error)
- `analyze-label.js` resta su `claude-sonnet-4-6`, `temperature: 0`
- Fetch sempre `App.jsx` fresco da GitHub raw prima di modificare, salvo modifiche locali non pushate
- Verifica esistenza tabella Supabase: `?select=*&limit=2`, guardare status HTTP — tabella mancante = 404 `PGRST205`, non 200 vuoto. `Prefer: count=exact` non è affidabile per questo
- Dopo DDL su Supabase: `NOTIFY pgrst, 'reload schema'`
- Gemini: struttura risposta `candidates[0].content.parts[].text`, normalizzare perché a volte annidata
- Intervalli di prezzo da enrichment: fare media, poi arrotondare per eccesso a step di 0.5 (`Math.ceil(prezzo*2)/2`)
- Bug iOS PWA swipe-back: risolto con unmount immediato invece di animazione di chiusura
- L'ambiente remoto di Claude Code non ha accesso di rete a `*.supabase.co` (policy dell'agent proxy): qualunque verifica dati va delegata a Omar (script locale) o resa un pre-check live dentro lo script SQL da eseguire nel SQL Editor
- Vercel Hobby: 1 build alla volta (`On-Demand Concurrent Builds: Disabled`); se il collegamento Git si "silenzia" (push che non generano deployment), riconnettere Settings → Git → Disconnect/Connect rigenera il webhook

## Stato attuale (v0.3, ~2016 righe)

- `useCantinaData()` hook **non ancora estratto** — `loadData` resta funzione locale in `Cantina()`
- `handleSalva`, `handleSalvaModifica`, `handleSchedaTecnica` restano inline in `Cantina()`
- Feature chatbot AI (`ask-wine.js`) in corso: route pronta, **Step 2 in sospeso** (tab "AI" + componente `AskAI` in `WineDetail`, in attesa di conferma)
- `RatingDial` SVG implementato (arco 300°, gradiente `#F4D35E`→`#7B1D1D`, drag, checkpoint 1-5); `bevuti.rating` è `numeric(2,1)`
- `TipoBadge`, `PressableRow`, costante di stile `S` già estratti come astrazioni condivise

## Decisioni già prese

- Il deploy lo fa l'assistente, con push su GitHub (lavora direttamente su `main`)
- Nella lista si aggiungono informazioni, mai toglierne
- Riferimenti visivi: scheda vino in stile e-commerce editoriale, lista in stile app di gestione cantina
- FK di `bevuti` con ON DELETE SET NULL

## Decisioni ancora aperte

1. Rating per bevuta o per vino. Raccomandato: per bevuta, coerente con lo storico immutabile, e lo schema è già così
2. Login: introdurlo cambia il primo avvio dell'app
3. "Riporta in cantina": tenerlo come correzione con undo, o rimuoverlo
4. `prezzo` a 0: significa sconosciuto (NULL) o regalo (0)?
5. Nuovi campi (finestra di beva, posizione in cantina, formato) che abiliterebbero lo step 9 "cosa bere"
6. Se spacchettare `App.jsx` in più file
