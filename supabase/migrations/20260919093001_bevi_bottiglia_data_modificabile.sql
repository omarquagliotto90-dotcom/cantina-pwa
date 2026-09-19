CREATE OR REPLACE FUNCTION bevi_bottiglia(p_wine_id int, p_nota text DEFAULT '', p_rating numeric DEFAULT NULL, p_consumed_on date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wine wines%ROWTYPE; v_uid bigint; v_consumed_on date;
BEGIN
  SELECT * INTO v_wine FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  INSERT INTO bevuti (wine_id, nota, rating, produttore, vino, annata, tipologia, prezzo, consumed_on)
  VALUES (p_wine_id, COALESCE(p_nota, ''), p_rating, v_wine.produttore, v_wine.vino, v_wine.annata, v_wine.tipologia, v_wine.prezzo, COALESCE(p_consumed_on, CURRENT_DATE))
  RETURNING bevuti.uid, bevuti.consumed_on INTO v_uid, v_consumed_on;

  UPDATE wines SET bottiglie = GREATEST(bottiglie - 1, 0) WHERE id = p_wine_id;

  RETURN jsonb_build_object('uid', v_uid, 'consumed_on', v_consumed_on, 'bottiglie_residue', GREATEST(v_wine.bottiglie - 1, 0));
END;
$$;

NOTIFY pgrst, 'reload schema';
