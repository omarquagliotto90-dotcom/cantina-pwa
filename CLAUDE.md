# La Mia Cantina (cantina-pwa) — contesto progetto

Sei un software architect senior. Stiamo evolvendo "La Mia Cantina", una PWA personale per la gestione della cantina vini. Lavori sul repo `cantina-pwa`.

## Stack

- React/JSX, stili inline, nessuna libreria CSS. `src/App.jsx` (controller, ~1064 righe) + `src/ui/` (presentazione, 7 file) — vedi "Struttura dei file"
- Material Design 3, seed vinaccia `#7B1D1D` (primary 2.0: `#9B3535`)
- Deploy: Vercel `cantina-pwa-five.vercel.app`, auto-build dal push su GitHub `omarquagliotto90-dotcom/cantina-pwa` (branch `main`) — **si lavora direttamente su `main`, niente branch dedicato/PR di preview salvo richiesta esplicita**
- Env vars su Vercel: `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GEMINI`
- Supabase `etbrgdldduadgbulasmy`, solo REST (`/rest/v1`), nessun SDK
- Route serverless in `/api/`: `analyze-label.js` (Anthropic Vision, `claude-sonnet-4-6`, `temperature: 0`, non cambiare modello), `enrich-wine.js` (Gemini 2.5 Flash con grounding), `search-image.js` (Serper, con `punteggioImmagine()` che preferisce bottiglie intere e scontornate), `immagine.js` (proxy per i byte di un'immagine remota: senza, il canvas resta contaminato e il rifilo è impossibile), `ask-wine.js` (`claude-sonnet-5`, `temperature` va omesso o risponde 400)

## Vincoli duri

- Nessuna nuova dipendenza npm
- Nessuna libreria CSS
- Nessun SDK Supabase
- Split di `App.jsx`: **fatto** (refactor strutturale 20/09/2026). La direzione delle dipendenze è `App.jsx → ui/*`, mai il contrario: un file in `ui/` non importa mai `App.jsx`. Nessun file in `ui/` fa `fetch`, conosce Supabase o muta dati
- Vincoli del piano 2.0: solo tre destinazioni (Lista/Cantina, Bevuti, Statistiche) e mai una quarta tab; ~~`RatingDial` sempre~~ → **dal 20/09/2026 il voto si dà con uno slider lineare 1–5 step 0,1 più il numero in un cerchio**, come nel design; **mai stelline** resta; FAB con una sola azione primaria; storico bevuti immutabile; ~~valore di mercato AI sempre mostrato come stima con "~"~~ → **dal 21/09/2026 i "~" sono tolti da tutte e 14 le occorrenze** (decisione di Omar, "tutti, senza eccezioni"): la stima di Gemini si legge come il prezzo pagato, senza segno che la distingua. Resta la parola "stima"/"Stima attuale" dove già c'era; **input mai sotto 16px** (confermato contro il design, che li voleva a 14: su iOS fanno zoomare Safari); **niente gradienti né animazioni decorative** (confermato: gli unici movimenti ammessi restano lo slide dello sheet e quello del dettaglio, che già esistono) — **unica eccezione, decisa il 20/09/2026: il velo sopra la foto di regione nell'hero del dettaglio** (`VELO` in `WineDetail.jsx`). È un gradiente di leggibilità, non decorativo: senza, il titolo serif a 25px finisce sopra un vigneto. Vale lì e basta, non è un precedente
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
- Il FAB cambia ancora significato: dal 21/09/2026 la slot in basso a destra ospita il **"+"** quando si sfoglia la Cantina e **"Scheda tecnica"** quando e' aperto un dettaglio. Il "+" si nasconde sull'overlay (c'e' un test), "Scheda tecnica" no: **resta sopra il `WineDetail`**, e finche' non si sposta dentro il dettaglio — step B — la slot continua ad avere due significati
- `ModalBevi`: il date-picker "data apertura" ha `max` impostato a oggi ma non blocca davvero la selezione di date future su tutti i browser/dispositivi (il vincolo HTML `max` non è enforced ovunque) — non urgente, da sistemare in futuro (probabile fix: validazione esplicita on-change, o CHECK lato DB su `bevuti.consumed_on`)

## Roadmap concordata

Prima i dati, perché gli step 4–6 del piano 2.0 dipendono dal modello.

- **A0** — fatto. Audit schema in sola lettura
- **A2a** — fatto (19/09/2026). Backup JSON eseguito, orfano vino 76 pulito (0 orfani residui su `bevuti`/`wine_images`), FK `wine_images`→`wines` ON DELETE CASCADE, FK `bevuti`→`wines` ON DELETE SET NULL + indice `idx_bevuti_wine_id`, CHECK su `bottiglie`/`prezzo`/`valore`/`tipologia`/`denominazione`/`rating`, `bevuti.consumed_on date` NOT NULL (default oggi Europe/Rome, backfill da testo italiano completato), `bevuti.created_at` convertito a `timestamptz`, indice UNIQUE `idx_wines_unique_normalizzato` su produttore/vino/annata normalizzati. Verificato via SQL Editor: tutti i vincoli, FK e indici presenti, 0 righe orfane
- **A1** — fatto (19/09/2026). `sb` con AbortController+timeout (15s), contratto di ritorno invariato; `sb.getOrThrow` per distinguere errore HTTP/timeout da vuoto. Funzioni pure: `normalizzaWine`, `resolveWine`, `valoreBottiglia` (mercato con fallback prezzo), `costoGiacenza` (prezzo×bottiglie, sostituisce le 3 duplicazioni in header/TabLista/Statistiche — **decisione presa: header e "Costo" in Statistiche restano costo d'acquisto, non valore di mercato**), `valoreMercatoGiacenza` (con fallback, non ignora più le bottiglie senza stima AI). Fix: "vini bevuti" in Statistiche allineato a "valore consumato" di Bevuti (stessa formula/fallback allo snapshot storico, non più azzerato per i vini cancellati). Estratto `useCantinaData()` da `Cantina()`; `wines` ora caricato via `sb.getOrThrow` invece di un fetch che bypassava `sb`; su fallimento del caricamento iniziale ora popola `dbError` invece di fallire in silenzio. Validato con `esbuild` (sintassi ok), non ancora verificato in browser
- **A2b** — fatto (19/09/2026). Placeholder "—"/"n.d." → NULL su `macerazione`/`fermentazione`/`malolattica`/`denominazione` (CHECK denominazione non ammette più 'n.d.'). `wines.annata`: text NOT NULL → `smallint` NULL (indice UNIQUE normalizzato ricreato senza `trim()` su annata). `wines.prezzo`: NOT NULL DEFAULT 0 → NULL quando sconosciuto (decisione presa: 0 sempre → sconosciuto, nessuna distinzione "regalo"). `bevuti.rating`: default NULL, CHECK senza più il ramo `= 0`. `bevuti.data` eliminata (sostituita da `consumed_on`, aggiunta in A2a). Eseguito in 3 fasi per sicurezza: (1) codice compatibile col vecchio schema, (2) migrazione SQL diretta via Supabase MCP, (3) fix urgente post-migrazione (annata/prezzo nel codice non erano ancora allineati al nuovo tipo — corretto entro pochi minuti), (4) rimozione scrittura `bevuti.data` + drop colonna. `App.jsx`: nuovi helper `opzionale()`, `annataDaForm()`, `formatDataIt()`; `normalizzaWine` ora normalizza anche `annata` (numero o "n.d." per display)
- **A3** — fatto (19/09/2026). Identity su `wines.id` (continua da 137) e `bevuti.uid` (continua dal max epoch-ms esistente). 9 funzioni RPC SECURITY DEFINER coprono **tutte** le scritture dell'app (non solo le 3 nominate in origine, per decisione presa): `bevi_bottiglia`, `riporta_bottiglia`, `elimina_bottiglia`, `aggiungi_o_incrementa` (upsert sull'indice UNIQUE di A2a, sostituisce la dedup lato client), `modifica_vino`, `aggiorna_scheda_tecnica`, `valuta_vino`, `salva_immagine_vino`, `salva_sito_produttore`. Permessi INSERT/UPDATE/DELETE/TRUNCATE revocati ad `anon` su tutte e 4 le tabelle (resta SELECT + EXECUTE sulle RPC). `App.jsx`: nuovo `sb.rpc()`, i 7 handler di scrittura riscritti per chiamare le RPC invece di insert/patch/delete diretti; `bevi_bottiglia` usa un uid temporaneo negativo lato client, riallineato al valore reale dopo la risposta. Verificato via `get_advisors`: gli avvisi sulle RPC eseguibili da `anon` sono attesi (è il meccanismo); RLS mancante su `bevuti`/`wine_websites` è la stessa criticità di A0, non aggravata, di competenza A4
- **P0** — fatto (19/09/2026). Chiude D6 e mette in sicurezza D5. Cartella `supabase/`: le 8 migrazioni esistenti recuperate da `supabase_migrations.schema_migrations` e committate in `migrations/`, più `schema/current.sql` come unica fotografia completa (A0 e A2a furono eseguiti nel SQL Editor e non sono registrati, quindi le migrazioni da sole non ricostruiscono il DB da zero). Regola d'ora in poi: ogni DDL è un file committato nella stessa sessione in cui viene eseguito. **Stopgap D5**: `valuta_vino` non sovrascrive più il voto di tutte le bevute del vino ma solo della più recente (`consumed_on`, poi `uid`); `App.jsx` ha il nuovo helper puro `ratingPerVino()` che legge dove si scrive. Nessun dato modificato dalla migrazione; cambiano i voti mostrati per 3 vini (Krapez Lapor Belo 5,0→4,5, Krapež Zelen 5,0→4,7, Adanti L'Arquata 4,6→4,3), perché la degustazione più recente era stata valutata meno. Non decide Q3, che resta a P5. Notato: `bevi_bottiglia` ha un overload a 3 parametri residuo di A3, codice morto da droppare. Verificato con la suite e2e: 15/15
- **P2** — fatto (19/09/2026). `wines.updated_at` NOT NULL DEFAULT now(), mantenuta dal trigger `set_updated_at()` (SECURITY INVOKER, condiviso con `produttori`). Backfill da `created_at`, quindi la colonna nasce informativa. Prerequisito della cache stale-while-revalidate di B; da sola non si vede. **Trappola registrata:** ogni backfill massivo futuro su `wines` deve fare `DISABLE TRIGGER wines_set_updated_at`, altrimenti azzera `updated_at` ovunque
- **P3** — fatto (19/09/2026), fase 3 aperta. Anagrafica `produttori(id, nome, nome_norm UNIQUE generata, sito, sito_source, slow_chiocciola, regione)`: 80 righe dai nomi in `wines`, `wines.produttore_id` NOT NULL con FK, siti importati da `wine_websites` (26/29), `slow_chiocciola` per i 6 nomi che erano nel bundle. Nuova RPC `risolvi_produttore()` find-or-create usata da `aggiungi_o_incrementa` e `modifica_vino` (necessaria subito: la FK NOT NULL le avrebbe fatte fallire); `salva_sito_produttore` scrive su `produttori`. Client: `SW_CANTINA_CHIOCCIOLA` e `SW_VINO_BOTTIGLIA` rimossi, mappa `produttoriByNome` a livello di modulo così nessun call site di `hasCantina` cambia. **Bug reale chiuso:** la cache dei siti non era mai stata letta — `sb.get` appendeva `?order=` a un percorso che aveva già `?`, PostgREST rispondeva 400 e l'errore veniva inghiottito, quindi ogni apertura della tab Web richiamava Serper (era `F18` del vecchio PIANO_FIX). Il fallback Google non viene più salvato come sito ufficiale. **Fase 3 da fare:** drop di `wines.produttore` e di `wine_websites`. Lasciata aperta la fusione `Vina Krapez` / `Vina Krapež` (scelta editoriale, SQL pronto in `supabase/README.md`). Suite e2e: 19/19
- **A4 / P1** — **rimandato (Q1 = b).** Auth Supabase via REST + RLS per `owner_id`, rinomina policy fuorvianti. Vedi `PIANO_DATI.md`: la revoca dei permessi di A3 ha spostato la superficie d'attacco sulle RPC (eseguibili da `anon`), non l'ha ridotta
- **P1b** — fatto (20/09/2026), in tre sotto-passi e in ordine invertito rispetto al piano: prima l'export, unica parte a rischio zero e rete di sicurezza delle altre due. **P1b.1** `scripts/backup.mjs` + GitHub Action settimanale (commit con `[skip ci]`, credenziali lette da `src/App.jsx`); primo export reale verificato. **P1b.2** `wines.deleted_at`: `elimina_bottiglia` non cancella più la riga dell'ultima bottiglia, `aggiungi_o_incrementa` la resuscita azzerando `deleted_at` — un vino riaggiunto torna con id, immagine e storico. Client: `sb.getOrThrow` accetta un filtro, `loadData` usa `deleted_at=is.null`. **P1b.3** `audit_log` + helper `registra_audit` non eseguibile da `anon`: 8 RPC su 9 registrano la riga completa **prima** della modifica (`salva_immagine_vino` no, è una cache di URL), e `riporta_bottiglia` — l'unico DELETE fisico rimasto — ci scrive dentro la bevuta cancellata per intero. **Scostamenti motivati:** indice unico lasciato totale, FK `wine_images` lasciata CASCADE, nessun soft delete su `bevuti` (con Q2 = a la assorbe P6). Suite e2e 20/20
- **P6** — **prossimo passo** (Q2 = a, 20/09/2026). Bottiglie come righe: nuova tabella `bottiglie(id, wine_id, formato, posizione, acquistata_il, prezzo_pagato, stato, consumed_on, nota, rating)`, `wines` resta anagrafica, `bevuti` diventa `bottiglie WHERE stato='bevuta'`. **Le 9 RPC vanno riscritte.** Rischio alto, difficilmente reversibile, backup JSON obbligatorio. Assorbe i 4 difetti di P4, che decade. Sblocca lo step 9 "cosa bere"
- **P5** — dopo P6 (Q3 = sì). Rating sulla riga-bottiglia, card con la media per etichetta
- **B** — interazione: "Bevi" in 2 tap con data modificabile, snackbar "Annulla" al posto delle conferme, stato Lista sollevato in `Cantina()`, cache stale-while-revalidate, `WineForm` unico, "Scheda tecnica" nel dettaglio
- **Refactor strutturale** — fatto (20/09/2026). Presentazione separata dalla logica applicativa, così il ridisegno visivo della fase C non può toccare la logica di business. `App.jsx` 2119 → 1064 righe, nuova cartella `src/ui/` (7 file). Codice spostato **verbatim**: le uniche differenze sono le render prop `renderBottiglia`/`renderSito`, più il contatore `REV` accanto al titolo (unica modifica visibile, richiesta esplicita). Non toccati di proposito: i 3 modali, `useCantinaData`, `Card` annidata in `TabStatistiche`, props morte. Verificato a ogni passo con build e suite e2e (19/19) e confronto riga per riga con gli originali
- **C** — UI. Dal 20/09/2026 ha una base concreta: il ridisegno fatto in Claude Design, in `design/` (vedi `design/README.md` per i token estratti). Il prototipo è a stili inline, quindi i valori si trasferiscono quasi uno a uno; va tradotto solo il suo layer di template (`{{ }}`, `sc-if`, `sc-for`, `style-hover`) in JSX. **Decisioni prese sul ridisegno:** (1) il voto passa allo slider del design, via `RatingDial`; (2) il dettaglio vino diventa **una pagina unica scrollabile senza tab**, e il sito del produttore diventa un link esterno — `WebsiteView` e l'iframe incorporato spariscono (aveva comunque due bug noti: timeout a 3s e `onLoad` sempre "ok"); (3) dove il design viola i vincoli vincono i vincoli — niente gradienti, input a 16px, nessuna animazione nuova. **Mappatura tipologie:** `Bollicine` = Spumante, `Rosé` = Spumante rosso (solo etichette mostrate, nessun DDL: il CHECK sui 6 valori non cambia). (4) la foto di sfondo dell'hero per regione **si fa**, con il gradiente del design come eccezione al vincolo (vedi "Vincoli duri"). **Chiuso:** `produttori.regione` era vuota e bloccava i tre punti in cui il design la usa; dal 20/09/2026 è popolata (77 su 84). **Aperto:** le foto vere. Il bundle ne ha solo due, Piemonte e Toscana, che in questa cantina valgono 1 bottiglia su 118: le carica Omar in `public/regioni/` (vedi il README lì per nomi, formato e classifica delle regioni per bottiglie). Finché non arrivano, il meccanismo c'è ma l'hero resta a fondo pieno

## Workflow obbligatorio

1. Un passo alla volta. Mai anticipare i passi successivi, mai accorpare modifiche non richieste, mai decisioni estetiche autonome
2. Prima di scrivere codice: scheda decisione con al massimo 3 domande, e solo su ciò che non è già deciso
3. Leggi le sezioni rilevanti prima di toccarle. Modifiche chirurgiche: mai riscrivere `App.jsx` per intero
4. Se la modifica tocca i dati: verifica le tabelle Supabase coinvolte **prima** dell'edit, e ancora dopo. Dal 19/09/2026 si fa con il **server MCP di Supabase** (`execute_sql`, `apply_migration`, `list_migrations`, `get_advisors`), che non passa dal proxy HTTP e funziona da questo ambiente. Il vecchio limite di rete vale solo per `curl`/`fetch` diretti verso `etbrgdldduadgbulasmy.supabase.co`, non per l'MCP
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
- L'ambiente remoto di Claude Code non ha accesso di rete diretto a `*.supabase.co` (policy dell'agent proxy), ma **il server MCP di Supabase sì**: lettura schema, query, `apply_migration` e advisor funzionano. Verificato il 19/09/2026. Solo `curl`/`fetch` verso il REST restano bloccati
- Ogni DDL su Supabase va committato in `supabase/migrations/` nella stessa sessione in cui viene eseguito (vedi `supabase/README.md`)
- **Banda vuota sotto la barra su iPhone, PWA standalone (21/09/2026).** Misurato su iPhone 14 Pro Max: viewport 873, `screen.height` 932, `safe-area top` 59, `standalone` true, e l'app riempiva 873 su 873. iOS dà alla webview un frame alto quanto lo schermo **meno il safe-area superiore**, ancorato in alto: l'ammanco affiora tutto come banda in fondo, dipinta dal sistema col `background_color` del manifest. **Tre strade provate e tutte morte:** (1) `position: fixed; inset: 0` al posto di `height: 100dvh` — nessun effetto, l'app riempiva già tutto il viewport riportato; (2) reinstallare l'icona dalla home — non è metadato d'installazione congelato; (3) allungare il guscio con `height: calc(100% + env(safe-area-inset-top))` in standalone — **peggiora**, la webview scarta davvero quel che sta sotto il viewport riportato e la barra di navigazione esce tagliata a metà. Il CSS lì non arriva. **Fix applicato:** `apple-mobile-web-app-status-bar-style` da `black-translucent` a `default` in `index.html` (scelta di Omar, 21/09/2026), così iOS piazza la webview sotto la status bar e la fa arrivare al fondo vero; il safe-area superiore va a 0 e lo spaziatore in cima si annulla da sé. Da tenere d'occhio comunque: `backdrop-filter` su elementi `position: fixed` può promuoverli a un layer di compositing che congela la misura del viewport di quando è stato creato; la barra di navigazione ne ha uno
- **`box-sizing: border-box` e `env()`:** `height: 72` con `padding-bottom: calc(4px + env(safe-area-inset-bottom))` NON fa una barra alta 110px, ne fa una alta 72 con 33px di contenuto. Il safe-area va sommato all'altezza — `height: calc(72px + env(...))` — non lasciato al solo padding. Vale per ogni barra fissa
- **Canvas contaminato dalle immagini hotlinkate (21/09/2026).** Le foto di bottiglia puntano al sito dove sono state trovate: un'immagine cross-origin contamina il canvas e `getImageData()` lancia `SecurityError`. Qualunque lavoro sui pixel — rifilo del margine, scontorno — è impossibile lato client senza far passare i byte dal proprio dominio. Da qui la route `/api/immagine`, che è un proxy e basta: la decodifica resta nel browser perché farla sul server richiederebbe una libreria di image processing, fuori dai vincoli. **Attenzione:** un proxy che scarica URL arbitrarie è un vettore SSRF. I filtri in `indirizzoAmmesso()` (solo https, niente IP letterali, niente host non instradabili) alzano l'asticella ma non sono una difesa completa — un nome pubblico può risolvere a un indirizzo privato. Proporzionato per un'app personale, da irrobustire se un giorno gira accanto a qualcosa di sensibile
- **Scontorno per contiguità, non per colore (21/09/2026).** Rendere trasparente ogni pixel simile al fondo bucherebbe anche il bianco **dentro** l'etichetta. Il flood fill parte dai bordi e si propaga sui contigui, quindi l'interno dell'etichetta non viene mai raggiunto. Due guardie obbligatorie, entrambe trovate da test in rosso: (1) se i quattro angoli non concordano il fondo non è uniforme — foto ambientata — e non si tocca niente; (2) **se il riempimento marcherebbe più del 92% dei pixel, quello che sembrava fondo ERA il soggetto** (una foto senza margini ha gli angoli uguali) e va annullato, altrimenti l'immagine sparisce. Per questo si marca prima e si muta dopo: mutare subito rende impossibile annullare
- **Grid item e dimensione minima automatica (21/09/2026).** Un `<img>` dentro un grid con `place-items: center` **non può rimpicciolirsi sotto il proprio contenuto**: la riga si allarga fino all'altezza naturale dell'immagine. Misurato: contenitore 62×84, `grid-template-rows: 278px`, img 62×279, e `overflow: hidden` che ne mostrava solo la cima. Quindi `height: 100%` e perfino `max-height: 100%` si risolvono contro 278, non contro 84, e `object-fit: contain` non ha mai la possibilità di agire. **Rimedio: `min-width: 0; min-height: 0` sull'item.** Il difetto è rimasto invisibile finché le immagini erano quasi quadrate; è esploso col rifilo, che le rende strette e alte. Quando un'immagine sembra tagliata, misurare il box dell'elemento contro quello del contenitore **prima** di sospettare `object-fit`
- **`objectFit: "cover"` sulle foto di bottiglia:** riempie il riquadro **tagliando**. Su uno scatto prodotto quadrato o orizzontale mangia i lati della bottiglia, ed è il motivo per cui le bottiglie sembravano ritagliate anche quando l'immagine era buona. Per una bottiglia si usa sempre `contain`
- Vercel Hobby: 1 build alla volta (`On-Demand Concurrent Builds: Disabled`); se il collegamento Git si "silenzia" (push che non generano deployment), riconnettere Settings → Git → Disconnect/Connect rigenera il webhook
- **Push ravvicinati → la produzione resta indietro (21/09/2026).** Diverso dal caso sopra: i deployment vengono creati, ma solo **alcuni** ottengono `target: production`; gli altri restano anteprime. Con tre push di fila (Marche, Umbria, Lombardia) la produzione si è fermata a Marche, e le due foto successive erano in repo, verdi nei test e **invisibili nell'app**. Sintomo tipico: "non le vedo ancora tutte" mentre i dati e il codice sono corretti. **Verifica:** `list_deployments` con `target: production` e guardare lo `sha` del più recente — se non è HEAD, la produzione è indietro. **Rimedio:** `create_deployment` con `target: "production"` e `gitSource` sul branch (`request_promote` di un'anteprima risponde 422 su questo piano). Regola pratica: dopo una serie di push, controllare sempre che la produzione sia su HEAD prima di dire che una modifica è online

## Struttura dei file

Dal refactor strutturale del 20/09/2026. `App.jsx` è il **controller**, `src/ui/` è **solo presentazione**.

| File | Righe | Contiene |
|---|---|---|
| `src/App.jsx` | 1070 | client `sb`, `normalizzaWine`, `annataDaForm`, `ratingPerVino`, `opzionale`, cache immagini + `imgQueue`, `DENOMINAZIONI`, `Lightbox`, `BottleImage`, `WebsiteView`, i 3 modali, `useCantinaData`, `Cantina()` con stato e handler |
| `src/ui/components.jsx` | 504 | 22 icone SVG, `TIPO`, `IC`, `TipoLabel`, `TipoBadge`, `PressableRow`, `WineCard`, `RatingDial` |
| `src/ui/WineDetail.jsx` | 211 | `SwBadge`, `WineDetail` |
| `src/ui/Lista.jsx` | 126 | `FILTERS`, `FilterChip`, `TabLista` |
| `src/ui/Statistiche.jsx` | 114 | `TabStatistiche` |
| `src/ui/Bevuti.jsx` | 84 | `TabBevuti` |
| `src/ui/domain.js` | 143 | funzioni pure: `resolveWine`, `valoreBottiglia`, `costoGiacenza`, `valoreMercatoGiacenza`, `formatDataIt`, anagrafica produttori, `riquadroContenuto` (rifilo del margine delle foto, su `ImageData`) |
| `src/ui/theme.js` | 31 | `M3`, `S` |

Regole da rispettare quando si tocca questa struttura:

- `BottleImage` e `WebsiteView` fanno rete e cache, quindi **restano in App.jsx** e scendono a `WineDetail` come render prop `renderBottiglia` / `renderSito`, attraverso `Lista` e `Bevuti` che lo montano. Dal 21/09/2026 lo stesso vale per `Miniatura`, che scende come `renderMiniatura` a `WineCard` e alle righe di Bevuti: rifila il margine, quindi fa rete
- ricerca, filtro e vino selezionato sono **stato locale di `Lista.jsx`**: sollevarli in `Cantina()` li farebbe sopravvivere al cambio tab, cioè cambierebbe il comportamento. È lo step B della roadmap
- la revisione sta in **un solo posto**: la costante `REV` in cima ad `App.jsx`, mostrata accanto al titolo nell'app bar. Sale di 0.1 a ogni modifica di `App.jsx`. `src/version.js` è stato cancellato (era fermo a 0.3 e non lo importava nessuno) e il commento d'intestazione non porta più un numero: erano le due fonti di disallineamento

## Stato attuale (REV 2.0)

- `useCantinaData()` **estratto** (A1); `handleSalva`, `handleSalvaModifica`, `handleSchedaTecnica` restano inline in `Cantina()`
- `REV` è l'unico numero di versione del progetto. Attenzione: misura le modifiche ad `App.jsx`, non i passi della roadmap — P1b.1 e P1b.3 non l'hanno alzato perché non hanno toccato quel file
- Feature chatbot AI (`ask-wine.js`) in corso: route pronta, **Step 2 in sospeso** (tab "AI" + componente `AskAI` in `WineDetail`, in attesa di conferma)
- `RatingDial` SVG implementato (arco 300°, gradiente `#F4D35E`→`#7B1D1D`, drag, checkpoint 1-5); `bevuti.rating` è `numeric(2,1)`
- Il debito misurato nella sezione "Debito nel codice" non è stato ridotto dal refactor: gli stili inline e i colori fuori token sono stati **spostati**, non riscritti. È la fase C

## Decisioni già prese

- Il deploy lo fa l'assistente, con push su GitHub (lavora direttamente su `main`)
- Nella lista si aggiungono informazioni, mai toglierne
- Riferimenti visivi: scheda vino in stile e-commerce editoriale, lista in stile app di gestione cantina
- FK di `bevuti` con ON DELETE SET NULL

## Registro delle decisioni — tutte chiuse al 20/09/2026

1. ~~Rating per bevuta o per vino~~ — **deciso 20/09/2026 (Q3): per bevuta.** `RatingDial` scriverà sulla singola degustazione, la card mostrerà la media per etichetta; i 5 vini con voti divergenti recupereranno i valori reali, già in DB. Combinato con Q2 = a, il rating vive sulla riga-bottiglia: **P5 segue P6**. Fino ad allora resta lo stopgap di P0
2. ~~Login~~ — **deciso 19/09/2026: non ora.** Conseguenza accettata: senza `auth.uid()` il database non distingue Omar da un estraneo, quindi D1 resta aperto e non è mitigabile a metà (qualunque segreto lato client è nel bundle). Al suo posto si riduce la gravità con P1b: soft delete, log append-only, export ripetibile. A4 rientra in piano quando la decisione cambia
3. ~~"Riporta in cantina"~~ — **deciso 20/09/2026: tenerlo, ma come undo.** Diventa la snackbar "Annulla" subito dopo aver bevuto, con finestra di pochi secondi; passata quella, lo storico non si tocca più. Si realizza nello **step B**, insieme alle altre conferme che diventano snackbar. Oggi il bottone nel dettaglio è disponibile sempre ed è l'unica operazione che intacca lo storico
4. ~~Nuovi campi (finestra di beva, posizione in cantina, formato)~~ — **deciso 20/09/2026 (Q2 = a): sì, sono in piano.** Richiedono che le bottiglie diventino righe, quindi **P6 entra in piano** e **P4 decade**. P6 è il passo meno reversibile di tutti: nuova tabella `bottiglie`, `wines` resta anagrafica, le 9 RPC vanno riscritte, migrazione di 120 bottiglie e 46 bevute. Va fatto **dopo P1b**, che rende il backup ripetibile. I 4 difetti che P4 avrebbe corretto (`resolveWine` che privilegia `wines`, `bevuti.annata` ancora `text`, fallback "Bianco fermo", contratto non scritto) vanno risolti **dentro P6**
5. ~~Se spacchettare `App.jsx` in più file~~ — **deciso 20/09/2026: fatto.** Refactor strutturale in 4 passi (Statistiche, WineDetail, Bevuti, Lista), UI invariata, suite e2e 19/19 a ogni passo

## Decisioni prese in A2b

- `prezzo` a 0 → sempre NULL (sconosciuto), nessuna distinzione da "regalo"
