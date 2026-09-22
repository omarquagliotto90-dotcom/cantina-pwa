-- P6 fase 4b — il vecchio modello sparisce. IRREVERSIBILE.
--
-- Eseguita dopo aver verificato, sui dati veri, che i due modelli coincidevano:
--   0 vini disallineati, giacenza 117 = 117, bevute 50 = 50,
--   somma dei voti 198,7 = 198,7, ponte legacy_uid completo in entrambi i versi.
-- Backup: supabase/backup/20260922_pre_p6_fase4.json
--
-- Ordine: prima le RPC smettono di usare cio' che sta per sparire, poi si
-- droppa. Tutto in una transazione: se una funzione non compila, non si perde
-- niente.
--
-- Cosa sparisce:
--   · `bevuti` (tabella)           -> `bottiglie WHERE stato='bevuta'`
--   · `wines.bottiglie` (colonna)  -> conteggio delle righe in_cantina
--   · `riporta_bottiglia(p_uid)`   -> `riporta_bottiglia_per_id(p_bottiglia_id)`
--   · `bottiglie.legacy_uid`       -> il ponte non serve piu'

-- ── valuta_vino: il voto va sulla riga-bottiglia ───────────────────────────
-- Resta lo stopgap di P0 (si scrive solo sulla degustazione piu' recente): il
-- voto per singola bottiglia e' P5, che segue questo passo.
create or replace function public.valuta_vino(p_wine_id integer, p_rating numeric)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_id bigint; v_prima jsonb;
BEGIN
  SELECT id, to_jsonb(b.*) INTO v_id, v_prima
  FROM bottiglie b
  WHERE wine_id = p_wine_id AND stato = 'bevuta'
  ORDER BY consumed_on DESC, id DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('aggiornate', 0, 'uid', NULL);
  END IF;

  UPDATE bottiglie SET rating = p_rating WHERE id = v_id;

  PERFORM registra_audit('valuta', p_wine_id, v_id, jsonb_build_object('bottiglia_prima', v_prima));

  RETURN jsonb_build_object('aggiornate', 1, 'uid', v_id);
END;
$function$;

-- ── bevi_bottiglia: una sola scrittura, sulla riga ─────────────────────────
create or replace function public.bevi_bottiglia(
  p_wine_id integer, p_nota text default ''::text,
  p_rating numeric default null::numeric, p_consumed_on date default CURRENT_DATE)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_wine wines%ROWTYPE; v_consumed_on date; v_bott_id bigint; v_residue int;
BEGIN
  SELECT * INTO v_wine FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  v_consumed_on := COALESCE(p_consumed_on, CURRENT_DATE);

  UPDATE bottiglie SET
      stato = 'bevuta', consumed_on = v_consumed_on, nota = NULLIF(COALESCE(p_nota,''), ''),
      rating = p_rating,
      produttore = v_wine.produttore, vino = v_wine.vino,
      annata = v_wine.annata, tipologia = v_wine.tipologia
  WHERE id = (SELECT id FROM bottiglie
               WHERE wine_id = p_wine_id AND stato = 'in_cantina'
               ORDER BY id LIMIT 1)
  RETURNING id INTO v_bott_id;

  -- Senza righe in giacenza non c'e' piu' niente da bere: prima il vecchio
  -- modello faceva da rete, ora la verita' e' una sola e va detta.
  IF v_bott_id IS NULL THEN
    RAISE EXCEPTION 'Nessuna bottiglia in cantina per il vino %', p_wine_id;
  END IF;

  SELECT count(*) INTO v_residue
    FROM bottiglie WHERE wine_id = p_wine_id AND stato = 'in_cantina';

  PERFORM registra_audit('bevi', p_wine_id, v_bott_id, jsonb_build_object('wine_prima', to_jsonb(v_wine)));

  RETURN jsonb_build_object('bottiglia_id', v_bott_id, 'consumed_on', v_consumed_on,
                            'bottiglie_residue', v_residue);
END;
$function$;

-- ── riporta_bottiglia_per_id ───────────────────────────────────────────────
create or replace function public.riporta_bottiglia_per_id(p_bottiglia_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_bott bottiglie%ROWTYPE; v_residue int;
BEGIN
  SELECT * INTO v_bott FROM bottiglie WHERE id = p_bottiglia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bottiglia % non trovata', p_bottiglia_id; END IF;
  IF v_bott.stato <> 'bevuta' THEN
    RAISE EXCEPTION 'La bottiglia % non risulta bevuta', p_bottiglia_id;
  END IF;

  UPDATE bottiglie SET
      stato = 'in_cantina', consumed_on = NULL, nota = NULL, rating = NULL,
      produttore = NULL, vino = NULL, annata = NULL, tipologia = NULL
  WHERE id = p_bottiglia_id;

  SELECT count(*) INTO v_residue
    FROM bottiglie WHERE wine_id = v_bott.wine_id AND stato = 'in_cantina';

  PERFORM registra_audit('riporta', v_bott.wine_id, p_bottiglia_id,
    jsonb_build_object('bottiglia_prima', to_jsonb(v_bott)));

  RETURN jsonb_build_object('bottiglie_residue', v_residue);
END;
$function$;

-- ── elimina_bottiglia: il ramo si decide contando le righe ─────────────────
create or replace function public.elimina_bottiglia(p_wine_id integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_wine wines%ROWTYPE; v_prima int; v_residue int;
BEGIN
  SELECT * INTO v_wine FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  SELECT count(*) INTO v_prima
    FROM bottiglie WHERE wine_id = p_wine_id AND stato = 'in_cantina';

  DELETE FROM bottiglie WHERE id = (
    SELECT id FROM bottiglie
     WHERE wine_id = p_wine_id AND stato = 'in_cantina'
     ORDER BY id DESC LIMIT 1);

  v_residue := GREATEST(v_prima - 1, 0);

  IF v_residue > 0 THEN
    PERFORM registra_audit('elimina', p_wine_id, NULL,
      jsonb_build_object('eliminato', false, 'wine_prima', to_jsonb(v_wine)));
    RETURN jsonb_build_object('eliminato', false, 'bottiglie_residue', v_residue);
  ELSE
    UPDATE wines SET deleted_at = now() WHERE id = p_wine_id;
    PERFORM registra_audit('elimina', p_wine_id, NULL,
      jsonb_build_object('eliminato', true, 'wine_prima', to_jsonb(v_wine)));
    RETURN jsonb_build_object('eliminato', true, 'bottiglie_residue', 0);
  END IF;
END;
$function$;

-- ── aggiungi_o_incrementa: `wines` e' solo anagrafica ──────────────────────
-- L'ON CONFLICT non somma piu' niente: la quantita' sta nelle righe. Resta
-- `deleted_at = NULL`, che e' la resurrezione di P1b e da sola giustifica
-- ancora il DO UPDATE.
create or replace function public.aggiungi_o_incrementa(
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

  INSERT INTO wines (produttore, produttore_id, vino, denominazione, annata, tipologia, prezzo, vitigno, note, macerazione, fermentazione, malolattica, slow_vino_bott)
  VALUES (p_produttore, v_produttore_id, p_vino, p_denominazione, p_annata, p_tipologia, p_prezzo, COALESCE(p_vitigno,''), COALESCE(p_note,''), p_macerazione, p_fermentazione, p_malolattica, false)
  ON CONFLICT (lower(trim(produttore)), lower(trim(vino)), annata)
  DO UPDATE SET deleted_at = NULL
  RETURNING * INTO v_row;

  INSERT INTO bottiglie (wine_id, formato, stato, prezzo_pagato)
  SELECT v_row.id, COALESCE(p_formato, 'Standard'), 'in_cantina', p_prezzo
  FROM generate_series(1, GREATEST(COALESCE(p_bottiglie, 0), 0));

  PERFORM registra_audit('aggiungi', v_row.id, NULL,
    jsonb_build_object('nuovo', v_prima IS NULL, 'wine_prima', v_prima));

  RETURN v_row;
END;
$function$;

-- ── modifica_vino ──────────────────────────────────────────────────────────
create or replace function public.modifica_vino(
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
    tipologia = p_tipologia, prezzo = p_prezzo, vitigno = COALESCE(p_vitigno,''),
    note = COALESCE(p_note,''), note_cantina = COALESCE(p_note_cantina,''), macerazione = p_macerazione,
    fermentazione = p_fermentazione, malolattica = p_malolattica
  WHERE id = p_id
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_id; END IF;

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

  IF p_formato IS NOT NULL THEN
    UPDATE bottiglie SET formato = p_formato
     WHERE wine_id = p_id AND stato = 'in_cantina';
  END IF;

  PERFORM registra_audit('modifica', p_id, NULL, jsonb_build_object('wine_prima', v_prima));

  RETURN v_row;
END;
$function$;

-- ── Le rimozioni ───────────────────────────────────────────────────────────
drop function if exists public.riporta_bottiglia(bigint);
drop table if exists public.bevuti;
alter table public.wines     drop column if exists bottiglie;
alter table public.bottiglie drop column if exists legacy_uid;

notify pgrst, 'reload schema';
