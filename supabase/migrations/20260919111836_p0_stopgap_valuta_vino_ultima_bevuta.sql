-- ============================================================================
-- P0 — stopgap su valuta_vino (D5).
--
-- Prima: UPDATE bevuti SET rating = p_rating WHERE wine_id = p_wine_id
--        → valutare un vino sovrascriveva il voto di TUTTE le sue bevute.
--        7 vini hanno 2 bevute, 5 con voti divergenti: ogni nuova valutazione
--        ne distruggeva uno.
--
-- Ora: aggiorna solo la bevuta più recente (consumed_on, poi uid a parità).
-- Non decide Q3 (rating per bevuta o per vino): ferma solo la perdita di dati
-- finché P5 non allinea la UI. Restituisce anche l'uid toccato, così il client
-- potrà in futuro aggiornare la singola riga invece di ricaricare.
-- ============================================================================

CREATE OR REPLACE FUNCTION valuta_vino(p_wine_id int, p_rating numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid bigint;
BEGIN
  SELECT uid INTO v_uid
  FROM bevuti
  WHERE wine_id = p_wine_id
  ORDER BY consumed_on DESC, uid DESC
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('aggiornate', 0, 'uid', NULL);
  END IF;

  UPDATE bevuti SET rating = p_rating WHERE uid = v_uid;

  RETURN jsonb_build_object('aggiornate', 1, 'uid', v_uid);
END;
$$;

NOTIFY pgrst, 'reload schema';
