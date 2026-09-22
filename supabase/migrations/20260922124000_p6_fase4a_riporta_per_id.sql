-- P6 fase 4a (DDL) — `riporta_bottiglia_per_id`, che ragiona sulla riga-bottiglia.
--
-- Dalla fase 4a il client non legge piu' `bevuti`: costruisce lo storico dalle
-- righe `bottiglie WHERE stato='bevuta'`, e la chiave che ha in mano e'
-- `bottiglie.id`, non `bevuti.uid`.
--
-- La vecchia `riporta_bottiglia(p_uid)` NON viene droppata qui: resterebbe una
-- finestra, fra il deploy del DDL e quello del bundle, in cui il client in
-- produzione chiama una funzione che non esiste piu'. Le due convivono per un
-- passo; la vecchia sparisce in fase 4b insieme a `bevuti`.

create or replace function public.riporta_bottiglia_per_id(p_bottiglia_id bigint)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_bott bottiglie%ROWTYPE; v_bevuta jsonb; v_bottiglie int;
BEGIN
  SELECT * INTO v_bott FROM bottiglie WHERE id = p_bottiglia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bottiglia % non trovata', p_bottiglia_id; END IF;
  IF v_bott.stato <> 'bevuta' THEN
    RAISE EXCEPTION 'La bottiglia % non risulta bevuta', p_bottiglia_id;
  END IF;

  -- Finche' il vecchio modello esiste va tenuto allineato, come in fase 2.
  IF v_bott.legacy_uid IS NOT NULL THEN
    DELETE FROM bevuti WHERE uid = v_bott.legacy_uid
    RETURNING to_jsonb(bevuti.*) INTO v_bevuta;
  END IF;

  IF v_bott.wine_id IS NOT NULL THEN
    UPDATE wines SET bottiglie = bottiglie + 1
     WHERE id = v_bott.wine_id RETURNING bottiglie INTO v_bottiglie;
  END IF;

  UPDATE bottiglie SET
      stato = 'in_cantina', consumed_on = NULL, nota = NULL, rating = NULL,
      legacy_uid = NULL, produttore = NULL, vino = NULL, annata = NULL, tipologia = NULL
  WHERE id = p_bottiglia_id;

  -- La riga completa PRIMA della modifica, come vuole P1b: qui la bottiglia
  -- non viene piu' cancellata, ma il suo stato di "bevuta" si perde lo stesso.
  PERFORM registra_audit('riporta', v_bott.wine_id, v_bott.legacy_uid,
    jsonb_build_object('bottiglia_prima', to_jsonb(v_bott), 'bevuta_cancellata', v_bevuta));

  RETURN jsonb_build_object('bottiglie_residue', v_bottiglie);
END;
$function$;

notify pgrst, 'reload schema';
