# La Mia Cantina (cantina-pwa) — contesto progetto

Sei un software architect senior. Stiamo evolvendo "La Mia Cantina", una PWA personale per la gestione della cantina vini. Lavori sul repo `cantina-pwa`.

## Stack

- React/JSX, stili inline, nessuna libreria CSS. `src/App.jsx` (controller, ~1064 righe) + `src/ui/` (presentazione, 7 file) — vedi "Struttura dei file"
- Material Design 3, seed vinaccia `#7B1D1D` (primary 2.0: `#9B3535`)
- Deploy: Vercel `cantina-pwa-five.vercel.app`, auto-build dal push su GitHub `omarquagliotto90-dotcom/cantina-pwa` (branch `main`) — **si lavora direttamente su `main`, niente branch dedicato/PR di preview salvo richiesta esplicita**
- Env vars su Vercel: `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GEMINI`
- Supabase `etbrgdldduadgbulasmy`, solo REST (`/rest/v1`), nessun SDK
- Route serverless in `/api/`: `analyze-label.js` (Anthropic Vision, `claude-sonnet-4-6`, `temperature: 0`, non cambiare modello), `enrich-wine.js` (Gemini 2.5 Flash con grounding), `search-image.js` (Serper), `ask-wine.js` (`claude-sonnet-5`, `temperature` va omesso o risponde 400)

## Vincoli duri

- Nessuna nuova dipendenza npm
- Nessuna libreria CSS
- Nessun SDK Supabase
- Split di `App.jsx`: **fatto** (refactor strutturale 20/09/2026). La direzione delle dipendenze è `App.jsx → ui/*`, mai il contrario: un file in `ui/` non importa mai `App.jsx`. Nessun file in `ui/` fa `fetch`, conosce Supabase o muta dati
- Vincoli del piano 2.0: solo tre destinazioni (Lista/Cantina, Bevuti, Statistiche) e mai una quarta tab; ~~`RatingDial` sempre~~ → **dal 20/09/2026 il voto si dà con uno slider lineare 1–5 step 0,1 più il numero in un cerchio**, come nel design; **mai stelline** resta; FAB con una sola azione primaria; storico bevuti immutabile; valore di mercato AI sempre mostrato come stima con "~"; **input mai sotto 16px** (confermato contro il design, che li voleva a 14: su iOS fanno zoomare Safari); **niente gradienti né animazioni decorative** (confermato: gli unici movimenti ammessi restano lo slide dello sheet e quello del dettaglio, che già esistono)
- Nel ridisegno della lista si possono aggiungere informazioni, mai toglierne
- `prezzo` a 0 in DB significa sempre NULL/sconosciuto (nessuna distinzione da "regalo", decisione A2b)

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
- `ModalBevi`: il date-picker "data apertura" ha `max` impostato a oggi ma non blocca davvero la selezione di date future su tutti i browser/dispositivi (il vincolo HTML `max` non è enforced ovunque) — non urgente, da sistemare in futuro (probabile fix: validazione esplicita on-change, o CHECK lato DB su `bevuti.consumed_on`)

## Roadmap concordata

Prima i dati, perché gli step 4–6 del piano 2.0 dipendono dal modello.

Storico completo (audit D1-D7, schede decisione Q1-Q3, dettaglio tecnico di ogni passo A0→P3/P1b, migrazioni SQL): **non qui**, per non ripetere. Vedi `ANALISI_ARCHITETTURA.md` (audit e criticità), `PIANO_DATI.md` (piano, decisioni, riepilogo per passo) e `supabase/README.md` (migrazioni). Qui restano solo i passi ancora aperti.

- **A0 → A3, P0, P2, P3, P1b, Refactor strutturale** — **fatti** (18–20/09/2026). Dettaglio in `PIANO_DATI.md` e `ANALISI_ARCHITETTURA.md`
- **A4 / P1** — **rimandato** (Q1 = b). Auth Supabase via REST + RLS per `owner_id`. Dettaglio in `PIANO_DATI.md` (sezione P1)
- **P6** — **prossimo passo** (Q2 = a, 20/09/2026). Bottiglie come righe: nuova tabella `bottiglie(id, wine_id, formato, posizione, acquistata_il, prezzo_pagato, stato, consumed_on, nota, rating)`, `wines` resta anagrafica, `bevuti` diventa `bottiglie WHERE stato='bevuta'`. **Le 9 RPC vanno riscritte.** Rischio alto, difficilmente reversibile, backup JSON obbligatorio. Assorbe i 4 difetti di P4, che decade. Sblocca lo step 9 "cosa bere". Dettaglio in `PIANO_DATI.md` (sezione P6)
- **P5** — dopo P6 (Q3 = sì). Rating sulla riga-bottiglia, card con la media per etichetta
- **B** — interazione: "Bevi" in 2 tap con data modificabile, snackbar "Annulla" al posto delle conferme, stato Lista sollevato in `Cantina()`, cache stale-while-revalidate, `WineForm` unico, "Scheda tecnica" nel dettaglio
- **C** — UI. Dal 20/09/2026 ha una base concreta: il ridisegno fatto in Claude Design, in `design/` (vedi `design/README.md` per i token estratti). Il prototipo è a stili inline, quindi i valori si trasferiscono quasi uno a uno; va tradotto solo il suo layer di template (`{{ }}`, `sc-if`, `sc-for`, `style-hover`) in JSX. **Decisioni prese sul ridisegno:** (1) il voto passa allo slider del design, via `RatingDial`; (2) il dettaglio vino diventa **una pagina unica scrollabile senza tab**, e il sito del produttore diventa un link esterno — `WebsiteView` e l'iframe incorporato spariscono (aveva comunque due bug noti: timeout a 3s e `onLoad` sempre "ok"); (3) dove il design viola i vincoli vincono i vincoli — niente gradienti, input a 16px, nessuna animazione nuova. **Mappatura tipologie:** `Bollicine` = Spumante, `Rosé` = Spumante rosso (solo etichette mostrate, nessun DDL: il CHECK sui 6 valori non cambia). **Aperto:** `produttori.regione` è vuota (0 su 84) e il design la usa in tre punti, compresa la foto di sfondo dell'hero scelta per regione

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
- Fetch sempre `App.jsx` fresco da GitHub raw prima di modificare, salvo modifiche locali non pushate. Se il working tree locale è già allineato al remoto (`git fetch` + `git diff` senza differenze), evitare il fetch raw e usare `Read` mirato solo sulla sezione da toccare, per non far entrare l'intero file in contesto
- Verifica esistenza tabella Supabase: `?select=*&limit=2`, guardare status HTTP — tabella mancante = 404 `PGRST205`, non 200 vuoto. `Prefer: count=exact` non è affidabile per questo
- Dopo DDL su Supabase: `NOTIFY pgrst, 'reload schema'`
- Gemini: struttura risposta `candidates[0].content.parts[].text`, normalizzare perché a volte annidata
- Intervalli di prezzo da enrichment: fare media, poi arrotondare per eccesso a step di 0.5 (`Math.ceil(prezzo*2)/2`)
- Bug iOS PWA swipe-back: risolto con unmount immediato invece di animazione di chiusura
- L'ambiente remoto di Claude Code non ha accesso di rete diretto a `*.supabase.co` (policy dell'agent proxy), ma **il server MCP di Supabase sì**: lettura schema, query, `apply_migration` e advisor funzionano. Verificato il 19/09/2026. Solo `curl`/`fetch` verso il REST restano bloccati
- Ogni DDL su Supabase va committato in `supabase/migrations/` nella stessa sessione in cui viene eseguito (vedi `supabase/README.md`)
- Vercel Hobby: 1 build alla volta (`On-Demand Concurrent Builds: Disabled`); se il collegamento Git si "silenzia" (push che non generano deployment), riconnettere Settings → Git → Disconnect/Connect rigenera il webhook

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
| `src/ui/domain.js` | 69 | funzioni pure: `resolveWine`, `valoreBottiglia`, `costoGiacenza`, `valoreMercatoGiacenza`, `formatDataIt`, anagrafica produttori |
| `src/ui/theme.js` | 31 | `M3`, `S` |

Regole da rispettare quando si tocca questa struttura:

- `BottleImage` e `WebsiteView` fanno rete e cache, quindi **restano in App.jsx** e scendono a `WineDetail` come render prop `renderBottiglia` / `renderSito`, attraverso `Lista` e `Bevuti` che lo montano
- ricerca, filtro e vino selezionato sono **stato locale di `Lista.jsx`**: sollevarli in `Cantina()` li farebbe sopravvivere al cambio tab, cioè cambierebbe il comportamento. È lo step B della roadmap
- la revisione sta in **un solo posto**: la costante `REV` in cima ad `App.jsx`, mostrata accanto al titolo nell'app bar. Sale di 0.1 a ogni modifica di `App.jsx`. `src/version.js` è stato cancellato (era fermo a 0.3 e non lo importava nessuno) e il commento d'intestazione non porta più un numero: erano le due fonti di disallineamento

## Stato attuale (REV 0.5)

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
- Le decisioni Q1 (login, rimandato), Q2 (bottiglie come righe, sì) e Q3 (rating per bevuta, sì) sono chiuse: motivazione completa in `PIANO_DATI.md`
