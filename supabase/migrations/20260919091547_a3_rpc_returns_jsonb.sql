BEGIN;

DROP FUNCTION IF EXISTS bevi_bottiglia(int, text, numeric);
DROP FUNCTION IF EXISTS riporta_bottiglia(bigint);
DROP FUNCTION IF EXISTS elimina_bottiglia(int);
DROP FUNCTION IF EXISTS valuta_vino(int, numeric);

CREATE FUNCTION bevi_bottiglia(p_wine_id int, p_nota text DEFAULT '', p_rating numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wine wines%ROWTYPE; v_uid bigint; v_consumed_on date;
BEGIN
  SELECT * INTO v_wine FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  INSERT INTO bevuti (wine_id, nota, rating, produttore, vino, annata, tipologia, prezzo)
  VALUES (p_wine_id, COALESCE(p_nota, ''), p_rating, v_wine.produttore, v_wine.vino, v_wine.annata, v_wine.tipologia, v_wine.prezzo)
  RETURNING bevuti.uid, bevuti.consumed_on INTO v_uid, v_consumed_on;

  UPDATE wines SET bottiglie = GREATEST(bottiglie - 1, 0) WHERE id = p_wine_id;

  RETURN jsonb_build_object('uid', v_uid, 'consumed_on', v_consumed_on, 'bottiglie_residue', GREATEST(v_wine.bottiglie - 1, 0));
END;
$$;

CREATE FUNCTION riporta_bottiglia(p_uid bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wine_id int; v_bottiglie int;
BEGIN
  DELETE FROM bevuti WHERE bevuti.uid = p_uid RETURNING wine_id INTO v_wine_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bevuta % non trovata', p_uid; END IF;

  IF v_wine_id IS NOT NULL THEN
    UPDATE wines SET bottiglie = bottiglie + 1 WHERE id = v_wine_id RETURNING bottiglie INTO v_bottiglie;
  END IF;

  RETURN jsonb_build_object('bottiglie_residue', v_bottiglie);
END;
$$;

CREATE FUNCTION elimina_bottiglia(p_wine_id int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bottiglie int;
BEGIN
  SELECT bottiglie INTO v_bottiglie FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  IF v_bottiglie > 1 THEN
    UPDATE wines SET bottiglie = bottiglie - 1 WHERE id = p_wine_id;
    RETURN jsonb_build_object('eliminato', false, 'bottiglie_residue', v_bottiglie - 1);
  ELSE
    DELETE FROM wines WHERE id = p_wine_id;
    RETURN jsonb_build_object('eliminato', true, 'bottiglie_residue', 0);
  END IF;
END;
$$;

CREATE FUNCTION valuta_vino(p_wine_id int, p_rating numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE bevuti SET rating = p_rating WHERE wine_id = p_wine_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('aggiornate', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION bevi_bottiglia, riporta_bottiglia, elimina_bottiglia, valuta_vino TO anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
