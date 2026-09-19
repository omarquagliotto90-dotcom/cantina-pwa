# Database — schema e migrazioni

Chiude il passo **P0** di `PIANO_DATI.md` (azione D6).

Prima di questa cartella lo schema esisteva solo dentro Supabase e l'unico
resoconto era la prosa di `CLAUDE.md`. Il corpo delle 9 funzioni RPC — la parte
che contiene le transazioni, cioè il pezzo più delicato del sistema — non era
in nessun file del repo.

## La regola

**Ogni DDL eseguito su Supabase è un file in `migrations/`, committato nella
stessa sessione in cui viene eseguito.** Nessuna eccezione: una migrazione
applicata e non committata rimette il repo e il database su due strade diverse,
che è il problema che questa cartella esiste per chiudere.

```
supabase/
  migrations/   storia: un file per DDL, <timestamp>_<nome>.sql
  schema/       fotografia dello stato corrente — generata, non autoritativa
```

Se usi il Supabase MCP, `apply_migration` registra la migrazione e ti
restituisce il `version`: usalo come prefisso del nome file, così l'ordine nel
repo coincide con quello nel database. Con il SQL Editor il timestamp va scelto
a mano nello stesso formato (`YYYYMMDDHHMMSS`).

Dopo un DDL: `NOTIFY pgrst, 'reload schema';` — altrimenti PostgREST continua a
servire il vecchio schema e l'app vede errori che non esistono più.

## Cosa c'è dentro `migrations/`

Le 9 migrazioni sono state **recuperate** da
`supabase_migrations.schema_migrations`, dove Supabase le aveva registrate, e
riscritte fedelmente su file (le dimensioni in byte corrispondono).

| File | Passo |
|---|---|
| `20260919083755_a2b_contract_null_annata_prezzo_rating.sql` | A2b — placeholder → NULL, `annata` a smallint, `prezzo` nullable, `rating` senza sentinel 0 |
| `20260919084448_a2b_bevuti_data_nullable.sql` | A2b — preparazione al drop |
| `20260919085053_a2b_drop_bevuti_data.sql` | A2b — rimozione di `bevuti.data`, sostituita da `consumed_on` |
| `20260919090534_a3_identity_and_rpc_functions.sql` | A3 — identity su `wines.id` e `bevuti.uid`, le 9 RPC |
| `20260919091547_a3_rpc_returns_jsonb.sql` | A3 — 4 RPC riscritte per restituire `jsonb` |
| `20260919092218_a3_revoke_direct_writes.sql` | A3 — revoca INSERT/UPDATE/DELETE ad `anon` |
| `20260919092251_a3_revoke_truncate.sql` | A3 — revoca TRUNCATE ad `anon` |
| `20260919093001_bevi_bottiglia_data_modificabile.sql` | data apertura scelta dall'utente (`p_consumed_on`) |
| `20260919111836_p0_stopgap_valuta_vino_ultima_bevuta.sql` | **P0** — stopgap D5 |
| `20260919120426_p2_wines_updated_at.sql` | **P2** — `updated_at` + trigger (D7c) |
| `20260919120819_p3_fase1_tabella_produttori.sql` | **P3/1** — anagrafica `produttori`, FK su `wines` (D3) |
| `20260919120944_p3_fase2_rpc_produttore_id.sql` | **P3/2** — RPC che popolano `produttore_id` |

### La storia è incompleta, e va saputo

I passi **A0** e **A2a** furono eseguiti nel SQL Editor e non risultano in
`schema_migrations`. Quindi:

> Le migrazioni da sole **non** ricostruiscono il database da zero. Mancano la
> creazione delle 4 tabelle, le FK, i CHECK e gli indici introdotti in A2a.

`schema/current.sql` è l'unica fotografia completa dello stato attuale. Da P0
in poi la storia è continua; per ricostruire da zero servirebbe un baseline
generato dallo stato corrente, che ha senso produrre quando serve davvero
(per esempio per un ambiente di staging).

## Lo stopgap di P0

`valuta_vino` faceva `UPDATE bevuti SET rating = ... WHERE wine_id = ...`:
valutare un vino sovrascriveva il voto di **tutte** le sue bevute. Sul database
reale 7 vini hanno 2 bevute e 5 hanno voti divergenti, quindi ogni valutazione
ne distruggeva uno.

Ora la RPC aggiorna solo la bevuta più recente (`consumed_on`, poi `uid` a
parità) e restituisce l'`uid` toccato. Nessun dato è stato modificato
dall'applicazione della migrazione: cambia solo il comportamento futuro.

Non decide Q3 (rating per bevuta o per vino): ferma la perdita di dati e basta.
La decisione resta a **P5**.

In `App.jsx`, `ratingPerVino()` legge di conseguenza — il voto della bevuta più
recente fra quelle valutate, non più il massimo. Leggere il massimo mentre si
scrive sulla più recente avrebbe fatto "tornare indietro" il voto appena dato.

**Effetto visibile:** 3 vini mostrano ora un voto diverso, perché la degustazione
più recente era stata valutata meno della precedente.

| Vino | Prima (max) | Ora (più recente) |
|---|---|---|
| Vina Krapez — Lapor Belo | 5,0 | 4,5 |
| Vina Krapež — Zelen Vipava | 5,0 | 4,7 |
| Azienda Agricola Adanti — L'Arquata Umbria Rosso | 4,6 | 4,3 |

Gli altri 4 vini con due bevute non cambiano.

## P2 — `updated_at`

Colonna su `wines` più il trigger `set_updated_at()`, `SECURITY INVOKER`.
Backfill da `created_at`, così la colonna nasce già informativa (le date vanno
dal 2026-06-09 al 2026-09-01) invece di avere 125 righe con lo stesso istante.

**Trappola da ricordare:** un backfill di schema è una modifica del database,
non dell'utente. Qualunque `UPDATE` massivo su `wines` in una migrazione futura
deve fare `DISABLE TRIGGER wines_set_updated_at` e riabilitarlo, altrimenti
azzera `updated_at` su tutte le righe e la colonna perde il suo senso. P3 fase 1
lo fa già.

Serve alla cache stale-while-revalidate prevista in B. Da sola non si vede.

## P3 — anagrafica `produttori`

80 produttori estratti dai nomi in `wines`, `wines.produttore_id` NOT NULL con
FK, `sito`/`sito_source` importati da `wine_websites` (26 righe su 29 hanno un
corrispondente), `slow_chiocciola` valorizzata per i 6 nomi che erano hardcoded
nel bundle.

`wines.produttore` (testo) resta popolata in parallelo, perché è ancora la
colonna che l'app legge. Sparirà in **fase 3**, insieme a `wine_websites`.

### Il bug che è emerso strada facendo

`WebsiteView` leggeva la cache così:

```js
sb.get(`wine_websites?produttore=eq.${key}&select=url,source`)
```

ma `sb.get(table)` appende `?order=created_at.asc`, producendo **due `?` nella
stessa query string**. PostgREST riceveva `select=url,source?order=created_at.asc`,
cioè una lista di colonne non valida, e rispondeva 400; `sb.get` inghiottiva
l'errore e restituiva `[]`.

Conseguenza: **la cache dei siti non è mai stata letta**, e ogni apertura della
tab "Web" richiamava Serper da capo. Verificato catturando l'URL costruito dal
client con l'harness e2e.

P3 lo chiude alla radice: il sito arriva con l'anagrafica caricata all'avvio,
quindi non c'è più nessuna query per vino.

Cambiato anche il criterio di salvataggio: il fallback su Google **non** viene
più scritto. Prima finiva in cache come se fosse il sito ufficiale; ora ci
finisce solo un risultato vero. In anagrafica oggi non c'è nessun URL di
ricerca Google, quindi non serve ripulire nulla.

### Lasciato aperto di proposito

`Vina Krapez` e `Vina Krapež` sono lo stesso produttore con due scritture, e
`nome_norm` (`lower(btrim(...))`) non le unifica perché differiscono per un
carattere accentato. Sono due righe in `produttori`. Fonderle è una scelta
editoriale — quale grafia è quella giusta — quindi non l'ho fatta io:

```sql
-- quando hai deciso la grafia canonica
UPDATE wines SET produttore = 'Vina Krapež',
                 produttore_id = (SELECT id FROM produttori WHERE nome = 'Vina Krapež')
WHERE produttore = 'Vina Krapez';
DELETE FROM produttori WHERE nome = 'Vina Krapez';
```

## Da sistemare, notato durante P0

`bevi_bottiglia` esiste in **due overload**: a 3 parametri (residuo di A3) e a 4
(con `p_consumed_on`). Il client chiama sempre con 4 argomenti nominati, quindi
oggi PostgREST risolve correttamente. Resta però codice morto e una potenziale
ambiguità: da rimuovere con un `DROP FUNCTION bevi_bottiglia(int, text, numeric)`
in una migrazione dedicata.

## Verifica dei dati da Claude Code

`CLAUDE.md` registrava come limite noto che da questo ambiente la policy di rete
blocca `etbrgdldduadgbulasmy.supabase.co`. **Il limite non vale per il server
MCP di Supabase**, che non passa dal proxy HTTP: schema, vincoli, policy, grant,
conteggi e `apply_migration` funzionano direttamente. Verificato il 19/09/2026.

Resta vero per `curl` e `fetch` diretti.
