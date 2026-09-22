-- P6 fase 3 (DDL) — `p_formato` in aggiungi_o_incrementa e modifica_vino.
--
-- Le due funzioni vengono DROPPATE e ricreate invece di essere affiancate da
-- un overload: due funzioni che si distinguono solo per un parametro con
-- DEFAULT sono ambigue per PostgREST quando il client ne manda 12, e la
-- chiamata fallirebbe. Con il drop + create il client vecchio, che di
-- `p_formato` non sa niente, continua a funzionare: il default lo mette a
-- 'Standard', che e' quello che quel client ha sempre inteso.
--
-- Semantica scelta per `modifica_vino`: il formato si applica a TUTTE le
-- giacenze di quel vino. Oggi e' l'unico strumento che esiste; dare un formato
-- alla singola bottiglia richiede una UI per-bottiglia, che sta oltre P6.

drop function if exists public.aggiungi_o_incrementa(text, text, text, smallint, text, integer, numeric, text, text, text, text, text);

create function public.aggiungi_o_incrementa(
  p_produttore text, p_vino text, p_denominazione text, p_annata smallint,
  p_tipologia text, p_bottiglie integer, p_prezzo numeric, p_vitigno text,
  p_note text, p_macerazione text, p_fermentazione text, p_malolattica text,
  p_formato text default 'Standard')
returns wines language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_row wines%ROWTYPE; v_produttore_id integer; v_prima jsonb;
BEGIN
  v_produttore_id := risolvi_produttore(p_produttore);

  SELECT to_jsonb(w.*) INTO v_prima FROM wines w
  WHERE lower(trim(w.produttore)) = lower(trim(p_produttore))
    AND lower(trim(w.vino)) = lower(trim(p_vino))
    AND w.annata = p_annata;

  INSERT INTO wines (produttore, produttore_id, vino, denominazione, annata, tipologia, bottiglie, prezzo, vitigno, note, macerazione, fermentazione, malolattica, slow_vino_bott)
  VALUES (p_produttore, v_produttore_id, p_vino, p_denominazione, p_annata, p_tipologia, p_bottiglie, p_prezzo, COALESCE(p_vitigno,''), COALESCE(p_note,''), p_macerazione, p_fermentazione, p_malolattica, false)
  ON CONFLICT (lower(trim(produttore)), lower(trim(vino)), annata)
  DO UPDATE SET bottiglie  = wines.bottiglie + EXCLUDED.bottiglie,
                deleted_at = NULL
  RETURNING * INTO v_row;

  INSERT INTO bottiglie (wine_id, formato, stato, prezzo_pagato)
  SELECT v_row.id, COALESCE(p_formato, 'Standard'), 'in_cantina', p_prezzo
  FROM generate_series(1, GREATEST(COALESCE(p_bottiglie, 0), 0));

  PERFORM registra_audit('aggiungi', v_row.id, NULL,
    jsonb_build_object('nuovo', v_prima IS NULL, 'wine_prima', v_prima));

  RETURN v_row;
END;
$function$;

drop function if exists public.modifica_vino(integer, text, text, text, smallint, text, integer, numeric, text, text, text, text, text, text);

create function public.modifica_vino(
  p_id integer, p_produttore text, p_vino text, p_denominazione text,
  p_annata smallint, p_tipologia text, p_bottiglie integer, p_prezzo numeric,
  p_vitigno text, p_note text, p_note_cantina text, p_macerazione text,
  p_fermentazione text, p_malolattica text, p_formato text default null)
returns wines language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_row wines%ROWTYPE; v_produttore_id integer; v_prima jsonb;
        v_attuali int; v_diff int; v_formato text;
BEGIN
  v_produttore_id := risolvi_produttore(p_produttore);

  SELECT to_jsonb(w.*) INTO v_prima FROM wines w WHERE w.id = p_id;

  UPDATE wines SET
    produttore = p_produttore, produttore_id = v_produttore_id,
    vino = p_vino, denominazione = p_denominazione, annata = p_annata,
    tipologia = p_tipologia, bottiglie = p_bottiglie, prezzo = p_prezzo, vitigno = COALESCE(p_vitigno,''),
    note = COALESCE(p_note,''), note_cantina = COALESCE(p_note_cantina,''), macerazione = p_macerazione,
    fermentazione = p_fermentazione, malolattica = p_malolattica
  WHERE id = p_id
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_id; END IF;

  -- p_formato NULL = "non toccare il formato": e' il caso del client vecchio,
  -- che non manda il parametro. Senza questo ramo una modifica qualsiasi
  -- riporterebbe a Standard un Magnum gia' registrato.
  v_formato := COALESCE(p_formato,
    (SELECT formato FROM bottiglie
      WHERE wine_id = p_id AND stato = 'in_cantina'
      GROUP BY formato ORDER BY count(*) DESC, formato LIMIT 1),
    'Standard');

  SELECT count(*) INTO v_attuali
    FROM bottiglie WHERE wine_id = p_id AND stato = 'in_cantina';
  v_diff := COALESCE(p_bottiglie, 0) - v_attuali;

  IF v_diff > 0 THEN
    INSERT INTO bottiglie (wine_id, formato, stato, prezzo_pagato)
    SELECT p_id, v_formato, 'in_cantina', p_prezzo FROM generate_series(1, v_diff);
  ELSIF v_diff < 0 THEN
    DELETE FROM bottiglie WHERE id IN (
      SELECT id FROM bottiglie
       WHERE wine_id = p_id AND stato = 'in_cantina'
       ORDER BY id DESC LIMIT (-v_diff));
  END IF;

  UPDATE bottiglie SET prezzo_pagato = p_prezzo
   WHERE wine_id = p_id AND stato = 'in_cantina';

  -- Il formato si riscrive solo se e' stato davvero chiesto.
  IF p_formato IS NOT NULL THEN
    UPDATE bottiglie SET formato = p_formato
     WHERE wine_id = p_id AND stato = 'in_cantina';
  END IF;

  PERFORM registra_audit('modifica', p_id, NULL, jsonb_build_object('wine_prima', v_prima));

  RETURN v_row;
END;
$function$;

notify pgrst, 'reload schema';
