-- ============================================================================
-- P3 fase 2 — le RPC di scrittura popolano `produttore_id`.
--
-- Necessaria subito: la fase 1 ha reso `wines.produttore_id` NOT NULL, e
-- `aggiungi_o_incrementa` / `modifica_vino` non lo valorizzavano. Senza questa
-- migrazione aggiungere o modificare un vino fallirebbe.
--
-- `wines.produttore` (testo) resta popolata in parallelo: il client la legge
-- ancora. Verrà rimossa solo quando la fase 3 avrà migrato l'app.
-- ============================================================================

BEGIN;

-- Trova il produttore per nome normalizzato, o lo crea. Un solo punto in cui
-- nasce un produttore, così la normalizzazione non può divergere.
CREATE OR REPLACE FUNCTION risolvi_produttore(p_nome text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id integer;
BEGIN
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Produttore mancante';
  END IF;

  SELECT id INTO v_id FROM produttori WHERE nome_norm = lower(btrim(p_nome));
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO produttori (nome) VALUES (btrim(p_nome))
  ON CONFLICT (nome_norm) DO UPDATE SET nome = produttori.nome
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION aggiungi_o_incrementa(
  p_produttore text, p_vino text, p_denominazione text, p_annata smallint,
  p_tipologia text, p_bottiglie int, p_prezzo numeric, p_vitigno text,
  p_note text, p_macerazione text, p_fermentazione text, p_malolattica text
)
RETURNS wines
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row wines%ROWTYPE; v_produttore_id integer;
BEGIN
  v_produttore_id := risolvi_produttore(p_produttore);

  INSERT INTO wines (produttore, produttore_id, vino, denominazione, annata, tipologia, bottiglie, prezzo, vitigno, note, macerazione, fermentazione, malolattica, slow_vino_bott)
  VALUES (p_produttore, v_produttore_id, p_vino, p_denominazione, p_annata, p_tipologia, p_bottiglie, p_prezzo, COALESCE(p_vitigno,''), COALESCE(p_note,''), p_macerazione, p_fermentazione, p_malolattica, false)
  ON CONFLICT (lower(trim(produttore)), lower(trim(vino)), annata)
  DO UPDATE SET bottiglie = wines.bottiglie + EXCLUDED.bottiglie
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION modifica_vino(
  p_id int, p_produttore text, p_vino text, p_denominazione text, p_annata smallint,
  p_tipologia text, p_bottiglie int, p_prezzo numeric, p_vitigno text, p_note text,
  p_note_cantina text, p_macerazione text, p_fermentazione text, p_malolattica text
)
RETURNS wines
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row wines%ROWTYPE; v_produttore_id integer;
BEGIN
  v_produttore_id := risolvi_produttore(p_produttore);

  UPDATE wines SET
    produttore = p_produttore, produttore_id = v_produttore_id,
    vino = p_vino, denominazione = p_denominazione, annata = p_annata,
    tipologia = p_tipologia, bottiglie = p_bottiglie, prezzo = p_prezzo, vitigno = COALESCE(p_vitigno,''),
    note = COALESCE(p_note,''), note_cantina = COALESCE(p_note_cantina,''), macerazione = p_macerazione,
    fermentazione = p_fermentazione, malolattica = p_malolattica
  WHERE id = p_id
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_id; END IF;
  RETURN v_row;
END;
$$;

-- Il sito del produttore ora vive in `produttori`. `wine_websites` non viene
-- più scritta: resta congelata come legacy finché la fase 3 non la elimina.
CREATE OR REPLACE FUNCTION salva_sito_produttore(p_produttore text, p_url text, p_source text DEFAULT 'serper')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE produttori
  SET sito = p_url, sito_source = p_source
  WHERE id = risolvi_produttore(p_produttore);
END;
$$;

GRANT EXECUTE ON FUNCTION risolvi_produttore TO anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
