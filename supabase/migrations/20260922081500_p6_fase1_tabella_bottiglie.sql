-- P6 fase 1 — la tabella `bottiglie`, popolata ma non ancora letta da nessuno.
--
-- Il campo che ha fatto partire P6 e' `formato`: Omar ha chiesto il tipo di
-- bottiglia, e il registro delle decisioni (punto 4) lo aveva gia' assegnato a
-- questo passo, perche' il formato appartiene alla singola bottiglia e non
-- all'etichetta. Su `wines` non ci starebbe: l'indice UNIQUE normalizzato e'
-- (produttore, vino, annata) e un Magnum finirebbe in upsert sulla stessa riga
-- dello Standard.
--
-- Questa fase NON tocca niente di esistente: nessuna colonna cambia, nessuna
-- RPC cambia, l'app continua a leggere `wines.bottiglie` e `bevuti`. Si annulla
-- con `drop table public.bottiglie`.
--
-- Stato misurato prima di scrivere (22/09/2026):
--   90 vini attivi, 117 bottiglie in giacenza, 50 bevute
--   1 bevuta orfana (wine_id NULL): il Raina Umbria Grechetto, vino 76,
--   cancellato fisicamente prima che A2a mettesse le FK
-- Da qui due scelte:
--   · `wine_id` NULLABLE con ON DELETE SET NULL, come `bevuti` oggi
--   · snapshot (produttore/vino/annata/tipologia) solo sulle righe bevute, che
--     sono immutabili per vincolo di progetto. Le giacenze si leggono sempre
--     via join: da P1b `wines` non si cancella piu' fisicamente, quindi una
--     giacenza senza vino non si presenta

create table public.bottiglie (
  id            bigint generated always as identity primary key,
  wine_id       integer references public.wines(id) on delete set null,

  formato       text not null default 'Standard',
  stato         text not null default 'in_cantina',

  -- acquisto: ignoti per le 167 righe migrate, si compilano da qui in avanti
  acquistata_il date,
  prezzo_pagato numeric,
  posizione     text,

  -- consumo
  consumed_on   date,
  nota          text,
  rating        numeric(2,1),

  -- snapshot storico, valorizzato solo sulle bevute
  produttore    text,
  vino          text,
  annata        smallint,
  tipologia     text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint bottiglie_formato_valido check (
    formato in ('Mezza','Medium','Standard','Litro','Magnum','Jeroboam')),
  constraint bottiglie_stato_valido check (stato in ('in_cantina','bevuta')),
  -- Una bottiglia in cantina non ha data di consumo ne' voto: sono la stessa
  -- cosa detta due volte, e senza questo vincolo divergerebbero.
  constraint bottiglie_coerenza_consumo check (
    (stato = 'bevuta'     and consumed_on is not null) or
    (stato = 'in_cantina' and consumed_on is null and rating is null)),
  constraint bottiglie_rating_valido check (
    rating is null or (rating >= 1 and rating <= 5)),
  constraint bottiglie_prezzo_valido check (
    prezzo_pagato is null or prezzo_pagato >= 0)
);

create index idx_bottiglie_wine_id on public.bottiglie (wine_id);
create index idx_bottiglie_stato   on public.bottiglie (stato);

create trigger bottiglie_set_updated_at
  before update on public.bottiglie
  for each row execute function public.set_updated_at();

-- ── Migrazione: le bevute ───────────────────────────────────────────────────
-- Una riga di `bevuti` = una bottiglia bevuta. `bevuti.annata` e' text e
-- `wines.annata` smallint da A2b: qui si converte solo cio' che e' davvero un
-- anno di quattro cifre, il resto diventa NULL invece di far fallire la
-- migrazione.
insert into public.bottiglie
  (wine_id, formato, stato, prezzo_pagato, consumed_on, nota, rating,
   produttore, vino, annata, tipologia, created_at)
select b.wine_id,
       'Standard',
       'bevuta',
       b.prezzo,
       b.consumed_on,
       nullif(b.nota, ''),
       b.rating,
       b.produttore,
       b.vino,
       case when b.annata ~ '^\d{4}$' then b.annata::smallint end,
       b.tipologia,
       b.created_at
from public.bevuti b
order by b.consumed_on, b.uid;

-- ── Migrazione: le giacenze ─────────────────────────────────────────────────
-- N righe per vino, una per bottiglia. `wines.prezzo` e' il prezzo pagato per
-- bottiglia, quindi si copia tale e quale su ognuna.
insert into public.bottiglie
  (wine_id, formato, stato, prezzo_pagato, created_at)
select w.id, 'Standard', 'in_cantina', w.prezzo, w.created_at
from public.wines w
cross join generate_series(1, w.bottiglie)
where w.deleted_at is null and w.bottiglie > 0
order by w.id;

-- Solo lettura per `anon`, come le altre quattro tabelle: le scritture passano
-- dalle RPC (che in questa fase non esistono ancora — arrivano in fase 2).
grant select on public.bottiglie to anon;

notify pgrst, 'reload schema';
