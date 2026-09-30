-- Canale di arrivo delle iscrizioni e consegna alla crew dei soldi incassati dai PR.

alter table public.iscrizioni add column canale text not null default 'diretto'
  check (canale ~ '^[a-z0-9._-]{1,24}$');
create index iscrizioni_canale_idx on public.iscrizioni (evento_id, canale) where pr_id is null;

create table public.consegne (
  id             uuid primary key default gen_random_uuid(),
  pr_id          uuid not null references public.pr(id) on delete restrict,
  evento_id      uuid references public.eventi(id) on delete restrict,   -- null = tutte le serate
  importo        numeric(8,2) not null check (importo > 0),
  confermata_da  uuid not null references public.utenti(id),
  confermata_at  timestamptz not null default now(),
  annullata_at   timestamptz,
  annullata_da   uuid references public.utenti(id)
);
alter table public.iscrizioni add column consegna_id uuid references public.consegne(id) on delete set null;

alter table public.consegne enable row level security;
-- Staff e admin vedono le consegne; il PR vede le proprie. Si scrivono solo con le funzioni qui sotto.
create policy consegne_staff_admin on public.consegne for select to authenticated using (public.is_staff_o_admin());
create policy consegne_pr on public.consegne for select to authenticated using (pr_id = public.pr_corrente());

-- Conferma atomica: segna tutti i pagamenti al PR non ancora consegnati; si ferma se la cifra è cambiata.
create or replace function public.conferma_consegna(p_pr_id uuid, p_evento_id uuid, p_importo_atteso numeric)
returns public.consegne
language plpgsql security definer set search_path = ''
as $$
declare
  v_importo numeric;
  c public.consegne;
begin
  if not public.is_staff_o_admin() then raise exception 'non_autorizzato' using errcode = '42501'; end if;
  perform 1 from public.iscrizioni
    where pr_id = p_pr_id and metodo_pagamento = 'pr' and consegna_id is null
      and stato in ('in_lista', 'pagato', 'entrato') and (p_evento_id is null or evento_id = p_evento_id)
    for update;
  select coalesce(sum(importo), 0) into v_importo from public.iscrizioni
    where pr_id = p_pr_id and metodo_pagamento = 'pr' and consegna_id is null
      and stato in ('in_lista', 'pagato', 'entrato') and (p_evento_id is null or evento_id = p_evento_id);
  if v_importo = 0 then raise exception 'niente_da_ritirare' using errcode = 'P0001'; end if;
  if v_importo <> p_importo_atteso then raise exception 'cifra_cambiata:%', v_importo using errcode = 'P0001'; end if;
  insert into public.consegne (pr_id, evento_id, importo, confermata_da) values (p_pr_id, p_evento_id, v_importo, auth.uid()) returning * into c;
  update public.iscrizioni set consegna_id = c.id
    where pr_id = p_pr_id and metodo_pagamento = 'pr' and consegna_id is null
      and stato in ('in_lista', 'pagato', 'entrato') and (p_evento_id is null or evento_id = p_evento_id);
  return c;
end $$;
revoke execute on function public.conferma_consegna from public, anon;
grant execute on function public.conferma_consegna to authenticated;

create or replace function public.annulla_consegna(p_consegna_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'non_autorizzato' using errcode = '42501'; end if;
  update public.consegne set annullata_at = now(), annullata_da = auth.uid() where id = p_consegna_id and annullata_at is null;
  update public.iscrizioni set consegna_id = null where consegna_id = p_consegna_id;
end $$;
revoke execute on function public.annulla_consegna from public, anon;
grant execute on function public.annulla_consegna to authenticated;

-- Il PR non può togliere "pagato" a un cliente i cui soldi sono già stati consegnati.
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
  if r.consegna_id is not null then return r.stato; end if;
  if p_pagato and r.stato = 'in_lista' then
    update public.iscrizioni set stato = 'pagato', metodo_pagamento = 'pr', pagato_at = now() where id = r.id;
    return 'pagato';
  elsif not p_pagato and r.stato = 'pagato' and r.metodo_pagamento = 'pr' then
    update public.iscrizioni set stato = 'in_lista', metodo_pagamento = null, pagato_at = null where id = r.id;
    return 'in_lista';
  end if;
  return r.stato;
end $$;

-- Iscrizioni senza PR per canale (admin e staff).
create or replace function public.canali_serata(p_evento_id uuid default null)
returns table (canale text, in_lista bigint, nuovi_24h bigint, entrati bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_o_admin() then raise exception 'non_autorizzato' using errcode = '42501'; end if;
  return query
    select i.canale,
      count(*) filter (where i.stato in ('in_lista', 'pagato', 'entrato')),
      count(*) filter (where i.stato in ('in_lista', 'pagato', 'entrato') and i.created_at > now() - interval '24 hours'),
      count(*) filter (where i.stato = 'entrato')
    from public.iscrizioni i
    where i.pr_id is null and (p_evento_id is null or i.evento_id = p_evento_id)
    group by i.canale order by 2 desc;
end $$;
revoke execute on function public.canali_serata from public, anon;
grant execute on function public.canali_serata to authenticated;

-- "Da ritirare" esclude i soldi già consegnati.
create or replace function public.attivita_pr(p_evento_id uuid default null)
returns table (pr_id uuid, handle text, nome_display text, stato public.stato_pr,
               in_lista bigint, nuovi_24h bigint, entrati bigint, pagati_al_pr bigint,
               da_ritirare numeric, annullati bigint, ultima_attivita timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_o_admin() then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;
  return query
    select p.id, p.handle, p.nome_display, p.stato,
      count(i.id) filter (where i.stato in ('in_lista', 'pagato', 'entrato')),
      count(i.id) filter (where i.stato in ('in_lista', 'pagato', 'entrato') and i.created_at > now() - interval '24 hours'),
      count(i.id) filter (where i.stato = 'entrato'),
      count(i.id) filter (where i.metodo_pagamento = 'pr' and i.stato in ('in_lista', 'pagato', 'entrato')),
      coalesce(sum(i.importo) filter (where i.metodo_pagamento = 'pr' and i.consegna_id is null and i.stato in ('in_lista', 'pagato', 'entrato')), 0),
      count(i.id) filter (where i.stato in ('annullato', 'rimborsato')),
      greatest(max(i.created_at), max(i.pagato_at), max(i.ora_check_in), max(i.annullato_at))
    from public.pr p
    left join public.iscrizioni i on i.pr_id = p.id and (p_evento_id is null or i.evento_id = p_evento_id)
    group by p.id
    order by 5 desc, 3;
end $$;
