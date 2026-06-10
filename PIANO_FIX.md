# PIANO_FIX — La Mia Cantina

Documento di lavoro per le correzioni post-review v0.3.
Single source: a inizio sessione incolla solo l'header del prompt + le righe del batch; non reincollare l'analisi né il brief lungo (la memoria del Project copre lo stack).

> Le righe indicate sono riferite alla `App.jsx` della review iniziale (1446 righe). Dopo ogni batch si spostano: rilocalizza sempre con `grep -n` prima di modificare.

---

## Decisioni di design (sbloccano i batch 2–4)

| ID | Domanda | Reco | Scelta |
|----|---------|------|--------|
| D1 | Nuovi vini in `wines` (con `Set` id originali per distinguerli dai 47) anziché `extra_wines`? | Sì | ⬜ |
| D2 | Bottiglie a fonte unica: elimino `bottleOverrides`, persisto il conteggio e non scarto più `bottiglie` al load? | Sì | ⬜ |
| D3 | Bevuti 1:N (storicizza più bevute, chiave `uid`) o 1:1 (solo l'ultima)? | 1:N | ⬜ |
| D4 | "Bevuto" scala 1 bottiglia (per-bottiglia) o rimuove l'intera referenza? | Per-bottiglia | ⬜ |

---

## Roadmap a batch (1 batch = 1 sessione)

Raggruppati per zona di codice, così view e validazioni babel si fanno una volta sola.

### Batch 1 — Quick wins  ·  no curl · no decisioni
- **F10** `showDbError` non definita → stato `dbError` + banner. ~1320
- **F1a** commento stale `bottleOverrides` ("ricostruito dai bevuti" è falso). ~1242-1244
- **F2** header conta i bevuti → totali sull'insieme filtrato. ~1347-1348
- **F21** risposta AI `{raw}` → trattala come riconoscimento fallito. ~718-721

### Batch 2 — Distinzione statico/utente  ·  curl `wines`,`extra_wines` · richiede D1
- **F7** (root) cattura `originalIds` al load. ~1214-1258
- **F8** elimina vino utente → `sb.delete("wines",…)`. ~1279-1288
- **F14** `isExtra` basato su `originalIds`, non su `extraWines`. ~1328
- (chiude **F3** come effetto collaterale)

### Batch 3 — Bottiglie fonte unica  ·  curl `wine_overrides` · richiede D2
- **F15** modifica bottiglie persa al reload. ~1245-1248 + ~1334-1336
- **F1b** persistenza reale del decremento. ~1286 + ~1262

### Batch 4 — Modello bevuti  ·  curl `bevuti` · richiede D3, D4
- **F4** "bevuto" per-bottiglia/referenza secondo D4. ~1292-1299 + ~961-963
- **F5** deduplica al load secondo D3. ~1232-1238
- **F22** TabBevuti non deve dipendere dal filtro bottiglie di `allWines`. ~1018 + ~1066-1067

### Batch 5 — Hardening errori  ·  no decisioni
- **F9** `r.ok` sul fetch max-id. ~1311-1314
- **F11** insert ottimistico sporco su `null`. ~1316-1318
- **F16** rollback/segnalazione scritture ottimistiche. righe varie (vedi mappa F16)
- **F17** rating: ripristino su PATCH fallito. ~1341-1344
- **F6** `sb.delete` ritorna esito. ~49-54 + ~1301-1304

### Batch 6 — Serverless + cache  ·  curl `wine_websites`
- **F18** cache siti mai letta (query malformata) → `getWhere`. ~375
- **F13** `mediaType` reale + validazione dimensione. ~700-728
- **F19/F20** (opzionali) `skipRe` su title / timeout Serper.

### Opzionali / no-op
- **F12** campi tecnici nel form di inserimento. ~693, 800-810
- **F3** codice morto `deletedExtraIds` (si chiude con B2).

---

## Prompt riutilizzabile (copia a inizio sessione)

```
PROGETTO: La Mia Cantina — PWA React single-file src/App.jsx (+ 3 serverless /api/*.js).
Stack: React hooks, inline styles, MD3 #7B1D1D, Supabase REST (no SDK), Vercel.
Vincoli fermi: no nuove dipendenze, no split del file, no librerie CSS, no SDK.
Allego App.jsx (= ultima versione prodotta).

SESSIONE: implementa SOLO il Batch <N>. Fix:
<incolla qui le righe del batch da PIANO_FIX.md>
Decisioni: <D? = risposta, se il batch le richiede>

WORKFLOW per ogni fix:
1. cp App.jsx in working dir; grep -n / view SOLO la sezione interessata
2. se tocca scritture DB: curl sulle tabelle coinvolte PRIMA di modificare
3. str_replace chirurgico (mai riscrivere il file); se fallisce, Python content.replace(old,new,1)
4. valida con @babel/parser
5. cp in /mnt/user-data/outputs + present_files

REGOLE:
- Un fix alla volta, nessuna anticipazione di fix non richiesti.
- Dubbi o decisioni → dichiarali PRIMA, non procedere.
- In chat mostra SOLO il diff (old/new) + esito babel, NON l'intero file.
```

---

## Come operare

1. Nuova chat **nello stesso Project** (la memoria conosce già lo stack).
2. Allega l'**ultima** `App.jsx` prodotta (ogni batch riparte da quella precedente, mai dall'originale).
3. Incolla il prompt, scegli il Batch; per B2–B4 rispondi prima alle decisioni.
4. Ricevi `App.jsx` aggiornato → GitHub web UI → sostituisci `src/App.jsx` → commit su `main` → Vercel deploya da solo.
5. Verifica sul PWA con **hard refresh** (il service worker fa cache aggressiva).
6. Aggiorna il Registro qui sotto e passa al batch successivo.

---

## Risparmio token

1. **Una sessione = un batch.** Il file (~108 KB ≈ 25–30k token) si allega 6 volte invece di 22: il risparmio maggiore.
2. **Niente brief lungo:** bastano header del prompt + righe del batch.
3. **Output solo-diff:** il file completo lo scarichi dall'allegato, non in chat.
4. **`grep -n`** per localizzare; `view` mirati di ±20 righe.
5. **Babel una volta a fine batch**, non a ogni micro-edit.
6. **Questo file nel repo** come unico riferimento: incolli poche righe, non l'analisi.

---

## Registro avanzamento

Stato: ⬜ da fare · 🔄 in corso · ✅ fatto · ⏭️ rimandato

| Batch | Fix | Severità | Stato | Note / commit |
|-------|-----|----------|-------|---------------|
| 1 | F10 showDbError | high | ⬜ | |
| 1 | F1a commento bottleOverrides | medium | ⬜ | |
| 1 | F2 header conta bevuti | medium | ⬜ | |
| 1 | F21 AI {raw} fuorviante | low | ⬜ | |
| 2 | F7 originalIds al load (root) | high | ⬜ | |
| 2 | F8 elimina vino utente no-DB | high | ⬜ | |
| 2 | F14 isExtra inaffidabile | medium | ⬜ | |
| 3 | F15 bottiglie modifica persa | high | ⬜ | |
| 3 | F1b persistenza decremento | medium | ⬜ | |
| 4 | F4 bevuto per-referenza | medium | ⬜ | |
| 4 | F5 dedup bevuti 1:1 | medium | ⬜ | |
| 4 | F22 TabBevuti dipende allWines | medium | ⬜ | |
| 5 | F9 max-id senza r.ok | medium | ⬜ | |
| 5 | F11 insert ottimistico sporco | medium | ⬜ | |
| 5 | F16 scritture senza rollback | medium | ⬜ | |
| 5 | F17 rating divergenza PATCH | medium | ⬜ | |
| 5 | F6 sb.delete senza esito | low | ⬜ | |
| 6 | F18 cache siti mai letta | medium | ⬜ | |
| 6 | F13 mediaType + size | medium | ⬜ | |
| 6 | F19 search-image skipRe | low | ⬜ | |
| 6 | F20 search-website timeout | low | ⬜ | |
| opz | F12 campi tecnici nel form | low | ⬜ | |
| opz | F3 codice morto deletedExtraIds | low | ⬜ | |

**Totale:** 22 fix · 4 high · 12 medium · 6 low.
