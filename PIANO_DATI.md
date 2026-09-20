# Piano d'azione — fase dati

Deriva da `ANALISI_ARCHITETTURA.md` (Parte 1). Copre le azioni **D1–D7**.
Unità di lavoro: **1 passo = 1 sessione = 1 commit**, come da workflow in `CLAUDE.md`.

Sostituisce `PIANO_FIX.md`, che descriveva un'architettura superata (batch 4–5 su
`bottleOverrides`, `sb.get` malformato) ed era in contraddizione con `CLAUDE.md`.
Eliminato alla chiusura di P0; resta nella storia git se dovesse servire.

---

## Scheda decisione — 3 domande da sciogliere prima di P1

Il resto del piano è già deciso o non richiede scelte. Queste tre invece cambiano
la forma dei passi successivi.

### Q1 · Login (decisione aperta #2) — ✅ DECISO 19/09/2026: **rimandato**

A4 non è realizzabile senza un utente: RLS per `owner_id` presuppone `auth.uid()`.

| Opzione | Effetto |
|---|---|
| a. Login vero (email+password, un solo utente) | Prima apertura chiede le credenziali, poi sessione persistente. È l'unica che chiude davvero D1 |
| **b. Rimandare A4** ← **scelta** | Nessun cambiamento per l'utente; la cantina resta leggibile e scrivibile da chiunque abbia la chiave |

Una "passphrase singola" lato client **non** è un'opzione: non produce un `auth.uid()`,
quindi non abilita RLS e non toglie i permessi ad `anon`. Sarebbe sicurezza apparente.

**Conseguenza della scelta:** D1 resta aperto e non è mitigabile a metà. Senza
`auth.uid()` il database non ha modo di distinguere Omar da un estraneo: qualunque
controllo si aggiunga lato client o dentro le RPC si basa su un segreto che è nel
bundle, quindi pubblico. La probabilità del danno non si può ridurre.

Si può però ridurre **la gravità**, e non serve alcuna decisione per farlo: è il
nuovo passo **P1b**. Trasforma "perdita totale e irreversibile" in "fastidio
recuperabile". P1 resta in piano, solo più avanti.

### Q2 · Bottiglie come righe (decisione aperta #4) — ✅ DECISO 20/09/2026: **sì**

| Opzione | Effetto |
|---|---|
| **a. Sì** ← **scelta** | P4 decade (lo snapshot sparisce), P5 si fa sulla riga-bottiglia. P6 entra nel piano |
| b. No | P4 e P5 restano come descritti. Formato, posizione e "cosa bere" escono dal piano |
| c. Non ora, ma sì in futuro | Peggiore delle tre: si fa P4/P5 sul modello vecchio sapendo di rifarli |

Formato, posizione in cantina e finestra di beva sono nel piano, quindi lo step 9
"cosa bere" è un obiettivo reale e il contatore `wines.bottiglie` non basta.

**Conseguenze:**

- **P4 esce dal piano.** Lo snapshot di `bevuti` sparisce con P6, quindi ripulirlo e
  invertire `resolveWine` sarebbe lavoro buttato. Il residuo A2b nelle 10 righe
  divergenti si risolve dentro la migrazione di P6.
- **P5 cambia forma**: il rating vive sulla riga-bottiglia, non sulla bevuta, e
  segue P6 invece di precederlo.
- **P1b si sdoppia.** Log append-only ed export restano indipendenti e si possono
  fare subito; il soft delete invece verrebbe riscritto da P6, perché lo stato
  della bottiglia rende la cancellazione reversibile per costruzione. Meglio
  portarlo dentro P6 che farlo due volte.

### Q3 · Rating per bevuta (decisione aperta #1) — forma P5

`CLAUDE.md` lo dà già come raccomandato e lo schema è già così. Manca solo la conferma
che la **UI** si allinei: `RatingDial` scrive sulla singola bevuta, la card mostra la media.

**Raccomandato: sì.** Se la risposta è no (rating per vino), allora il posto giusto
è una colonna `wines.rating` e `bevuti.rating` va rimossa — non l'ibrido attuale,
che è il peggiore dei due mondi.

---

## Sequenza

Aggiornata dopo la decisione su Q1 (login rimandato).

```
P0  migrazioni + stopgap rating      ✅ fatto
 │
P2  updated_at                        ✅ fatto
 │
P3  produttori                        ✅ fatto (fase 3 aperta)
 │
P1b recuperabilità senza login       nessuna decisione      ── prossimo
 │
 ├─ Q2 = no  ──► P4 contratto snapshot ──► P5 rating (su bevuti)
 │
 └─ Q2 = sì  ──► P6 bottiglie come righe ──► P5 rating (su bottiglie); P4 decade
 │
P7  opportunistici (immagini, liste chiuse, estensioni)

P1  A4 sicurezza (P1a→P1c)  ── rimandato, rientra quando Q1 cambia
```

P1 non era un prerequisito tecnico di nessun altro passo: era primo solo per
gravità. Rimandarlo non blocca nulla.

---

## P0 — Migrazioni nel repo + stopgap rating ✅ FATTO (19/09/2026)

**Azioni:** D6, più una messa in sicurezza di D5.
**Decisioni richieste:** nessuna. **DDL eseguito:** solo lo stopgap.

> **Esito.** Cartella `supabase/` creata: le 8 migrazioni esistenti recuperate da
> `supabase_migrations.schema_migrations` (erano registrate nel database, non nel
> repo) più `schema/current.sql`. Scoperto in corso d'opera che A0 e A2a non sono
> registrati, quindi le migrazioni da sole non ricostruiscono il DB da zero:
> `current.sql` è l'unica fotografia completa. Stopgap applicato come migrazione
> `20260919111836`, nessun dato modificato. `ratingPerVino()` estratta in
> `App.jsx`. Suite e2e: 15/15. Dettagli in `supabase/README.md`.

Va per primo perché ogni passo successivo produce DDL: senza P0 quel DDL torna a
esistere solo dentro Supabase, che è esattamente il problema che D6 descrive.

1. `supabase/migrations/0001_baseline.sql` — schema attuale completo (tabelle, FK,
   CHECK, indici, identity), generato una volta come dump di sola struttura.
2. `supabase/functions/*.sql` — il corpo delle 9 RPC, un file per funzione.
   È la parte più delicata del sistema e oggi non è in nessun file del repo.
3. `supabase/README.md` — due righe: ogni DDL futuro è un file numerato qui,
   committato **nella stessa sessione** in cui viene eseguito nel SQL Editor.
4. **Stopgap rating:** verificare il corpo di `valuta_vino`. Il commento in
   `App.jsx:1972` dice che aggiorna *tutte* le bevute del vino; se confermato,
   limitarlo alla bevuta più recente (`ORDER BY consumed_on DESC, uid DESC LIMIT 1`).
   Ferma la sovrascrittura dei 5 vini con voti divergenti **senza** dover decidere Q3.

**Rischio:** nullo sui punti 1–3 (solo file). Basso sul punto 4 (una RPC, un `ORDER BY`).
**Verifica:** `pg_dump --schema-only` confrontato col baseline deve dare diff vuoto.
Rivalutare un vino già bevuto più volte non deve più toccare le bevute precedenti.
**Reversibile:** sì, interamente.

---

## P1b — Recuperabilità senza login

**Sostituisce P1 nell'ordine, non nel merito.** Decisioni richieste: nessuna.

Dato che senza `auth.uid()` la probabilità del danno non è riducibile, si riduce
la gravità. Oggi un'eliminazione è definitiva: `elimina_bottiglia` sull'ultima
bottiglia fa `DELETE FROM wines`, la FK CASCADE porta via la riga in
`wine_images` e la FK `SET NULL` stacca per sempre le bevute dal vino. È già
successo una volta (l'orfano del vino 76, pulito in A2a).

Vale anche contro l'errore di tocco, che è di gran lunga lo scenario più probabile.

### 1. Soft delete su `wines`

`deleted_at timestamptz`, e `elimina_bottiglia` lo valorizza invece di cancellare.
Il caricamento filtra `WHERE deleted_at IS NULL`.

Due dettagli da non sbagliare:

- `idx_wines_unique_normalizzato` non ha clausola `WHERE`: una riga soft-deleted
  continuerebbe a occupare lo slot e `aggiungi_o_incrementa` fallirebbe sul
  ri-inserimento dello stesso vino. Serve un indice parziale
  (`WHERE deleted_at IS NULL`) **oppure** far sì che l'upsert "resusciti" la riga
  azzerando `deleted_at`. La seconda è preferibile: conserva `id`, immagine e
  storico.
- `wine_images` non va più in CASCADE: l'immagine sopravvive al soft delete, che
  è quello che si vuole se il vino torna.

### 2. Log append-only delle scritture

`audit_log(id, at, azione, wine_id, uid_bevuta, dettaglio jsonb)`. Ogni RPC
inserisce una riga. Ad `anon` non si concede né UPDATE né DELETE sulla tabella:
può solo crescere, e solo attraverso le RPC.

Serve a due cose: capire *cosa* è successo se un giorno i numeri non tornano, e
avere il materiale per disfarlo.

### 3. Export periodico

Il backup JSON di A2a fu manuale e una tantum. Va reso una procedura ripetibile
e documentata (script nel repo + cadenza). Il piano gratuito di Supabase non
offre point-in-time recovery: senza un export proprio, un `DELETE` andato a buon
fine non si recupera.

**Rischio:** basso, tutto additivo. **Reversibile:** sì.
**Verifica:** la suite e2e copre già i due rami di `elimina_bottiglia`; vanno
aggiornate le asserzioni e aggiunto il caso "vino eliminato e poi riaggiunto
torna con il suo storico".

---

## P1 — A4: autenticazione e RLS reale  ·  RIMANDATO (Q1 = b, 19/09/2026)

**Azione:** D1. **Decisione richiesta:** Q1 — risposta attuale: non ora.
Resta qui, invariato, per quando la decisione cambia.

**Il passo più delicato del piano.** Tre sotto-passi, ognuno deployabile: l'app non
resta mai rotta fra uno e l'altro. Stesso schema in 3 fasi già usato con successo in A2b.

### P1a — Auth nel client, permessi invariati

- Creare l'utente in Supabase Auth (oggi ce ne sono 0).
- Login via REST (`/auth/v1/token?grant_type=password`), nessun SDK.
- `sb` invia l'`access_token` dell'utente come `Authorization: Bearer`; `apikey` resta
  la publishable. Refresh token persistito, rinnovo automatico alla scadenza.
- Schermata di login all'avvio quando non c'è sessione valida.

`anon` ha ancora tutti i permessi attuali: se il login fallisce, l'app continua a
funzionare come oggi. Nessun DDL.

### P1b — `owner_id` e RPC consapevoli dell'utente

- DDL: `owner_id uuid REFERENCES auth.users` sulle 4 tabelle → backfill all'unico
  utente → `NOT NULL`.
- Le 9 RPC: `IF auth.uid() IS NULL THEN RAISE EXCEPTION` in testa, e scrivono
  `owner_id = auth.uid()`. Il controllo dev'essere **esplicito nel corpo**: essendo
  `SECURITY DEFINER`, le funzioni bypassano RLS anche quando sarà attiva.
- Da qui in poi le scritture richiedono un JWT valido — cioè P1a deve essere in
  produzione e funzionante prima di eseguire questo DDL.

*Decisione minore da prendere qui:* `wine_images` e `wine_websites` sono cache
derivate, non dati personali. Possono avere `owner_id` per uniformità, oppure restare
leggibili a tutti. Uniformità è più semplice da ragionare; l'alternativa risparmia
una join. Raccomandato: uniformità.

### P1c — RLS e revoca (punto di non ritorno)

- `ENABLE ROW LEVEL SECURITY` su `bevuti` e `wine_websites`.
- Policy `owner_id = auth.uid()` su tutte e 4, per ogni comando.
- `DROP` delle policy `USING(true)`, inclusa **"modifica autenticata"** su `wines`,
  che nonostante il nome è `ALL` al ruolo `public`.
- `REVOKE EXECUTE ON FUNCTION … FROM anon` + `GRANT … TO authenticated` sulle 9 RPC.
  Senza questo, D1 resta aperto: è il punto che A3 non ha coperto.
- `NOTIFY pgrst, 'reload schema'`.

**Verifica (obbligatoria, in quest'ordine):** con la sola publishable key e nessun
JWT, `SELECT` su ciascuna delle 4 tabelle deve tornare **0 righe** e ogni RPC deve
fallire. Con JWT valido, l'app deve funzionare identica a prima.
**Rollback:** re-`GRANT` ad `anon` e disabilitare RLS. Rapido, ma riapre il buco —
quindi il backup JSON va rifatto **prima** di P1b.

---

## P2 — `updated_at` su `wines` ✅ FATTO (19/09/2026)

**Azione:** D7c. **Decisioni:** nessuna.

> **Esito.** Colonna + trigger `set_updated_at()` (SECURITY INVOKER), backfill da
> `created_at`: le date vanno dal 2026-06-09 al 2026-09-01, quindi la colonna
> nasce informativa. Trigger verificato con un UPDATE in transazione e rollback.
> Trappola registrata: ogni backfill massivo futuro su `wines` deve disabilitare
> il trigger, o azzera `updated_at` ovunque. Nessuna modifica al client.

Colonna + trigger `moddatetime`. Dieci minuti, nessun impatto sul client.
È il prerequisito della cache stale-while-revalidate prevista in **B**: senza,
ogni apertura dell'app riscarica tutto.

Tenuto separato da P1 di proposito: non si mescola una colonna di comodo dentro
una migrazione di sicurezza.

---

## P3 — Tabella `produttori` ✅ FATTO (19/09/2026)

**Azione:** D3. **Decisioni:** nessuna. Indipendente da Q1 e Q2.

> **Esito.** 80 produttori, `wines.produttore_id` NOT NULL con FK, siti importati
> da `wine_websites` (26/29), `slow_chiocciola` per i 6 nomi che stavano nel
> bundle. Nuova RPC `risolvi_produttore()` find-or-create, usata da
> `aggiungi_o_incrementa` e `modifica_vino` — necessaria subito, perché la FK
> NOT NULL le avrebbe altrimenti fatte fallire. Client: `SW_CANTINA_CHIOCCIOLA`
> e `SW_VINO_BOTTIGLIA` rimossi, mappa `produttoriByNome` a livello di modulo
> così nessun call site di `hasCantina` cambia. **Trovato e chiuso un bug reale:**
> la cache dei siti non era mai stata letta (due `?` nella query string di
> `sb.get`), quindi ogni apertura della tab Web richiamava Serper. Suite e2e:
> 19/19, con 4 test nuovi. Restano da fare in **fase 3**: drop di
> `wines.produttore` e di `wine_websites`. Lasciata aperta di proposito la fusione
> di `Vina Krapez` / `Vina Krapež` (scelta editoriale, SQL pronto in
> `supabase/README.md`).

1. `produttori(id identity, nome, nome_norm generated UNIQUE, sito, sito_source,
   slow_chiocciola bool, regione)`.
2. Popolamento dai ~80 produttori distinti in `wines`, normalizzati.
3. `wines.produttore_id` FK; `wines.produttore` resta come testo finché il client
   non è migrato, poi si elimina.
4. `wine_websites` assorbita in `produttori` (è già 1:1). **Prima** vanno riconciliate
   le 3 righe su 29 che non corrispondono ad alcun vino.
5. `slow_chiocciola` popolata dai 6 nomi oggi hardcoded in `SW_CANTINA_CHIOCCIOLA`;
   il `Set` sparisce dal bundle. `SW_VINO_BOTTIGLIA` è codice morto: si elimina.
6. `salva_sito_produttore` scrive su `produttori`.

**Beneficio:** manutenibilità, non un guasto da riparare — vedi la correzione in
`ANALISI_ARCHITETTURA.md` (D3): oggi la cache dei siti combacia su 26 righe su 29
con match esatto, e normalizzare non cambierebbe nulla. Quello che P3 risolve è
Slow Wine hardcoded nel bundle, la rinomina di un produttore che oggi tocca 3
tabelle a mano, l'unica collisione reale ("Vina Krapez" / "Vina Krapež") e le
statistiche per regione.
**Rischio:** medio — tocca `WebsiteView` e i badge Slow Wine.
**Priorità:** più bassa di quanto sembrasse. Non c'è urgenza.

---

## P4 — Contratto dello snapshot `bevuti`  ·  DECADUTO (Q2 = sì, 20/09/2026)

**Azione:** D4. Non si fa: con P6 lo snapshot sparisce e lo storico diventa
immutabile per costruzione. Resta qui solo come traccia del ragionamento.

> Misurato il 19/09/2026 prima di chiuderlo: 48 bevute, 1 orfana, 10 righe con
> snapshot divergente da `wines` — ma **nessun produttore o nome di vino diverso**.
> Tutta la divergenza era residuo di A2b (`annata` "n.d." vs NULL su 5 righe,
> `prezzo` 0 vs NULL su 5, più un prezzo ignoto compilato dopo). Il rischio da cui
> P4 proteggeva non si era mai materializzato.

1. Scrivere il contratto in `CLAUDE.md`: **lo snapshot è autoritativo per lo storico**.
2. Invertire `resolveWine` (`App.jsx:117`): oggi privilegia `wines`, quindi modificare
   un vino cambia il passato — in contraddizione col vincolo "storico bevuti immutabile"
   già dichiarato fra i vincoli duri.
3. Allineare `bevuti.annata` da `text` a `smallint` (A2b ha migrato `wines`, non lo snapshot).
4. Sostituire il fallback `tipologia: "Bianco fermo"`, che oggi trasforma in silenzio
   un orfano senza tipologia in un bianco dentro le Statistiche.

**Attenzione:** cambia i numeri mostrati in Bevuti e Statistiche. Vanno annotati
prima e dopo, altrimenti sembrerà una regressione.

---

## P5 — Rating per bevuta

**Azione:** D5. **Decisione richiesta:** Q3. **Forma dipendente da:** Q2.

- `RatingDial` scrive sulla singola bevuta (`valuta_vino` prende `p_uid`, non `p_wine_id`).
- La card mostra la **media** per etichetta, da vista o colonna calcolata.
- `useCantinaData` smette di collassare le bevute prendendo il massimo.
- I 5 vini con voti divergenti recuperano i loro valori reali, già presenti in DB.

Se Q2 = sì, il rating vive sulla riga-bottiglia e questo passo segue P6.

---

## P6 — Bottiglie come righe  *(solo se Q2 = sì)*

**Azione:** D2. **Il passo più invasivo del piano.**

`wines` resta anagrafica (1 riga per etichetta+annata). Nuova tabella:

```
bottiglie(id, wine_id FK, formato, posizione, acquistata_il,
          prezzo_pagato, stato: in_cantina|bevuta, consumed_on, nota, rating)
```

- `wines.bottiglie` diventa vista o colonna mantenuta da trigger.
- `bevuti` diventa `bottiglie WHERE stato='bevuta'`: lo storico è immutabile per
  costruzione e lo snapshot non serve più.
- **Le 9 RPC vanno riscritte.** È il motivo per cui Q2 va decisa prima di P4 e P5.
- Migrazione: espandere i contatori attuali (92 vini in cantina, 120 bottiglie) in
  righe singole, e convertire le 47 bevute in bottiglie con `stato='bevuta'`.

Sblocca formato, posizione in cantina e la finestra di beva, cioè lo step 9 "cosa bere".

---

## P7 — Opportunistici

Nessuno è urgente. Si agganciano alla prima sessione che tocca l'area vicina.

| | Azione | Nota |
|---|---|---|
| **D7a** | Immagini su Supabase Storage | 62 hot-link a siti terzi destinati a rompersi. In subordine: colonna `checked_at` e rivalidazione |
| **D7b** | Unificare `tipologia` / `denominazione` | Oggi sono CHECK in DB **e** array nel bundle. Naturale da fare dentro P3, che già introduce una lookup table |
| **D7d** | `unaccent` + `pg_trgm` | Rinviare finché la ricerca resta client-side su 125 righe |

---

## Nota operativa — verifica dei dati

`CLAUDE.md` (workflow, punto 4) registra come limite noto che da questo ambiente la
policy di rete blocca `etbrgdldduadgbulasmy.supabase.co`, e che quindi ogni controllo
va delegato a Omar o incorporato nello script SQL.

**Confermato in P0: il limite non vale per il server MCP di Supabase**, che non passa
dal proxy HTTP. Durante P0 sono stati usati `execute_sql`, `list_migrations` e
`apply_migration` senza attriti. I pre-check live dentro gli script SQL restano utili
come rete di sicurezza, ma non sono più l'unico modo di verificare: ogni passo di
questo piano può essere controllato prima e dopo, sul posto. `CLAUDE.md` aggiornato
di conseguenza. Resta bloccato solo l'accesso diretto via `curl`/`fetch`.

---

## Riepilogo

| Passo | Azioni | Decisione | DDL | Rischio | Reversibile |
|---|---|---|---|---|---|
| ~~**P0**~~ | ~~D6 + stopgap D5~~ | — | minimo | nullo/basso | ✅ fatto |
| **P1b** | riduzione gravità D1 | — | sì | basso | sì |
| ~~**P2**~~ | ~~D7c~~ | — | sì | nullo | ✅ fatto |
| ~~**P3**~~ | ~~D3 (+D7b)~~ | — | sì | medio | ✅ fatto (fase 3 aperta) |
| ~~P1a/P1c~~ | ~~D1~~ | Q1 = b | — | — | rimandato |
| **P4** | D4 | Q2 = no | sì | medio | sì |
| **P5** | D5 | Q3 | sì | medio | sì |
| **P6** | D2 | Q2 = sì | sì | **alto** | difficile |
| **P7** | D7a/b/d | — | sì | basso | sì |

Backup JSON completo prima di **P3** e **P6** (e reso ripetibile da P1b stesso).

Alla chiusura di ogni passo: aggiornare la roadmap in `CLAUDE.md` e committare la
migrazione corrispondente sotto `supabase/migrations/`.
