-- ============================================================================
-- "Peroni Vignaiole" -> "Peroni".
--
-- Motivo: due dei suoi vini sono fra i 6 in cantina senza foto, e la ricerca
-- immagini costruisce la query come `{produttore} {vino} {annata} bottiglia
-- vino`. Secondo Omar e' "Vignaiole" che impasta la ricerca. Il sito gia'
-- salvato per questo produttore gli da' ragione sul nome: l'URL su travino.it
-- e' `/azienda-agricola-peroni`.
--
-- NON e' DDL: modifica ai dati, quindi sta in `data/` e va eseguita con
-- execute_sql, non con apply_migration.
--
-- Scope verificato PRIMA: 1 riga in `produttori` (id 65), 3 in `wines`
-- (8 Trebbiano "Montenetto", 9 Marzemino "Montelungo", 10 Merlot "Montealbi"),
-- ZERO in `bevuti`. Nessuna collisione: non esisteva gia' un "Peroni", quindi
-- ne' l'indice UNIQUE su `produttori.nome_norm` ne' quello normalizzato su
-- `wines` vengono violati.
--
-- Le foto restano attaccate: `wine_images` ha per chiave `wine_id`, non il nome.
--
-- Il trigger `wines_set_updated_at` viene lasciato attivo di proposito: la
-- trappola registrata in CLAUDE.md riguarda i backfill massivi, qui le righe
-- toccate sono 3 e vengono modificate davvero, quindi `updated_at` deve salire.
--
-- Reversibile con:
--   UPDATE produttori SET nome = 'Peroni Vignaiole' WHERE id = 65;
--   UPDATE wines SET produttore = 'Peroni Vignaiole' WHERE produttore_id = 65;
-- ============================================================================

UPDATE produttori SET nome = 'Peroni'
 WHERE id = 65 AND nome = 'Peroni Vignaiole';

UPDATE wines SET produttore = 'Peroni'
 WHERE produttore_id = 65 AND produttore = 'Peroni Vignaiole';
