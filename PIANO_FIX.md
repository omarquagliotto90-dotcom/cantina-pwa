# PIANO_FIX — La Mia Cantina

Documento di lavoro per le correzioni post-review v0.3.
Single source: a inizio sessione incolla solo l'header del prompt + le righe del batch; non reincollare l'analisi né il brief lungo (la memoria del Project copre lo stack).

> Le righe indicate sono riferite alla `App.jsx` corrente (~1436 righe). Dopo ogni batch si spostano: rilocalizza sempre con `grep -n` prima di modificare.

---

## Architettura attuale (aggiornata)

`wines` è l'unica fonte di verità per tutti i vini — niente distinzione statico/utente.
Tabelle `extra_wines` e `wine_overrides` rimosse dal codice. Stati React `extraWines`,
`deletedExtraIds`, `wineOverrides`, `originalIdsRef` non esistono più.

Conseguenza: i fix che citavano quei costrutti sono chiusi per architettura (vedi sotto).

---

## Decisioni di design

| ID | Domanda | Stato |
|----|---------|-------|
| D1 | Fonte unica `wines` per tutti i vini | applicato |
| D2 | Bottiglie fonte unica, elimina `bottleOverrides` | residuo in Batch 4 |
| D3 | Bevuti 1:N, chiave `uid` | applicato |
| D4 | "Bevuto" scala 1 bottiglia | applicato |

---

## Roadmap a batch (1 batch = 1 sessione)

### Batch 1 — Quick wins  ·  COMPLETATO
- F10 `showDbError` -> stato `dbError` + banner — fatto
- F2 header conta i bevuti -> totali su insieme filtrato (`cantina`) — fatto
- F21 risposta AI `{raw}` -> trattata come fail — fatto
- F1a commento stale -> da reverificare (vedi nota Batch 4)

### Batch 2 — Distinzione statico/utente  ·  CHIUSO PER ARCHITETTURA
- F7 / F8 / F14 — non più applicabili: branch unico su `wines`.
- `handleElimina` fa sempre `DELETE` su `wines`; `handleSalvaModifica` fa sempre `upsert` su `wines`.

### Batch 3 — Modello bevuti  ·  COMPLETATO
- F4 "bevuto" scala 1 bottiglia: `setWines` + `sb.patch("wines",...)` in `handleConferma` — fatto
- F5 deduplica rimossa (1:N): `setBevuti(bevFromDb)` diretto, `uid` chiave — fatto
- F22 TabBevuti usa `winesForBevuti` (non filtrato per bottiglie) — fatto

### Batch 4 — Hardening errori  ·  no curl · no decisioni  ·  DA FARE
- F-botOverride  rimuovi `bottleOverrides` (codice morto: `handleElimina` non lo usa più).
  `allWines = wines.filter(w => w.bottiglie > 0)` · `winesForBevuti = wines`. ~1197, 1242-1248
- F9   `r.ok` mancante sul fetch max-id -> rischio `nextId=1` e collisione PK. ~1298-1300
- F11  insert ottimistico sporco: `inserted ?? row` aggiunge il vino anche se l'insert fallisce. ~1303-1305
- F16  `sb.insert("bevuti")` senza catch -> divergenza silenziosa; aggiungi rollback. ~1281
- F6   `sb.delete("bevuti")` senza verifica esito; se fallisce, al reload il vino ritorna. ~47-52 + ~1290
- F17  rating diverge su PATCH fallito (`.catch(console.error)`); rollback rating precedente. ~1322-1324
- F1a  verifica/aggiorna eventuale commento stale residuo su `bottleOverrides`. ~1242-1248

### Batch 5 — Serverless + cache  ·  curl `wine_websites`  ·  DA FARE
- F18  cache siti mai letta (query string malformata in `sb.get`) -> usa `getWhere`. ~375
- F13  AI etichetta: `mediaType` reale da `file.type` + validazione dimensione. ~700-728
- F19/F20  (opzionali) `skipRe` su title / timeout Serper.

### Opzionali / no-op
- F12 campi tecnici nel form di inserimento. ~693, 800-810
- F3 codice morto `deletedExtraIds` -> già rimosso con la nuova architettura.

---

## Prompt riutilizzabile (copia a inizio sessione)

```
PROGETTO: La Mia Cantina — PWA React single-file src/App.jsx (+ 3 serverless /api/*.js).
Stack: React hooks, inline styles, MD3 #7B1D1D, Supabase REST (no SDK), Vercel.
`wines` è l'unica fonte di verità per i vini (niente extra_wines / wine_overrides).
Vincoli fermi: no nuove dipendenze, no split del file, no librerie CSS, no SDK.
Allego App.jsx (= ultima versione prodotta).

SESSIONE: implementa SOLO il Batch <N>. Fix:
<incolla qui le righe del batch da PIANO_FIX.md>

WORKFLOW per ogni fix:
1. cp App.jsx in working dir; grep -n / view SOLO la sezione interessata
2. se tocca scritture DB: curl sulle tabelle coinvolte PRIMA di modificare
3. str_replace chirurgico (mai riscrivere il file); se fallisce, Python content.replace(old,new,1)
4. valida con @babel/parser
5. cp in /mnt/user-data/outputs + present_files UNA VOLTA SOLA a fine batch

REGOLE:
- Un fix alla volta, nessuna anticipazione di fix non richiesti.
- Dubbi o decisioni -> dichiarali PRIMA, non procedere.
- In chat mostra SOLO il diff (old/new) + esito babel, NON l'intero file.
```

---

## Come operare

1. Nuova chat nello stesso Project (la memoria conosce già lo stack).
2. Allega l'ultima `App.jsx` prodotta (ogni batch riparte da quella precedente).
3. Incolla il prompt + le righe del batch.
4. Ricevi `App.jsx` aggiornato -> GitHub web UI -> sostituisci `src/App.jsx` -> commit su `main` -> Vercel deploya da solo.
5. Verifica sul PWA con hard refresh (il service worker fa cache aggressiva).
6. Aggiorna il Registro qui sotto e passa al batch successivo.

---

## Risparmio token

1. Una sessione = un batch. Il file (~108 KB ~ 25-30k token) si allega una volta per batch.
2. Niente brief lungo: bastano header del prompt + righe del batch.
3. Output solo-diff: il file completo lo scarichi dall'allegato, non in chat.
4. `grep -n` per localizzare; `view` mirati di +-20 righe.
5. Babel una volta a fine batch, non a ogni micro-edit.
6. Questo file nel repo come unico riferimento.

---

## Registro avanzamento

Stato: [ ] da fare · [~] in corso · [x] fatto · [-] chiuso per architettura

| Batch | Fix | Severità | Stato |
|-------|-----|----------|-------|
| 1 | F10 showDbError | high | [x] |
| 1 | F2 header conta bevuti | medium | [x] |
| 1 | F21 AI {raw} fuorviante | low | [x] |
| 1 | F1a commento stale | low | [~] reverifica in B4 |
| 2 | F7 distinzione statico/utente | high | [-] |
| 2 | F8 elimina vino utente no-DB | high | [-] |
| 2 | F14 isExtra inaffidabile | medium | [-] |
| 3 | F4 bevuto per-bottiglia | medium | [x] |
| 3 | F5 dedup bevuti rimossa | medium | [x] |
| 3 | F22 TabBevuti winesForBevuti | medium | [x] |
| 4 | F-botOverride codice morto | low | [ ] |
| 4 | F9 max-id senza r.ok | medium | [ ] |
| 4 | F11 insert ottimistico sporco | medium | [ ] |
| 4 | F16 rollback bevuti fallito | medium | [ ] |
| 4 | F6 sb.delete esito | low | [ ] |
| 4 | F17 rating PATCH rollback | medium | [ ] |
| 5 | F18 cache siti mai letta | medium | [ ] |
| 5 | F13 mediaType + size | medium | [ ] |
| 5 | F19/F20 opzionali | low | [ ] |
| opz | F12 campi tecnici nel form | low | [ ] |

Completati: 6 fix (B1 x3, B3 x3).
Chiusi per architettura: F7, F8, F14, F3.
Residui: 9 fix (B4 x6, B5 x2-3, opz) · 0 high · ~6 medium · ~3 low.
