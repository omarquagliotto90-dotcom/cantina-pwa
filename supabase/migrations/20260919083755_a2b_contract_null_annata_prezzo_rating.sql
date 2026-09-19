BEGIN;

-- ============================================================================
-- A2b — Contract migration: placeholder testuali → NULL, annata → smallint,
-- prezzo 0 → NULL, rating senza sentinel 0. NON tocca bevuti.data in questo
-- passo (il codice attualmente deployato la scrive ancora: verrà droppata
-- in un passo successivo dopo l'aggiornamento del codice).
-- ============================================================================

-- ---- wines.macerazione / fermentazione / malolattica: "—" -> NULL ----
UPDATE wines SET macerazione = NULL WHERE macerazione = '—';
UPDATE wines SET fermentazione = NULL WHERE fermentazione = '—';
UPDATE wines SET malolattica = NULL WHERE malolattica = '—';

-- ---- wines.denominazione: "n.d." -> NULL, CHECK non ammette più "n.d." ----
UPDATE wines SET denominazione = NULL WHERE denominazione = 'n.d.';

ALTER TABLE wines DROP CONSTRAINT IF EXISTS wines_denominazione_check;
ALTER TABLE wines ADD CONSTRAINT wines_denominazione_check
  CHECK (denominazione IS NULL OR denominazione IN ('DOC','DOCG','IGT','AOC','IGP','QbA','QmP','AVA'));

-- ---- wines.annata: text NOT NULL DEFAULT 'n.d.' -> smallint NULL ----
-- L'indice UNIQUE di A2a dipende da trim(annata): va ricreato dopo il cambio tipo.
DROP INDEX IF EXISTS idx_wines_unique_normalizzato;

ALTER TABLE wines ALTER COLUMN annata DROP NOT NULL;
ALTER TABLE wines ALTER COLUMN annata DROP DEFAULT;

UPDATE wines SET annata = NULL WHERE annata = 'n.d.';

DO $$
DECLARE bad int; esempio text;
BEGIN
  SELECT count(*), string_agg(DISTINCT annata, ', ') INTO bad, esempio
  FROM wines WHERE annata IS NOT NULL AND annata !~ '^\d{4}$';
  IF bad > 0 THEN
    RAISE EXCEPTION 'ABORT — wines.annata: % righe non a 4 cifre (%), correggile prima di rilanciare', bad, esempio;
  END IF;
END $$;

ALTER TABLE wines ALTER COLUMN annata TYPE smallint USING annata::smallint;

CREATE UNIQUE INDEX idx_wines_unique_normalizzato
  ON wines (lower(trim(produttore)), lower(trim(vino)), annata);

-- ---- wines.prezzo: NOT NULL DEFAULT 0 -> NULL quando sconosciuto ----
ALTER TABLE wines ALTER COLUMN prezzo DROP NOT NULL;
ALTER TABLE wines ALTER COLUMN prezzo DROP DEFAULT;

UPDATE wines SET prezzo = NULL WHERE prezzo = 0;

-- ---- bevuti.rating: DEFAULT 0 -> DEFAULT NULL, CHECK senza il ramo "= 0" ----
UPDATE bevuti SET rating = NULL WHERE rating = 0;

ALTER TABLE bevuti ALTER COLUMN rating DROP DEFAULT;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM bevuti WHERE rating IS NOT NULL AND NOT (rating >= 1 AND rating <= 5);
  IF bad > 0 THEN
    RAISE EXCEPTION 'ABORT — bevuti.rating: % righe fuori range dopo il backfill, transazione interrotta', bad;
  END IF;
END $$;

ALTER TABLE bevuti DROP CONSTRAINT IF EXISTS bevuti_rating_check;
ALTER TABLE bevuti ADD CONSTRAINT bevuti_rating_check
  CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

-- ---- Verifica finale ----
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'wines' AND column_name IN ('annata','prezzo','denominazione','macerazione','fermentazione','malolattica')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'bevuti' AND column_name = 'rating';

SELECT
  (SELECT count(*) FROM wines WHERE macerazione = '—' OR fermentazione = '—' OR malolattica = '—' OR denominazione = 'n.d.') AS placeholder_residui,
  (SELECT count(*) FROM wines WHERE prezzo = 0) AS prezzo_zero_residui,
  (SELECT count(*) FROM bevuti WHERE rating = 0) AS rating_zero_residui;

COMMIT;

NOTIFY pgrst, 'reload schema';
