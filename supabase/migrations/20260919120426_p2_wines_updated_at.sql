-- ============================================================================
-- P2 — `updated_at` su wines (azione D7c).
--
-- Prerequisito della cache stale-while-revalidate prevista in B: senza, ogni
-- apertura dell'app riscarica tutte le righe anche quando non è cambiato nulla.
--
-- Il valore lo mantiene un TRIGGER, non le RPC: così cattura anche le modifiche
-- fatte a mano dal SQL Editor, che altrimenti sfuggirebbero.
-- Solo su `wines`: `bevuti` è storico append-only, `wine_images` e
-- `wine_websites` sono cache con `created_at`.
-- ============================================================================

BEGIN;

ALTER TABLE wines ADD COLUMN updated_at timestamptz;

-- Backfill: parte da created_at, così la colonna è subito leggibile invece di
-- avere 125 righe con lo stesso timestamp di creazione della colonna.
UPDATE wines SET updated_at = COALESCE(created_at, now());

ALTER TABLE wines ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE wines ALTER COLUMN updated_at SET NOT NULL;

-- SECURITY INVOKER (default): un trigger non deve elevare privilegi.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER wines_set_updated_at
BEFORE UPDATE ON wines
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
