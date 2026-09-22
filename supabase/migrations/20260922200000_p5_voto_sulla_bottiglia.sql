-- P5 — il voto sulla singola degustazione.
--
-- Chiude lo stopgap di P0. `valuta_vino` prende un `wine_id` e scrive sulla
-- bevuta piu' recente: era una scorciatoia nata quando il rating viveva per
-- etichetta, e impediva quello che Omar ha descritto il 22/09/2026 — due
-- bottiglie della stessa etichetta e annata non sono la stessa bevuta, e
-- possono meritare voti diversi. In `bottiglie` i voti divergenti esistono
-- gia' (5 vini), mancava solo il modo di darne uno nuovo.
--
-- `valuta_vino` NON viene droppata qui: fra il deploy del DDL e quello del
-- bundle il client in produzione la chiama ancora. Sparisce nel passo dopo,
-- a bundle nuovo verificato.

create or replace function public.valuta_bottiglia(
  p_bottiglia_id bigint, p_rating numeric)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_bott bottiglie%ROWTYPE;
BEGIN
  SELECT * INTO v_bott FROM bottiglie WHERE id = p_bottiglia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bottiglia % non trovata', p_bottiglia_id; END IF;

  -- Una bottiglia in cantina non si vota: il CHECK di coerenza lo impedirebbe
  -- comunque, ma un errore chiaro vale piu' di una violazione di vincolo.
  IF v_bott.stato <> 'bevuta' THEN
    RAISE EXCEPTION 'La bottiglia % non risulta bevuta', p_bottiglia_id;
  END IF;

  UPDATE bottiglie SET rating = p_rating WHERE id = p_bottiglia_id;

  PERFORM registra_audit('valuta', v_bott.wine_id, p_bottiglia_id,
    jsonb_build_object('bottiglia_prima', to_jsonb(v_bott)));

  RETURN jsonb_build_object('aggiornate', 1, 'bottiglia_id', p_bottiglia_id);
END;
$function$;

notify pgrst, 'reload schema';
