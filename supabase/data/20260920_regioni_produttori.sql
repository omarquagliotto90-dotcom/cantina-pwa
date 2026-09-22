-- ============================================================================
-- Popolamento di `produttori.regione` — 77 righe su 84.
--
-- Serve al ridisegno C2/C3/C5: la regione compare in alto a destra di ogni
-- riga e nell'occhiello della scheda. Finora era NULL per tutti e 84, quindi
-- quei tre punti del design restavano spenti.
--
-- NON e' DDL: e' una modifica ai dati, quindi sta in `data/` e non in
-- `migrations/`. Eseguita con execute_sql, non con apply_migration.
--
-- Come si assegna una regione, in ordine di forza:
--   1. la denominazione del vino (Montefalco -> Umbria, Valdobbiadene -> Veneto)
--   2. il nome del vino quando porta la zona (Terre d'Abruzzo, Kras, Bourgogne)
--   3. la sede del produttore, quando e' nota con certezza
-- Dove nessuna delle tre regge, la riga resta NULL. Un vuoto si vede e si
-- corregge; una regione sbagliata si propaga e nessuno se ne accorge.
--
-- Granularita': regione italiana per l'Italia, regione vinicola per l'estero
-- (Borgogna, Alsazia, Carso...), come nel design, che accosta PIEMONTE e
-- BORGOGNA. Dove la zona non e' sul'etichetta si usa il paese.
--
-- Reversibile con:  UPDATE produttori SET regione = NULL;
-- ============================================================================

UPDATE produttori p SET regione = v.regione
FROM (VALUES
  -- ── Italia, da denominazione o nome del vino ──────────────────────────────
  (1,  'Trentino-Alto Adige'),  -- Abbazia di Novacella, Varna (BZ)
  (2,  'Umbria'),               -- Montefalco Rosso
  (4,  'Marche'),               -- Marche Trebbiano IGT
  (5,  'Veneto'),               -- Asolo Prosecco Superiore
  (6,  'Umbria'),               -- Montefalco Sagrantino
  (7,  'Emilia-Romagna'),       -- Rosato dell'Emilia
  (8,  'Abruzzo'),              -- Montepulciano d'Abruzzo, Terre d'Abruzzo
  (9,  'Sardegna'),             -- Ogliastra IGT
  (10, 'Marche'),               -- Chiodo Marche Bianco
  (12, 'Marche'),               -- Pievalta: Verdicchio dei Castelli di Jesi
  (14, 'Veneto'),               -- Bele Casel, Asolo
  (15, 'Veneto'),               -- Amarone della Valpolicella
  (16, 'Abruzzo'),              -- Orsogna (CH)
  (18, 'Marche'),               -- Verdicchio di Matelica
  (20, 'Veneto'),               -- Colli Trevigiani IGT
  (21, 'Veneto'),               -- Valdobbiadene
  (22, 'Abruzzo'),              -- Trebbiano d'Abruzzo
  (23, 'Trentino-Alto Adige'),  -- Südtirol Alto Adige
  (24, 'Trentino-Alto Adige'),  -- Südtirol Alto Adige
  (25, 'Abruzzo'),              -- Trebbiano d'Abruzzo
  (26, 'Marche'),               -- Verdicchio di Matelica
  (27, 'Veneto'),               -- Cabernet Sauvignon Veneto IGT
  (29, 'Abruzzo'),              -- Colline Pescaresi IGP
  (30, 'Abruzzo'),              -- Chiusa Grande, Nocciano (PE)
  (32, 'Umbria'),               -- Sagrantino Passito
  (37, 'Marche'),               -- Verdicchio dei Castelli di Jesi
  (38, 'Umbria'),               -- Montefalco Rosso Riserva
  (39, 'Marche'),               -- Fattoria San Lorenzo, Verdicchio
  (41, 'Veneto'),               -- Valdobbiadene
  (42, 'Umbria'),               -- Umbria Bianco IGT
  (44, 'Veneto'),               -- Giannitessari, Roncà (VR)
  (45, 'Abruzzo'),              -- Montepulciano d'Abruzzo
  (46, 'Veneto'),               -- Valpolicella DOC
  (47, 'Marche'),               -- Gelsomoro Marche Bianco
  (50, 'Trentino-Alto Adige'),  -- Kellerei Kaltern, Lagrein
  (51, 'Marche'),               -- La Staffa, Staffolo (AN)
  (54, 'Abruzzo'),              -- Lunaria, linea di Cantina Orsogna
  (55, 'Abruzzo'),              -- Lunaria - Cantina Orsogna
  (56, 'Veneto'),               -- Maculan, Breganze (Vespaiolo)
  (58, 'Veneto'),               -- Malibran, Susegana (TV)
  (60, 'Veneto'),               -- Miotto, Col Fondo
  (62, 'Trentino-Alto Adige'),  -- Nals Margreid
  (63, 'Sicilia'),              -- Occhipinti, SP68, Vittoria
  (64, 'Abruzzo'),              -- Orsogna Winery
  (65, 'Lombardia'),            -- Montenetto di Brescia
  (66, 'Veneto'),               -- Soave Classico
  (68, 'Lombardia'),            -- Franciacorta
  (69, 'Veneto'),               -- Valdobbiadene Prosecco Superiore
  (70, 'Toscana'),              -- Toscana IGT
  (71, 'Puglia'),               -- Negroamaro Puglia IGP
  (72, 'Marche'),               -- Verdicchio di Matelica
  (73, 'Molise'),               -- Tintilia del Molise
  (74, 'Emilia-Romagna'),       -- Rubicone IGP
  (76, 'Abruzzo'),              -- Cerasuolo d'Abruzzo, Tullum
  (77, 'Marche'),               -- Lefric Marche Bianco
  (83, 'Lombardia'),            -- Ca' dei Frati, Sirmione (Lugana)
  (67, 'Abruzzo'),              -- Pistis Sophia: Montepulciano/Trebbiano d'Abruzzo, Cococciola
  (17, 'Veneto'),               -- Biondo Jeo: Perera e Verdiso, uve solo trevigiane
  (11, 'Sicilia'),              -- Badalucco: Grillo + Zibibbo

  -- ── Estero, regione vinicola dove l'etichetta la porta ────────────────────
  (3,  'Primorska'),            -- Primorska Rebula (Slovenia)
  (19, 'Somontano'),            -- Señorío de Lazán Somontano (Spagna)
  (28, 'Spagna'),               -- Celler Jan Vidal, metodo ancestrale
  (31, 'Linguadoca'),           -- Clos Perdus, Corbieres (Francia)
  (33, 'Carso'),                -- Cotar, Terra Rossa (Slovenia)
  (34, 'Carso'),                -- Cotar, Kras (Slovenia)
  (35, 'Borgogna'),             -- Bourgogne Aligote
  (36, 'Borgogna'),             -- Bourgogne Cote-d'Or
  (43, 'Franca Contea'),        -- Le Moutherot, Doubs (Francia)
  (48, 'Alsazia'),              -- Cremant d'Alsace
  (49, 'Spagna'),               -- Cava
  (57, 'Borgogna'),             -- Macon-Chaintre
  (59, 'Gozo'),                 -- Marsovin, Gozo (Malta)
  (61, 'Brda'),                 -- Movia, Gredic (Slovenia)
  (75, 'Borgogna'),             -- Bourgogne chardonnay
  (78, 'Vipava'),               -- Krapez, Lapor (Slovenia)
  (79, 'Vipava'),               -- Krapez, Vipava (Slovenia)
  (80, 'Spagna')                -- Vinos Al Margen
) AS v(id, regione)
WHERE p.id = v.id;

-- Restano NULL di proposito (4 reali + 3 righe di prova, 12 bottiglie in tutto):
--   52 Laboratorio Agricolo   9 bott.  solo vitigni PIWI, nessuna denominazione;
--                                      il sito viene da Serper, quindi non fa fede
--   53 Le Caselle             1 bott.  Sangiovese: troppe regioni possibili
--   40 Fontale                1 bott.  nessun indizio, sito da Serper
--   13 Beerik Birrificio      1 bott.  birrificio, non cantina
--   82 Test7, 84 Test9, 86 Test1       righe di prova rimaste da test manuali
