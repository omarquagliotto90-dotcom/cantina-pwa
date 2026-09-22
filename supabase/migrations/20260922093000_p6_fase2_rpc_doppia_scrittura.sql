-- P6 fase 2 — le RPC scrivono sul modello nuovo E su quello vecchio.
--
-- L'app continua a leggere `wines.bottiglie` e `bevuti`: finche' e' cosi', un
-- rollback resta possibile buttando via `bottiglie` e basta. Questa fase serve
-- a impedire che i due modelli divergano nel frattempo.
--
-- Sei RPC su nove toccano le bottiglie. Le altre tre — `aggiorna_scheda_tecnica`,
-- `salva_immagine_vino`, `salva_sito_produttore` — non le toccano e restano
-- invariate, come `risolvi_produttore`.
--
-- Nessuna firma cambia: il client di oggi continua a funzionare senza sapere
-- che `bottiglie` esiste.

-- ── Il ponte ────────────────────────────────────────────────────────────────
-- `riporta_bottiglia(p_uid)` e `valuta_vino` ragionano su `bevuti.uid`, quindi
-- serve sapere quale riga di `bottiglie` e' quale bevuta. Colonna temporanea:
-- sparisce in fase 4 insieme a `bevuti`.
alter table public.bottiglie add column legacy_uid bigint;
create unique index idx_bottiglie_legacy_uid
  on public.bottiglie (legacy_uid) where legacy_uid is not null;

-- Le 50 righe bevute sono state inserite in fase 1 da `bevuti` con
-- `order by consumed_on, uid`, quindi l'ordine di `id` ricalca quello. Si
-- accoppiano per posizione e subito dopo si verifica che wine_id e consumed_on
-- combacino davvero: se non combaciassero, la migrazione si ferma qui.
with nuove as (
  select id, row_number() over (order by id) as n
  from public.bottiglie where stato = 'bevuta'
), vecchie as (
  select uid, wine_id, consumed_on, row_number() over (order by consumed_on, uid) as n
  from public.bevuti
)
update public.bottiglie b
   set legacy_uid = vecchie.uid
  from nuove join vecchie using (n)
 where b.id = nuove.id;

do $$
DECLARE v_scollate int; v_senza int;
BEGIN
  SELECT count(*) INTO v_senza FROM bottiglie WHERE stato='bevuta' AND legacy_uid IS NULL;
  SELECT count(*) INTO v_scollate
    FROM bottiglie b JOIN bevuti v ON v.uid = b.legacy_uid
   WHERE b.stato='bevuta'
     AND (b.wine_id IS DISTINCT FROM v.wine_id OR b.consumed_on IS DISTINCT FROM v.consumed_on);
  IF v_senza > 0 OR v_scollate > 0 THEN
    RAISE EXCEPTION 'Ponte legacy_uid incoerente: % senza uid, % scollate', v_senza, v_scollate;
  END IF;
END $$;

-- ── Codice morto ────────────────────────────────────────────────────────────
-- L'overload a 3 parametri di `bevi_bottiglia` e' un residuo di A3, gia'
-- annotato in P0: nessuno lo chiama. Va via adesso perche' da questa fase in
-- poi sarebbe peggio che morto — scriverebbe su `bevuti` senza toccare
-- `bottiglie`, cioe' proprio la divergenza che questa migrazione impedisce.
drop function if exists public.bevi_bottiglia(integer, text, numeric);

-- ── bevi_bottiglia ──────────────────────────────────────────────────────────
create or replace function public.bevi_bottiglia(
  p_wine_id integer, p_nota text default ''::text,
  p_rating numeric default null::numeric, p_consumed_on date default CURRENT_DATE)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_wine wines%ROWTYPE; v_uid bigint; v_consumed_on date; v_bott_id bigint;
BEGIN
  SELECT * INTO v_wine FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  INSERT INTO bevuti (wine_id, nota, rating, produttore, vino, annata, tipologia, prezzo, consumed_on)
  VALUES (p_wine_id, COALESCE(p_nota, ''), p_rating, v_wine.produttore, v_wine.vino, v_wine.annata, v_wine.tipologia, v_wine.prezzo, COALESCE(p_consumed_on, CURRENT_DATE))
  RETURNING bevuti.uid, bevuti.consumed_on INTO v_uid, v_consumed_on;

  UPDATE wines SET bottiglie = GREATEST(bottiglie - 1, 0) WHERE id = p_wine_id;

  -- P6: la bottiglia piu' vecchia in giacenza passa a 'bevuta'. Si prende la
  -- piu' vecchia perche' e' l'unico criterio che oggi esiste: finche' il
  -- formato e' Standard ovunque, sono intercambiabili.
  UPDATE bottiglie SET
      stato = 'bevuta', consumed_on = v_consumed_on, nota = NULLIF(COALESCE(p_nota,''), ''),
      rating = p_rating, legacy_uid = v_uid,
      produttore = v_wine.produttore, vino = v_wine.vino,
      annata = v_wine.annata, tipologia = v_wine.tipologia
  WHERE id = (SELECT id FROM bottiglie
               WHERE wine_id = p_wine_id AND stato = 'in_cantina'
               ORDER BY id LIMIT 1)
  RETURNING id INTO v_bott_id;

  -- Nessuna giacenza da consumare: il vecchio modello e' comunque la verita'
  -- in questa fase, quindi si registra la bevuta e basta, senza far fallire
  -- l'operazione dell'utente per un disallineamento interno.
  IF v_bott_id IS NULL THEN
    INSERT INTO bottiglie (wine_id, formato, stato, prezzo_pagato, consumed_on, nota, rating,
                           legacy_uid, produttore, vino, annata, tipologia)
    VALUES (p_wine_id, 'Standard', 'bevuta', v_wine.prezzo, v_consumed_on,
            NULLIF(COALESCE(p_nota,''), ''), p_rating, v_uid,
            v_wine.produttore, v_wine.vino, v_wine.annata, v_wine.tipologia);
  END IF;

  PERFORM registra_audit('bevi', p_wine_id, v_uid, jsonb_build_object('wine_prima', to_jsonb(v_wine)));

  RETURN jsonb_build_object('uid', v_uid, 'consumed_on', v_consumed_on, 'bottiglie_residue', GREATEST(v_wine.bottiglie - 1, 0));
END;
$function$;

-- ── riporta_bottiglia ───────────────────────────────────────────────────────
create or replace function public.riporta_bottiglia(p_uid bigint)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_wine_id int; v_bottiglie int; v_bevuta jsonb;
BEGIN
  DELETE FROM bevuti WHERE bevuti.uid = p_uid RETURNING to_jsonb(bevuti.*) INTO v_bevuta;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bevuta % non trovata', p_uid; END IF;

  v_wine_id := (v_bevuta->>'wine_id')::int;

  IF v_wine_id IS NOT NULL THEN
    UPDATE wines SET bottiglie = bottiglie + 1 WHERE id = v_wine_id RETURNING bottiglie INTO v_bottiglie;
  END IF;

  -- P6: la riga torna in giacenza invece di sparire. E' l'unico DELETE fisico
  -- rimasto nel vecchio modello, e qui non serve nemmeno quello.
  UPDATE bottiglie SET
      stato = 'in_cantina', consumed_on = NULL, nota = NULL, rating = NULL,
      legacy_uid = NULL, produttore = NULL, vino = NULL, annata = NULL, tipologia = NULL
  WHERE legacy_uid = p_uid;

  PERFORM registra_audit('riporta', v_wine_id, p_uid, jsonb_build_object('bevuta_cancellata', v_bevuta));

  RETURN jsonb_build_object('bottiglie_residue', v_bottiglie);
END;
$function$;

-- ── elimina_bottiglia ───────────────────────────────────────────────────────
create or replace function public.elimina_bottiglia(p_wine_id integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_wine wines%ROWTYPE;
BEGIN
  SELECT * INTO v_wine FROM wines WHERE id = p_wine_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vino % non trovato', p_wine_id; END IF;

  -- P6: una giacenza in meno in entrambi i rami. Le righe gia' bevute non si
  -- toccano mai — sono storico.
  DELETE FROM bottiglie WHERE id = (
    SELECT id FROM bottiglie
     WHERE wine_id = p_wine_id AND stato = 'in_cantina'
     ORDER BY id DESC LIMIT 1);

  IF v_wine.bottiglie > 1 THEN
    UPDATE wines SET bottiglie = bottiglie - 1 WHERE id = p_wine_id;
    PERFORM registra_audit('elimina', p_wine_id, NULL,
      jsonb_build_object('eliminato', false, 'wine_prima', to_jsonb(v_wine)));
    RETURN jsonb_build_object('eliminato', false, 'bottiglie_residue', v_wine.bottiglie - 1);
  ELSE
    UPDATE wines SET bottiglie = 0, deleted_at = now() WHERE id = p_wine_id;
    PERFORM registra_audit('elimina', p_wine_id, NULL,
      jsonb_build_object('eliminato', true, 'wine_prima', to_jsonb(v_wine)));
    RETURN jsonb_build_object('eliminato', true, 'bottiglie_residue', 0);
  END IF;
END;
$function$;

-- ── aggiungi_o_incrementa ───────────────────────────────────────────────────
-- Firma invariata: il formato non e' ancora un parametro, arriva in fase 3 col
-- form. Tutto quel che si aggiunge oggi e' Standard, come le 117 migrate.
create or replace function public.aggiungi_o_incrementa(
  p_produttore text, p_vino text, p_denominazione text, p_annata smallint,
  p_tipologia text, p_bottiglie integer, p_prezzo numeric, p_vitigno text,
  p_note text, p_macerazione text, p_fermentazione text, p_malolattica text)
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

  -- P6: una riga per bottiglia aggiunta.
  INSERT INTO bottiglie (wine_id, formato, stato, prezzo_pagato)
  SELECT v_row.id, 'Standard', 'in_cantina', p_prezzo
  FROM generate_series(1, GREATEST(COALESCE(p_bottiglie, 0), 0));

  PERFORM registra_audit('aggiungi', v_row.id, NULL,
    jsonb_build_object('nuovo', v_prima IS NULL, 'wine_prima', v_prima));

  RETURN v_row;
END;
$function$;

-- ── modifica_vino ───────────────────────────────────────────────────────────
create or replace function public.modifica_vino(
  p_id integer, p_produttore text, p_vino text, p_denominazione text,
  p_annata smallint, p_tipologia text, p_bottiglie integer, p_prezzo numeric,
  p_vitigno text, p_note text, p_note_cantina text, p_macerazione text,
  p_fermentazione text, p_malolattica text)
returns wines language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_row wines%ROWTYPE; v_produttore_id integer; v_prima jsonb;
        v_attuali int; v_diff int;
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

  -- P6: `p_bottiglie` e' il nuovo TOTALE in giacenza, non un delta, quindi qui
  -- si riconcilia. Lo snapshot sulle righe gia' bevute non si aggiorna mai,
  -- nemmeno se il vino viene rinominato: e' storico, per vincolo di progetto.
  SELECT count(*) INTO v_attuali
    FROM bottiglie WHERE wine_id = p_id AND stato = 'in_cantina';
  v_diff := COALESCE(p_bottiglie, 0) - v_attuali;

  IF v_diff > 0 THEN
    INSERT INTO bottiglie (wine_id, formato, stato, prezzo_pagato)
    SELECT p_id, 'Standard', 'in_cantina', p_prezzo FROM generate_series(1, v_diff);
  ELSIF v_diff < 0 THEN
    DELETE FROM bottiglie WHERE id IN (
      SELECT id FROM bottiglie
       WHERE wine_id = p_id AND stato = 'in_cantina'
       ORDER BY id DESC LIMIT (-v_diff));
  END IF;

  -- Il prezzo pagato segue quello dell'anagrafica finche' non esiste un modo
  -- di darlo bottiglia per bottiglia: senza questo, il costo della giacenza
  -- calcolato sui due modelli divergerebbe alla prima modifica di prezzo.
  UPDATE bottiglie SET prezzo_pagato = p_prezzo
   WHERE wine_id = p_id AND stato = 'in_cantina';

  PERFORM registra_audit('modifica', p_id, NULL, jsonb_build_object('wine_prima', v_prima));

  RETURN v_row;
END;
$function$;

-- ── valuta_vino ─────────────────────────────────────────────────────────────
create or replace function public.valuta_vino(p_wine_id integer, p_rating numeric)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE v_uid bigint; v_prima jsonb;
BEGIN
  SELECT uid, to_jsonb(b.*) INTO v_uid, v_prima
  FROM bevuti b
  WHERE wine_id = p_wine_id
  ORDER BY consumed_on DESC, uid DESC
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('aggiornate', 0, 'uid', NULL);
  END IF;

  UPDATE bevuti SET rating = p_rating WHERE uid = v_uid;

  -- P6: lo stesso voto sulla riga-bottiglia corrispondente. Resta lo stopgap
  -- di P0 (si scrive solo sulla bevuta piu' recente): il voto per singola
  -- degustazione e' P5, che segue questo passo.
  UPDATE bottiglie SET rating = p_rating WHERE legacy_uid = v_uid;

  PERFORM registra_audit('valuta', p_wine_id, v_uid, jsonb_build_object('bevuta_prima', v_prima));

  RETURN jsonb_build_object('aggiornate', 1, 'uid', v_uid);
END;
$function$;

notify pgrst, 'reload schema';
