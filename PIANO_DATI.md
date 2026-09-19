# Piano d'azione — fase dati

Deriva da `ANALISI_ARCHITETTURA.md` (Parte 1). Copre le azioni **D1–D7**.
Unità di lavoro: **1 passo = 1 sessione = 1 commit**, come da workflow in `CLAUDE.md`.

Sostituisce `PIANO_FIX.md`, che descrive un'architettura superata (batch 4–5 su
`bottleOverrides`, `sb.get` malformato) ed è in contraddizione con `CLAUDE.md`.
`PIANO_FIX.md` va archiviato o eliminato alla chiusura di P0.

---

## Scheda decisione — 3 domande da sciogliere prima di P1

Il resto del piano è già deciso o non richiede scelte. Queste tre invece cambiano
la forma dei passi successivi.

### Q1 · Login (decisione aperta #2) — blocca P1

A4 non è realizzabile senza un utente: RLS per `owner_id` presuppone `auth.uid()`.

| Opzione | Effetto |
|---|---|
| **a. Login vero** (email+password, un solo utente) | Prima apertura chiede le credenziali, poi sessione persistente. È l'unica che chiude davvero D1 |
| **b. Rimandare A4** | Nessun cambiamento per l'utente; la cantina resta scrivibile da chiunque abbia la chiave |

Una "passphrase singola" lato client **non** è un'opzione: non produce un `auth.uid()`,
quindi non abilita RLS e non toglie i permessi ad `anon`. Sarebbe sicurezza apparente.

**Raccomandato: a.** Il costo è una schermata vista una volta per dispositivo.

### Q2 · Bottiglie come righe (decisione aperta #4) — blocca P4 e P5

Non serve *farlo* ora, serve *deciderlo* ora: se la risposta è sì, P4 (contratto
snapshot) e P5 (rating) vanno implementati sul modello nuovo, altrimenti si fa
due volte lo stesso lavoro.

| Opzione | Effetto |
|---|---|
| **a. Sì** | P4 decade (lo snapshot sparisce), P5 si fa sulla riga-bottiglia. P6 entra nel piano |
| **b. No** | P4 e P5 restano come descritti. Formato, posizione e "cosa bere" escono dal piano |
| **c. Non ora, ma sì in futuro** | Peggiore delle tre: si fa P4/P5 sul modello vecchio sapendo di rifarli |

**Raccomandato:** decidere **a** o **b**, non **c**. La domanda vera è una sola:
*formato, posizione in cantina e "cosa bere" sono nel piano, sì o no?*

### Q3 · Rating per bevuta (decisione aperta #1) — forma P5

`CLAUDE.md` lo dà già come raccomandato e lo schema è già così. Manca solo la conferma
che la **UI** si allinei: `RatingDial` scrive sulla singola bevuta, la card mostra la media.

**Raccomandato: sì.** Se la risposta è no (rating per vino), allora il posto giusto
è una colonna `wines.rating` e `bevuti.rating` va rimossa — non l'ibrido attuale,
che è il peggiore dei due mondi.

---

## Sequenza

```
P0  migrazioni + stopgap rating      nessuna decisione      ── si può partire subito
 │
P1  A4 sicurezza  (P1a→P1b→P1c)      richiede Q1
 │
P2  updated_at                        nessuna decisione
 │
P3  produttori                        nessuna decisione
 │
 ├─ Q2 = no  ──► P4 contratto snapshot ──► P5 rating (su bevuti)
 │
 └─ Q2 = sì  ──► P6 bottiglie come righe ──► P5 rating (su bottiglie); P4 decade
 │
P7  opportunistici (immagini, liste chiuse, estensioni)
```

P3 è indipendente da tutto: se P1 si blocca sulla decisione login, si può anticipare.

---

## P0 — Migrazioni nel repo + stopgap rating

**Azioni:** D6, più una messa in sicurezza di D5.
**Decisioni richieste:** nessuna. **DDL eseguito:** solo lo stopgap.

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

## P1 — A4: autenticazione e RLS reale

**Azione:** D1. **Decisione richiesta:** Q1.
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

## P2 — `updated_at` su `wines`

**Azione:** D7c. **Decisioni:** nessuna.

Colonna + trigger `moddatetime`. Dieci minuti, nessun impatto sul client.
È il prerequisito della cache stale-while-revalidate prevista in **B**: senza,
ogni apertura dell'app riscarica tutto.

Tenuto separato da P1 di proposito: non si mescola una colonna di comodo dentro
una migrazione di sicurezza.

---

## P3 — Tabella `produttori`

**Azione:** D3. **Decisioni:** nessuna. Indipendente da Q1 e Q2.

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

**Beneficio immediato:** il lookup del sito smette di essere un match esatto su testo
libero, quindi smette di fallire in silenzio su spazi e maiuscole.
**Rischio:** medio — tocca `WebsiteView` e i badge Slow Wine.

---

## P4 — Contratto dello snapshot `bevuti`  *(solo se Q2 = no)*

**Azione:** D4. **Decisione richiesta:** Q2.

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

**Durante l'analisi del 19/09 il limite non si è presentato:** schema, vincoli, policy,
grant e conteggi sono stati letti direttamente tramite il server MCP di Supabase, che
non passa dal proxy HTTP. Vale la pena verificarlo all'inizio della prossima sessione:
se il canale MCP è disponibile, i pre-check live dentro gli script SQL diventano
superflui e ogni passo di questo piano può essere verificato prima e dopo, sul posto.

---

## Riepilogo

| Passo | Azioni | Decisione | DDL | Rischio | Reversibile |
|---|---|---|---|---|---|
| **P0** | D6 + stopgap D5 | — | minimo | nullo/basso | sì |
| **P1a** | D1 | Q1 | no | basso | sì |
| **P1b** | D1 | Q1 | sì | medio | sì |
| **P1c** | D1 | Q1 | sì | **alto** | sì, ma riapre il buco |
| **P2** | D7c | — | sì | nullo | sì |
| **P3** | D3 (+D7b) | — | sì | medio | sì |
| **P4** | D4 | Q2 = no | sì | medio | sì |
| **P5** | D5 | Q3 | sì | medio | sì |
| **P6** | D2 | Q2 = sì | sì | **alto** | difficile |
| **P7** | D7a/b/d | — | sì | basso | sì |

Backup JSON completo prima di **P1b**, **P3** e **P6**.

Alla chiusura di ogni passo: aggiornare la roadmap in `CLAUDE.md` e committare la
migrazione corrispondente sotto `supabase/migrations/`.
