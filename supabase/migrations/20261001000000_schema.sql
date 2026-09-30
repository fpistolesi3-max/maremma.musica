-- Maremma Musica — schema MVP (opzione A: iscrizione in lista + pagamento alla porta)
--
-- Chi vede cosa (garantito dal database con RLS, non dall'interfaccia):
--   anonimo  → eventi pubblicati e i loro lotti. Le iscrizioni le crea solo il server.
--   pr       → le proprie iscrizioni (pr_id = PR collegato al suo utente), la propria riga pr,
--              i totali degli altri PR solo tramite classifica_pr() (mai i loro clienti).
--   staff    → le iscrizioni (per la porta) ma non la tabella pr; il nome della lista
--              arriva solo tramite porta_elenco().
--   admin    → tutto.

-- ---------------------------------------------------------------- tipi
create type public.ruolo_utente as enum ('admin', 'staff', 'pr');
create type public.tipo_ingresso as enum ('libero', 'lista', 'prevendita_online');
create type public.stato_pr as enum ('attivo', 'sospeso');
create type public.stato_iscrizione as enum ('in_lista', 'pagato', 'entrato', 'annullato', 'rimborsato');
create type public.metodo_pagamento as enum ('porta_contanti', 'porta_pos', 'pr');

-- ---------------------------------------------------------------- tabelle
create table public.eventi (
  id              uuid primary key default gen_random_uuid(),
  numero          integer unique,                       -- MM/025
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome            text not null,
  data            timestamptz not null,                 -- apertura porte
  data_fine       timestamptz,                          -- chiusura
  location        text,
  comune          text,
  lat             double precision,
  lng             double precision,
  location_segreta boolean not null default false,      -- il posto si vede solo 48 ore prima
  tipo_ingresso   public.tipo_ingresso not null default 'lista',
  descrizione     text,
  highlight       text,                                 -- es. "Premio 500 € alla maschera migliore"
  dress_code      text,
  lineup          text[] not null default '{}',
  info_arrivo     text,
  locandina_url   text,
  prezzo_lista    numeric(8,2) not null default 0 check (prezzo_lista >= 0),
  eta_minima      integer not null default 18 check (eta_minima between 0 and 99),
  pubblicato      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.lotti (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventi(id) on delete cascade,
  nome            text not null,
  prezzo          numeric(8,2) not null default 0 check (prezzo >= 0),
  quantita        integer check (quantita is null or quantita >= 0),   -- null = senza limite
  data_inizio     timestamptz,
  data_fine       timestamptz,
  visibile_da_pr  boolean not null default true,
  ordine          integer not null default 0,
  created_at      timestamptz not null default now()
);
create index lotti_evento_idx on public.lotti (evento_id, ordine);

create table public.pr (
  id              uuid primary key default gen_random_uuid(),
  handle          text not null unique check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome_display    text not null,
  stato           public.stato_pr not null default 'attivo',
  created_at      timestamptz not null default now()
);

create table public.iscrizioni (
  id                  uuid primary key default gen_random_uuid(),
  evento_id           uuid not null references public.eventi(id) on delete restrict,
  lotto_id            uuid references public.lotti(id) on delete set null,
  pr_id               uuid references public.pr(id) on delete set null,   -- null = Lista Maremma Musica
  nome                text not null check (length(btrim(nome)) between 1 and 80),
  cognome             text not null check (length(btrim(cognome)) between 1 and 80),
  data_nascita        date not null,
  email               text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_qr            text not null unique,              -- firmato HMAC lato server, mai progressivo
  codice              text not null unique,              -- 8 caratteri da dettare alla porta
  stato               public.stato_iscrizione not null default 'in_lista',
  metodo_pagamento    public.metodo_pagamento,
  importo             numeric(8,2) not null default 0,   -- prezzo del lotto al momento dell'iscrizione
  pagato_at           timestamptz,
  ora_check_in        timestamptz,
  porta               text,
  consenso_privacy_at timestamptz not null,
  consenso_marketing  boolean not null default false,
  annullato_at        timestamptz,
  created_at          timestamptz not null default now()
);
create index iscrizioni_evento_idx on public.iscrizioni (evento_id, created_at desc);
create index iscrizioni_pr_idx on public.iscrizioni (pr_id, evento_id);
create index iscrizioni_email_idx on public.iscrizioni (lower(email));
-- Un solo biglietto per (cognome, data di nascita, evento), esclusi annullati e rimborsati.
create unique index iscrizioni_unica_persona
  on public.iscrizioni (evento_id, lower(btrim(cognome)), data_nascita)
  where stato not in ('annullato', 'rimborsato');

create table public.utenti (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  ruolo       public.ruolo_utente not null,
  pr_id       uuid unique references public.pr(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint utenti_pr_coerente check ((ruolo = 'pr') = (pr_id is not null))
);

-- ---------------------------------------------------------------- helper per le policy
create or replace function public.ruolo_corrente()
returns public.ruolo_utente
language sql stable security definer set search_path = ''
as $$ select ruolo from public.utenti where id = auth.uid() $$;

create or replace function public.pr_corrente()
returns uuid
language sql stable security definer set search_path = ''
as $$ select pr_id from public.utenti where id = auth.uid() and ruolo = 'pr' $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select ruolo = 'admin' from public.utenti where id = auth.uid()), false) $$;

create or replace function public.is_staff_o_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select ruolo in ('admin', 'staff') from public.utenti where id = auth.uid()), false) $$;

create or replace function public.tocca_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger eventi_updated_at before update on public.eventi
  for each row execute function public.tocca_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.eventi enable row level security;
alter table public.lotti enable row level security;
alter table public.pr enable row level security;
alter table public.iscrizioni enable row level security;
alter table public.utenti enable row level security;

-- eventi: pubblico legge i pubblicati, admin tutto
create policy eventi_lettura_pubblica on public.eventi for select
  using (pubblicato or public.is_staff_o_admin());
create policy eventi_admin on public.eventi for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- lotti: visibili se l'evento è pubblicato
create policy lotti_lettura_pubblica on public.lotti for select
  using (exists (select 1 from public.eventi e where e.id = evento_id and (e.pubblicato or public.is_admin())));
create policy lotti_admin on public.lotti for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- pr: il PR vede solo sé stesso, admin tutto. Staff e anonimi niente.
create policy pr_se_stesso on public.pr for select to authenticated
  using (id = public.pr_corrente());
create policy pr_admin on public.pr for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- iscrizioni: PR solo le proprie, staff tutte in lettura, admin tutto.
-- Nessuna insert per anon/authenticated: le crea il server dopo la validazione.
create policy iscrizioni_pr on public.iscrizioni for select to authenticated
  using (pr_id is not null and pr_id = public.pr_corrente());
create policy iscrizioni_staff on public.iscrizioni for select to authenticated
  using (public.ruolo_corrente() = 'staff');
create policy iscrizioni_admin on public.iscrizioni for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- utenti: ognuno la propria riga, admin tutto
create policy utenti_se_stesso on public.utenti for select to authenticated
  using (id = auth.uid());
create policy utenti_admin on public.utenti for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- funzioni
-- Inserisce un'iscrizione controllando i posti del lotto in modo atomico.
-- Chiamata solo dal server (service role) dopo validazione di età, PR e consensi.
create or replace function public.inserisci_iscrizione(
  p_id uuid, p_evento_id uuid, p_lotto_id uuid, p_pr_id uuid,
  p_nome text, p_cognome text, p_data_nascita date, p_email text,
  p_token_qr text, p_codice text, p_importo numeric, p_consenso_marketing boolean
) returns public.iscrizioni
language plpgsql security definer set search_path = ''
as $$
declare
  v_quantita integer;
  v_usati integer;
  r public.iscrizioni;
begin
  if p_lotto_id is not null then
    select quantita into v_quantita from public.lotti where id = p_lotto_id for update;
    if v_quantita is not null then
      select count(*) into v_usati from public.iscrizioni
        where lotto_id = p_lotto_id and stato not in ('annullato', 'rimborsato');
      if v_usati >= v_quantita then
        raise exception 'lotto_esaurito' using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.iscrizioni (id, evento_id, lotto_id, pr_id, nome, cognome, data_nascita, email,
    token_qr, codice, importo, consenso_privacy_at, consenso_marketing)
  values (p_id, p_evento_id, p_lotto_id, p_pr_id, btrim(p_nome), btrim(p_cognome), p_data_nascita,
    lower(btrim(p_email)), p_token_qr, p_codice, p_importo, now(), p_consenso_marketing)
  returning * into r;
  return r;
end $$;
revoke execute on function public.inserisci_iscrizione from public, anon, authenticated;

-- Iscrizioni usate per lotto (per mostrare "lista piena" senza esporre le righe).
create or replace function public.posti_usati(p_evento_id uuid)
returns table (lotto_id uuid, usati bigint)
language sql stable security definer set search_path = ''
as $$
  select lotto_id, count(*) from public.iscrizioni
  where evento_id = p_evento_id and stato not in ('annullato', 'rimborsato') and lotto_id is not null
  group by lotto_id
$$;

-- Classifica PR di una serata: solo totali. Il PR vede la sua riga marcata, mai i clienti altrui.
create or replace function public.classifica_pr(p_evento_id uuid)
returns table (pr_id uuid, nome_display text, in_lista bigint, entrati bigint, incassato numeric, sono_io boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ruolo public.ruolo_utente := public.ruolo_corrente();
  v_me uuid := public.pr_corrente();
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'pr') then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;
  return query
    select i.pr_id,
           coalesce(p.nome_display, 'Maremma Musica'),
           count(*) filter (where i.stato not in ('annullato', 'rimborsato')),
           count(*) filter (where i.stato = 'entrato'),
           case when v_ruolo = 'admin'
             then coalesce(sum(i.importo) filter (where i.metodo_pagamento is not null and i.stato not in ('annullato', 'rimborsato')), 0)
             else null end,
           (i.pr_id is not null and i.pr_id = v_me)
    from public.iscrizioni i
    left join public.pr p on p.id = i.pr_id
    where i.evento_id = p_evento_id
    group by i.pr_id, p.nome_display
    order by 3 desc, 2;
end $$;
revoke execute on function public.classifica_pr from public, anon;
grant execute on function public.classifica_pr to authenticated;

-- Elenco per la porta (staff/admin): i dati minimi per il controllo offline, con il solo nome della lista.
create or replace function public.porta_elenco(p_evento_id uuid)
returns table (id uuid, token_qr text, codice text, nome text, cognome text, data_nascita date,
               stato public.stato_iscrizione, importo numeric, ora_check_in timestamptz, porta text, lista text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_o_admin() then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;
  return query
    select i.id, i.token_qr, i.codice, i.nome, i.cognome, i.data_nascita, i.stato, i.importo,
           i.ora_check_in, i.porta, coalesce(p.nome_display, 'Maremma Musica')
    from public.iscrizioni i left join public.pr p on p.id = i.pr_id
    where i.evento_id = p_evento_id;
end $$;
revoke execute on function public.porta_elenco from public, anon;
grant execute on function public.porta_elenco to authenticated;

-- Check-in alla porta. p_chiave = token del QR, codice a 8 caratteri o id (ricerca manuale).
-- Idempotente: il secondo passaggio risponde 'gia_entrato' con l'orario del primo.
create or replace function public.porta_check_in(
  p_evento_id uuid, p_chiave text, p_incassa boolean default false,
  p_metodo public.metodo_pagamento default 'porta_contanti', p_porta text default null,
  p_ora timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.iscrizioni;
  v_lista text;
  v_ora timestamptz := least(coalesce(p_ora, now()), now());
begin
  if not public.is_staff_o_admin() then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;

  select * into r from public.iscrizioni
   where evento_id = p_evento_id
     and (token_qr = p_chiave or codice = upper(replace(p_chiave, '-', ''))
          or id::text = p_chiave)
   for update;
  if not found then
    return jsonb_build_object('esito', 'non_valido');
  end if;

  select coalesce(p.nome_display, 'Maremma Musica') into v_lista
    from (select 1) x left join public.pr p on p.id = r.pr_id;

  if r.stato in ('annullato', 'rimborsato') then
    return jsonb_build_object('esito', 'annullato', 'id', r.id, 'nome', r.nome, 'cognome', r.cognome, 'lista', v_lista);
  end if;
  if r.stato = 'entrato' then
    return jsonb_build_object('esito', 'gia_entrato', 'id', r.id, 'nome', r.nome, 'cognome', r.cognome,
      'lista', v_lista, 'ora_check_in', r.ora_check_in, 'porta', r.porta);
  end if;
  if r.stato = 'in_lista' and r.importo > 0 and not p_incassa then
    return jsonb_build_object('esito', 'da_incassare', 'id', r.id, 'nome', r.nome, 'cognome', r.cognome,
      'lista', v_lista, 'importo', r.importo, 'data_nascita', r.data_nascita);
  end if;

  update public.iscrizioni set
    stato = 'entrato',
    ora_check_in = v_ora,
    porta = p_porta,
    metodo_pagamento = case when r.stato = 'in_lista' and r.importo > 0 then p_metodo else metodo_pagamento end,
    pagato_at = case when r.stato = 'in_lista' and r.importo > 0 then v_ora else pagato_at end
  where id = r.id;

  return jsonb_build_object('esito', 'entrato', 'id', r.id, 'nome', r.nome, 'cognome', r.cognome,
    'lista', v_lista, 'ora_check_in', v_ora, 'incassato', case when r.stato = 'in_lista' then r.importo else 0 end);
end $$;
revoke execute on function public.porta_check_in from public, anon;
grant execute on function public.porta_check_in to authenticated;

-- Il PR conferma (o toglie) un pagamento ricevuto da un suo cliente prima della serata.
create or replace function public.pr_segna_pagato(p_iscrizione_id uuid, p_pagato boolean)
returns public.stato_iscrizione
language plpgsql security definer set search_path = ''
as $$
declare
  v_pr uuid := public.pr_corrente();
  r public.iscrizioni;
begin
  select * into r from public.iscrizioni where id = p_iscrizione_id for update;
  if not found or v_pr is null or r.pr_id is distinct from v_pr then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;
  if p_pagato and r.stato = 'in_lista' then
    update public.iscrizioni set stato = 'pagato', metodo_pagamento = 'pr', pagato_at = now() where id = r.id;
    return 'pagato';
  elsif not p_pagato and r.stato = 'pagato' and r.metodo_pagamento = 'pr' then
    update public.iscrizioni set stato = 'in_lista', metodo_pagamento = null, pagato_at = null where id = r.id;
    return 'in_lista';
  end if;
  return r.stato;
end $$;
revoke execute on function public.pr_segna_pagato from public, anon;
grant execute on function public.pr_segna_pagato to authenticated;

-- ---------------------------------------------------------------- realtime (admin live, porta)
alter publication supabase_realtime add table public.iscrizioni;
