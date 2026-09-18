# La Mia Cantina — contesto progetto

PWA React per gestione cantina vini personale. Single-file, `src/App.jsx`.

## Stack

- React/JSX, single-file (`src/App.jsx`), niente file splitting
- Material Design 3, seed color vinaccia `#7B1D1D` (primary WineDetail 2.0: `#9B3535`)
- Stili inline, no CSS libraries
- Hosting: Vercel `cantina-pwa-five.vercel.app`, auto-deploy da GitHub `omarquagliotto90-dotcom/cantina-pwa`
- Backend: Supabase `etbrgdldduadgbulasmy.supabase.co`, REST fetch raw — **no SDK**
- Env vars su Vercel: `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `GEMINI`

## API routes (`/api/`)

- `analyze-label.js` — Anthropic Vision, `claude-sonnet-4-6`, `temperature: 0` (non cambiare modello)
- `enrich-wine.js` — Gemini 2.5 Flash + Google Search grounding
- `search-image.js` — Serper.dev (Google Images)
- `ask-wine.js` — Claude `claude-sonnet-5`, thinking adattivo di default → **mai passare `temperature`** (400 error)

## Dati

- Tabelle attive: `wines`, `bevuti`, `wine_images`, `wine_websites`
- Tabelle dismesse (404 PGRST205 se interrogate): `extra_wines`, `wine_overrides`
- Dataset: 47 referenze vino, 75 bottiglie
- `wines.id` è `int4` senza autoincrement → nuovi ID = `max(id)+1` su `wines`, `bevuti`, `wine_images`
- `bevuti` è log storico indipendente: snapshot dei campi a consumo, `wines` deletion non deve mai toccarlo
- `denominazione` è lista chiusa di acronimi (DOC, DOCG, IGT, AOC, IGP, QbA, QmP, AVA, n.d.); il nome esteso sta in `vino`

## Vincoli obbligatori (mai violare)

- No nuove dipendenze npm
- No file splitting
- No CSS libraries
- No Supabase SDK
- Nel redesign lista vini: si aggiungono informazioni, mai se ne tolgono di esistenti

## Flusso obbligatorio per ogni modifica di codice

1. Fetch `App.jsx` fresco da GitHub raw (o dalla copia locale se ci sono modifiche in sessione non ancora pushate)
2. Leggere le sezioni rilevanti prima di toccare qualsiasi cosa
3. Dichiarare tutte le ambiguità/decisioni PRIMA di scrivere codice (max 3 domande)
4. Modifiche chirurgiche (`str_replace` / equivalente) — mai riscrivere il file intero
5. Validare il JSX (parser JS con plugin JSX)
6. Se la modifica tocca dati: verificare via curl le tabelle Supabase coinvolte PRIMA della modifica
7. Un passo alla volta — nessuna decisione estetica autonoma, nessuna modifica combinata non richiesta
8. Deploy: commit + push su GitHub → Vercel builda in automatico
9. Dopo il deploy: checklist di verifica manuale

Fallback se una sostituzione di testo fallisce per match multiplo/nullo: script mirato con replace puntuale (max 1 occorrenza).

## Comunicazione

- Italiano, risposte concise
- Approvazioni spesso a una parola ("Procedi", "Ok") tra uno step e l'altro — non anticipare lo step successivo
- Niente spiegazioni tecniche dettagliate se non richieste

## Learnings tecnici (da non re-imparare a caro prezzo)

- `claude-sonnet-5`: mai `temperature` non-default (400 error)
- `analyze-label.js` resta su `claude-sonnet-4-6`, `temperature: 0`
- Fetch sempre `App.jsx` fresco da GitHub raw prima di modificare, salvo modifiche locali non pushate
- Verifica esistenza tabella Supabase: `?select=*&limit=2`, guardare status HTTP — tabella mancante = 404 `PGRST205`, non 200 vuoto. `Prefer: count=exact` non è affidabile per questo
- Dopo DDL su Supabase: `NOTIFY pgrst, 'reload schema'`
- Gemini: struttura risposta `candidates[0].content.parts[].text`, normalizzare perché a volte annidata
- Intervalli di prezzo da enrichment: fare media, poi arrotondare per eccesso a step di 0.5 (`Math.ceil(prezzo*2)/2`)
- Bug iOS PWA swipe-back: risolto con unmount immediato invece di animazione di chiusura

## Stato attuale (v0.3, ~2006 righe)

- `useCantinaData()` hook **non ancora estratto** — `loadData` resta funzione locale in `Cantina()`
- `handleSalva`, `handleSalvaModifica`, `handleSchedaTecnica` restano inline in `Cantina()`
- Feature chatbot AI (`ask-wine.js`) in corso: route pronta, **Step 2 in sospeso** (tab "AI" + componente `AskAI` in `WineDetail`, in attesa di conferma)
- `RatingDial` SVG implementato (arco 300°, gradiente `#F4D35E`→`#7B1D1D`, drag, checkpoint 1-5); `bevuti.rating` è `numeric(2,1)`
- `TipoBadge`, `PressableRow`, costante di stile `S` già estratti come astrazioni condivise

## To-do aperti

- Completare Step 2 di `ask-wine` (tab AI in WineDetail)
- Estrarre `useCantinaData()` (Asse 2 — file pronto, non deployato)
- Estrarre handler rimanenti da `Cantina()`
- **La Mia Cantina 2.0** (avviata settembre 2026): evoluzione progressiva, non riscrittura. Piano in 10 step:
  1. Sistema visivo globale — 2. Lista — 3. WineDetail — 4. Flusso "Bevi" — 5. Bevuti — 6. Statistiche — 7. Aggiunta vino — 8. AI/scheda tecnica — 9. Suggerimenti "cosa bere" — 10. Rifinitura mobile/performance/error handling
  - Vincoli 2.0: solo 3 tab (Lista/Bevuti/Statistiche), RatingDial mai stelline, FAB con una sola azione primaria, storico bevuti immutabile, valore di mercato AI sempre con "~", input ≥16px, no gradienti/animazioni decorative
  - WineDetail va riportato nel sistema M3 vinaccia unico (primary `#9B3535`), palette tipologie mantenuta

## Decisioni ancora aperte

- Se spacchettare `App.jsx` in più file: la regola "no file splitting" è in discussione, nessuna decisione presa
