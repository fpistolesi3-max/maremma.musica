-- Schema relazionale, tappa 1 di 3: le anagrafiche (serate, tipi di prevendita, PR, utenti, impostazioni, porte, registro email).
-- Vedi PIANO-SCHEMA.md. Il codice dell'app NON usa ancora queste tabelle: finché l'interruttore MM_ARCHIVIO resta spento il sito
-- legge e scrive la riga unica `archivio_mvp`, come prima. Questa migrazione quindi non cambia nulla per il sito.
--
-- Regole comuni:
-- - gli id sono quelli già presenti nell'archivio (UUID), così QR e link già emessi continuano a valere;
-- - testo + CHECK al posto degli enum (un valore nuovo non richiede una transazione a parte);
-- - RLS accesa, nessuna policy, permessi solo a service_role: nessun browser parla con Supabase, tutto passa da lib/dati/*
--   (che controlla il ruolo). Le policy basate su auth.uid() della prima migrazione non servono.
-- Non si portano: cassa (cassa_attiva, prezzo_cassa) e consegne: nessun dato le usa più.

-- ---------------------------------------------------------------- eventi
create table if not exists public.eventi (
  id                    uuid primary key,
  numero                integer unique,                                                -- MM/025
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome                  text not null,
  data                  timestamptz not null,                                          -- apertura porte
  data_fine             timestamptz,
  location              text,
  comune                text,
  lat                   double precision,
  lng                   double precision,
  location_segreta      boolean not null default false,                                -- il posto si vede solo 48 ore prima
  tipo_ingresso         text not null default 'lista' check (tipo_ingresso in ('libero', 'lista', 'prevendita_online')),
  descrizione           text,
  highlight             text,
  dress_code            text,
  lineup                text[] not null default '{}',
  info_arrivo           text,
  locandina_url         text,
  piantina_url          text,
  prezzo_lista          numeric(8,2) not null default 0 check (prezzo_lista >= 0),
  senza_telefono        boolean not null default false,
  prevendita_fino_alle  timestamptz,                                                   -- orario limite; null = la prima 01:00 dopo l'apertura (regola nel codice)
  capienza              integer check (capienza is null or capienza > 0),
  eta_minima            integer not null default 18 check (eta_minima between 0 and 99),
  pubblicato            boolean not null default false,
  in_copertina          boolean not null default false,
  pr_abilitati          uuid[],                                                        -- null = tutti i PR attivi
  invio_link_pr         jsonb,                                                         -- ultimo invio in blocco dei link ai PR
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- Una sola serata in copertina alla volta, garantito dal database.
create unique index if not exists eventi_una_copertina on public.eventi (in_copertina) where in_copertina;
create index if not exists eventi_data_idx on public.eventi (data);

-- ---------------------------------------------------------------- lotti (tipi di prevendita)
create table if not exists public.lotti (
  id                    uuid primary key,
  evento_id             uuid not null references public.eventi (id) on delete cascade,
  nome                  text not null,
  prezzo                numeric(8,2) not null default 0 check (prezzo >= 0),
  quantita              integer check (quantita is null or quantita >= 0),            -- null = senza limite
  data_inizio           timestamptz,
  data_fine             timestamptz,
  visibile_da_pr        boolean not null default true,
  ordine                integer not null default 0,
  categoria             text check (categoria is null or length(btrim(categoria)) between 1 and 40),
  conferma_categoria    boolean not null default false,
  uscita_giorni_prima   integer check (uscita_giorni_prima is null or uscita_giorni_prima >= 0),
  fine_ore_prima        integer check (fine_ore_prima is null or fine_ore_prima >= 0),
  dopo_precedente       boolean not null default false,
  pr_abilitati          uuid[],                                                        -- null = tutti (se visibile_da_pr)
  automatico            boolean not null default false,                                -- creato con la serata e mai ritoccato
  -- Ha senso chiedere la conferma solo se c'è una categoria.
  constraint lotti_conferma_con_categoria check (not conferma_categoria or categoria is not null),
  -- Un'uscita è o relativa o a data fissa, non entrambe; lo stesso per la chiusura.
  constraint lotti_uscita_unica check (uscita_giorni_prima is null or data_inizio is null),
  constraint lotti_chiusura_unica check (fine_ore_prima is null or data_fine is null)
);
create index if not exists lotti_evento_idx on public.lotti (evento_id, ordine);

-- ---------------------------------------------------------------- pr e utenti
create table if not exists public.pr (
  id                    uuid primary key,
  handle                text not null unique check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome_display          text not null,
  stato                 text not null default 'attivo' check (stato in ('attivo', 'sospeso')),
  created_at            timestamptz not null default now()
);

-- Niente collegamento a auth.users: il sito ha il suo accesso con link/codice via email.
-- Un PR non si cancella mai (si sospende): per questo `restrict` e non `cascade`, nessun accesso sparisce in silenzio.
create table if not exists public.utenti (
  id                    uuid primary key,
  email                 text not null,
  ruolo                 text not null check (ruolo in ('admin', 'staff', 'pr')),
  pr_id                 uuid unique references public.pr (id) on delete restrict,
  created_at            timestamptz not null default now(),
  constraint utenti_pr_coerente check ((ruolo = 'pr') = (pr_id is not null))
);
create unique index if not exists utenti_email_unica on public.utenti (lower(email));

-- ---------------------------------------------------------------- impostazioni, porte, registro email
-- `segreto` = chiave HMAC dei QR (se cambia, tutti i QR già emessi smettono di valere: si copia identica e si confronta per impronta).
-- `archivio` = 'jsonb' finché il sito usa ancora la riga unica; l'importatore gira solo in quel caso.
create table if not exists public.impostazioni (
  chiave                text primary key,
  valore                text not null,
  updated_at            timestamptz not null default now()
);
insert into public.impostazioni (chiave, valore) values ('archivio', 'jsonb') on conflict (chiave) do nothing;

-- Quante persone sono entrate da ogni porta non si salva: si calcola dalle iscrizioni.
create table if not exists public.porte (
  evento_id             uuid not null references public.eventi (id) on delete cascade,
  nome                  text not null,
  ultimo_sync           timestamptz not null,
  primary key (evento_id, nome)
);

-- Solo per la modalità "email nell'archivio" (prove, senza SMTP). Il cron la svuota a 30 giorni.
create table if not exists public.posta_inviata (
  id                    uuid primary key default gen_random_uuid(),
  a                     text not null,
  oggetto               text not null,
  html                  text not null,
  inviata_at            timestamptz not null default now(),
  via                   text not null check (via in ('archivio', 'smtp'))
);
create index if not exists posta_inviata_data on public.posta_inviata (inviata_at);

-- ---------------------------------------------------------------- permessi
alter table public.eventi enable row level security;
alter table public.lotti enable row level security;
alter table public.pr enable row level security;
alter table public.utenti enable row level security;
alter table public.impostazioni enable row level security;
alter table public.porte enable row level security;
alter table public.posta_inviata enable row level security;
revoke all on public.eventi, public.lotti, public.pr, public.utenti, public.impostazioni, public.porte, public.posta_inviata
  from anon, authenticated;
grant all on table public.eventi, public.lotti, public.pr, public.utenti, public.impostazioni, public.porte, public.posta_inviata
  to service_role;

-- ---------------------------------------------------------------- importa_archivio()
-- Copia le anagrafiche dalla riga `archivio_mvp` alle tabelle, dentro il database e in un'unica transazione: i dati personali
-- non escono mai. Rilanciabile: rifà la copia da capo (svuota prima le tabelle nuove) finché l'interruttore è 'jsonb'.
-- Restituisce solo conteggi. Le tappe 2 e 3 la estendono con le vendite e i tavoli (create or replace).
-- Nota: `where true` perché sui progetti Supabase un DELETE senza WHERE viene rifiutato anche dentro le funzioni.
create or replace function public.importa_archivio()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a        jsonb;
  v        bigint;
  flag     text;
  n        integer;
  esito    jsonb := '{}'::jsonb;
begin
  select valore into flag from public.impostazioni where chiave = 'archivio';
  if flag is distinct from 'jsonb' then
    raise exception 'archivio_gia_passato_alle_tabelle' using errcode = 'P0001';
  end if;
  select dati, versione into a, v from public.archivio_mvp where id = 1;
  if a is null then raise exception 'archivio_mvp_vuoto' using errcode = 'P0001'; end if;
  if coalesce(a->>'segreto', '') = '' then raise exception 'segreto_mancante' using errcode = 'P0001'; end if;

  -- Prima i figli, poi i genitori.
  delete from public.porte where true;
  delete from public.lotti where true;
  delete from public.utenti where true;
  delete from public.pr where true;
  delete from public.eventi where true;

  insert into public.eventi (
    id, numero, slug, nome, data, data_fine, location, comune, lat, lng, location_segreta, tipo_ingresso, descrizione, highlight,
    dress_code, lineup, info_arrivo, locandina_url, piantina_url, prezzo_lista, senza_telefono, prevendita_fino_alle, capienza,
    eta_minima, pubblicato, in_copertina, pr_abilitati, invio_link_pr, created_at, updated_at)
  select
    e.id, e.numero, e.slug, e.nome, e.data, e."dataFine", e.location, e.comune, e.lat, e.lng, coalesce(e."locationSegreta", false),
    coalesce(e."tipoIngresso", 'lista'), e.descrizione, e.highlight, e."dressCode",
    coalesce(array(select jsonb_array_elements_text(e.lineup)), '{}'::text[]),
    e."infoArrivo", e."locandinaUrl", e."piantinaUrl", coalesce(e."prezzoLista", 0), coalesce(e."senzaTelefono", false),
    e."prevenditaFinoAlle", e.capienza, coalesce(e."etaMinima", 18), coalesce(e.pubblicato, false), coalesce(e."inCopertina", false),
    case when jsonb_typeof(e."prAbilitati") = 'array' then array(select jsonb_array_elements_text(e."prAbilitati")::uuid) end,
    case when jsonb_typeof(e."invioLinkPr") = 'object' then e."invioLinkPr" end,
    coalesce(e."createdAt", now()), coalesce(e."updatedAt", now())
  from jsonb_to_recordset(coalesce(a->'eventi', '[]'::jsonb)) as e(
    id uuid, numero integer, slug text, nome text, data timestamptz, "dataFine" timestamptz, location text, comune text,
    lat double precision, lng double precision, "locationSegreta" boolean, "tipoIngresso" text, descrizione text, highlight text,
    "dressCode" text, lineup jsonb, "infoArrivo" text, "locandinaUrl" text, "piantinaUrl" text, "prezzoLista" numeric,
    "senzaTelefono" boolean, "prevenditaFinoAlle" timestamptz, capienza integer, "etaMinima" integer, pubblicato boolean,
    "inCopertina" boolean, "prAbilitati" jsonb, "invioLinkPr" jsonb, "createdAt" timestamptz, "updatedAt" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('eventi', n);

  insert into public.lotti (
    id, evento_id, nome, prezzo, quantita, data_inizio, data_fine, visibile_da_pr, ordine, categoria, conferma_categoria,
    uscita_giorni_prima, fine_ore_prima, dopo_precedente, pr_abilitati, automatico)
  select
    l.id, l."eventoId", l.nome, coalesce(l.prezzo, 0), l.quantita, l."dataInizio", l."dataFine", coalesce(l."visibileDaPr", true),
    coalesce(l.ordine, 0), l.categoria, coalesce(l."confermaCategoria", false), l."uscitaGiorniPrima", l."fineOrePrima",
    coalesce(l."dopoPrecedente", false),
    case when jsonb_typeof(l."prAbilitati") = 'array' then array(select jsonb_array_elements_text(l."prAbilitati")::uuid) end,
    coalesce(l.automatico, false)
  from jsonb_to_recordset(coalesce(a->'lotti', '[]'::jsonb)) as l(
    id uuid, "eventoId" uuid, nome text, prezzo numeric, quantita integer, "dataInizio" timestamptz, "dataFine" timestamptz,
    "visibileDaPr" boolean, ordine integer, categoria text, "confermaCategoria" boolean, "uscitaGiorniPrima" integer,
    "fineOrePrima" integer, "dopoPrecedente" boolean, "prAbilitati" jsonb, automatico boolean);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('lotti', n);

  insert into public.pr (id, handle, nome_display, stato, created_at)
  select p.id, p.handle, p."nomeDisplay", coalesce(p.stato, 'attivo'), coalesce(p."createdAt", now())
  from jsonb_to_recordset(coalesce(a->'pr', '[]'::jsonb)) as p(
    id uuid, handle text, "nomeDisplay" text, stato text, "createdAt" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('pr', n);

  insert into public.utenti (id, email, ruolo, pr_id, created_at)
  select u.id, u.email, u.ruolo, u."prId", coalesce(u."createdAt", now())
  from jsonb_to_recordset(coalesce(a->'utenti', '[]'::jsonb)) as u(
    id uuid, email text, ruolo text, "prId" uuid, "createdAt" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('utenti', n);

  insert into public.porte (evento_id, nome, ultimo_sync)
  select q."eventoId", q.nome, q."ultimoSync"
  from jsonb_to_recordset(coalesce(a->'porte', '[]'::jsonb)) as q(
    "eventoId" uuid, nome text, "ultimoSync" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('porte', n);

  -- Il segreto dei QR: identico alla riga. Non compare mai nel risultato.
  insert into public.impostazioni (chiave, valore) values ('segreto', a->>'segreto')
    on conflict (chiave) do update set valore = excluded.valore, updated_at = now();
  insert into public.impostazioni (chiave, valore) values ('importato_da_versione', v::text)
    on conflict (chiave) do update set valore = excluded.valore, updated_at = now();

  return esito || jsonb_build_object('versione', v);
end $$;

-- ---------------------------------------------------------------- verifica_importo()
-- Confronta la riga con le tabelle senza mostrare dati: conteggi, id mancanti o in più, impronta del segreto, versione.
-- Il confronto campo per campo lo fa il codice (tappa 4) e i test. Restituisce solo numeri, nomi di gruppi e ok/no.
create or replace function public.verifica_importo()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a           jsonb;
  v           bigint;
  gruppo      text;
  tabella     text;
  nella_riga  integer;
  nelle_tab   integer;
  mancanti    integer;
  in_piu      integer;
  conteggi    jsonb := '{}'::jsonb;
  differenze  text[] := '{}';
  segreto_ok  boolean;
  versione_ok boolean;
begin
  select dati, versione into a, v from public.archivio_mvp where id = 1;
  if a is null then return jsonb_build_object('ok', false, 'differenze', jsonb_build_array('archivio_mvp_vuoto')); end if;

  -- Gruppi con chiave `id`.
  foreach gruppo in array array['eventi', 'lotti', 'pr', 'utenti'] loop
    tabella := gruppo;
    execute format('select count(*) from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb))', gruppo) into nella_riga using a;
    execute format('select count(*) from public.%I', tabella) into nelle_tab;
    execute format('select count(*) from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb)) x where not exists (select 1 from public.%I t where t.id = (x->>''id'')::uuid)', gruppo, tabella)
      into mancanti using a;
    execute format('select count(*) from public.%I t where not exists (select 1 from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb)) x where (x->>''id'')::uuid = t.id)', tabella, gruppo)
      into in_piu using a;
    conteggi := conteggi || jsonb_build_object(gruppo, jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
    if nella_riga <> nelle_tab then differenze := differenze || (gruppo || ': conteggio diverso'); end if;
    if mancanti > 0 then differenze := differenze || (gruppo || ': ' || mancanti || ' mancanti nelle tabelle'); end if;
    if in_piu > 0 then differenze := differenze || (gruppo || ': ' || in_piu || ' in più nelle tabelle'); end if;
  end loop;

  -- Porte: chiave (serata, nome).
  select count(*) into nella_riga from jsonb_array_elements(coalesce(a->'porte', '[]'::jsonb));
  select count(*) into nelle_tab from public.porte;
  select count(*) into mancanti from jsonb_array_elements(coalesce(a->'porte', '[]'::jsonb)) x
    where not exists (select 1 from public.porte t where t.evento_id = (x->>'eventoId')::uuid and t.nome = x->>'nome');
  conteggi := conteggi || jsonb_build_object('porte', jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
  if nella_riga <> nelle_tab or mancanti > 0 then differenze := differenze || 'porte: diverse'::text; end if;

  -- Segreto: solo l'impronta (md5), mai il valore.
  select coalesce((select md5(valore) from public.impostazioni where chiave = 'segreto') = md5(a->>'segreto'), false) into segreto_ok;
  if not segreto_ok then differenze := differenze || 'segreto: impronta diversa'::text; end if;

  -- La riga non deve essere cambiata dopo la copia (qualcuno ha scritto: si rifà).
  select coalesce((select valore from public.impostazioni where chiave = 'importato_da_versione') = v::text, false) into versione_ok;
  if not versione_ok then differenze := differenze || 'versione: la riga è cambiata dopo la copia'::text; end if;

  return jsonb_build_object('ok', cardinality(differenze) = 0, 'conteggi', conteggi, 'differenze', to_jsonb(differenze),
    'segreto_ok', segreto_ok, 'versione_ok', versione_ok, 'versione', v);
end $$;

revoke execute on function public.importa_archivio() from public, anon, authenticated;
revoke execute on function public.verifica_importo() from public, anon, authenticated;
grant execute on function public.importa_archivio() to service_role;
grant execute on function public.verifica_importo() to service_role;

-- Fa vedere subito all'API le tabelle e le funzioni nuove.
notify pgrst, 'reload schema';
