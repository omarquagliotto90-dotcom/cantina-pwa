BEGIN;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM bevuti WHERE consumed_on IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'ABORT — % bevute senza consumed_on, non elimino bevuti.data', bad;
  END IF;
END $$;

ALTER TABLE bevuti DROP COLUMN data;

COMMIT;

NOTIFY pgrst, 'reload schema';
