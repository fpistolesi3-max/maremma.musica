-- Gestionale attività PR: visibile ad admin e staff porta, mai ai PR.
-- Lo staff vede i numeri per PR (non le email: stanno in utenti, che non può leggere).
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
      coalesce(sum(i.importo) filter (where i.metodo_pagamento = 'pr' and i.stato in ('in_lista', 'pagato', 'entrato')), 0),
      count(i.id) filter (where i.stato in ('annullato', 'rimborsato')),
      greatest(max(i.created_at), max(i.pagato_at), max(i.ora_check_in), max(i.annullato_at))
    from public.pr p
    left join public.iscrizioni i on i.pr_id = p.id and (p_evento_id is null or i.evento_id = p_evento_id)
    group by p.id
    order by 5 desc, 3;
end $$;
revoke execute on function public.attivita_pr from public, anon;
grant execute on function public.attivita_pr to authenticated;
