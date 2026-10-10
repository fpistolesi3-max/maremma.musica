-- Tavoli di una serata: si prendono con una spesa minima (non a persona).
-- Per ora li gestisce solo l'admin; la richiesta da cliente e PR arriverà con una funzione dedicata.

create type public.stato_tavolo as enum ('libero', 'riservato', 'confermato', 'non_in_vendita');

create table public.tavoli (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventi(id) on delete cascade,
  nome            text not null check (length(btrim(nome)) between 1 and 40),   -- T4, Privé 2…
  zona            text,                                                           -- Pista, Privé, Terrazza…
  posti           integer check (posti is null or posti between 1 and 99),
  spesa_minima    numeric(8,2) not null default 0 check (spesa_minima >= 0),
  stato           public.stato_tavolo not null default 'libero',
  nota            text,                                                           -- solo admin: es. a chi è riservato
  visibile_da_pr  boolean not null default true,
  ordine          integer not null default 0,
  created_at      timestamptz not null default now()
);
create unique index tavoli_nome_per_evento on public.tavoli (evento_id, lower(btrim(nome)));
create index tavoli_evento_idx on public.tavoli (evento_id, ordine);

-- Solo admin: la tabella contiene la nota riservata, quindi niente lettura pubblica diretta.
alter table public.tavoli enable row level security;
create policy tavoli_admin on public.tavoli for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
