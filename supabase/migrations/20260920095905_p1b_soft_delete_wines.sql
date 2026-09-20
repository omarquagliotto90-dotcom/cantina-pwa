-- ============================================================================
-- P1b.2 — soft delete su `wines`.
--
-- Oggi `elimina_bottiglia` sull'ultima bottiglia fa `DELETE FROM wines`: la FK
-- CASCADE porta via la riga in `wine_images` e la FK SET NULL stacca per sempre
-- le bevute dal vino. È già successo una volta (l'orfano del vino 76, pulito in
-- A2a). Senza `auth.uid()` la probabilità del danno non è riducibile (Q1 = b),
-- quindi si riduce la gravità: l'eliminazione smette di essere distruttiva.
--
-- Vale soprattutto contro l'errore di tocco, che è lo scenario più probabile.
--
-- Due scelte da motivare, entrambe dal piano:
--
-- 1. `idx_wines_unique_normalizzato` non ha clausola WHERE, quindi una riga
--    soft-deleted continua a occupare lo slot e il ri-inserimento dello stesso
--    vino andrebbe in conflitto. Invece di rendere l'indice parziale, qui si fa
--    "resuscitare" la riga: l'upsert azzera `deleted_at`. Conserva id, immagine
--    e storico delle bevute, che è esattamente ciò che si vuole se il vino torna.
--
-- 2. La FK `wine_images -> wines` resta ON DELETE CASCADE, contro quanto
--    suggeriva il piano. Con il soft delete il DELETE non avviene più, quindi il
--    CASCADE non scatta e l'immagine sopravvive da sola: toglierlo servirebbe
--    solo a lasciare orfani il giorno di una cancellazione fisica vera.
--
-- Non tocca `riporta_bottiglia`, che contiene l'altro DELETE del sistema (sulla
-- riga di `bevuti`). Il suo recupero è affidato all'audit log di P1b.3: dare a
-- `bevuti` un soft delete proprio sarebbe lavoro buttato, perché con Q2 = a la
-- tabella viene assorbita da `bottiglie` in P6.
-- ============================================================================

BEGIN;

ALTER TABLE wines ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN wines.deleted_at IS
  'P1b: NULL = vino in catalogo. Valorizzata = eliminato dall''app, riga conservata. '
  'Il client filtra deleted_at IS NULL; aggiungi_o_incrementa la riazzera (resurrezione).';

-- ── elimina_bottiglia: l'ultima bottiglia non cancella più la riga ──────────
CREATE OR REPLACE FUNCTION public.elimina_bottiglia(p_wine_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_bottiglie int;
BEGIN
  SELECT bottiglie INTO v_bottiglie FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  IF v_bottiglie > 1 THEN
    UPDATE wines SET bottiglie = bottiglie - 1 WHERE id = p_wine_id;
    RETURN jsonb_build_object('eliminato', false, 'bottiglie_residue', v_bottiglie - 1);
  ELSE
    -- Era: DELETE FROM wines WHERE id = p_wine_id;
    -- La riga resta, con bottiglie a 0 e la data di eliminazione. Il contratto
    -- di ritorno non cambia: il client continua a leggere `eliminato`.
    UPDATE wines SET bottiglie = 0, deleted_at = now() WHERE id = p_wine_id;
    RETURN jsonb_build_object('eliminato', true, 'bottiglie_residue', 0);
  END IF;
END;
$function$;

-- ── aggiungi_o_incrementa: il ri-inserimento resuscita la riga ──────────────
CREATE OR REPLACE FUNCTION public.aggiungi_o_incrementa(
  p_produttore text, p_vino text, p_denominazione text, p_annata smallint,
  p_tipologia text, p_bottiglie integer, p_prezzo numeric, p_vitigno text,
  p_note text, p_macerazione text, p_fermentazione text, p_malolattica text)
RETURNS wines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_row wines%ROWTYPE; v_produttore_id integer;
BEGIN
  v_produttore_id := risolvi_produttore(p_produttore);

  INSERT INTO wines (produttore, produttore_id, vino, denominazione, annata, tipologia, bottiglie, prezzo, vitigno, note, macerazione, fermentazione, malolattica, slow_vino_bott)
  VALUES (p_produttore, v_produttore_id, p_vino, p_denominazione, p_annata, p_tipologia, p_bottiglie, p_prezzo, COALESCE(p_vitigno,''), COALESCE(p_note,''), p_macerazione, p_fermentazione, p_malolattica, false)
  ON CONFLICT (lower(trim(produttore)), lower(trim(vino)), annata)
  DO UPDATE SET bottiglie  = wines.bottiglie + EXCLUDED.bottiglie,
                -- Resurrezione: un vino eliminato e riaggiunto torna con il suo
                -- id, la sua immagine e le sue bevute. Gli altri campi restano
                -- quelli in archivio, come già avveniva per un vino mai eliminato.
                deleted_at = NULL
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

COMMIT;
