-- Pagamento dei tavoli: come è arrivato l'anticipo, chi l'ha segnato, rimborso e avviso al cliente quando si chiude.
-- Stesse regole di lib/dati/tavoli.ts (confermaPrenotazione, annullaPrenotazione, chiuseDaAvvisare).

-- rimborsata = era pagata, annullata e soldi restituiti; annullata resta "chiusa senza rimborso".
alter type public.stato_prenotazione add value if not exists 'rimborsata';

create type public.metodo_tavolo as enum ('bonifico', 'satispay', 'contanti', 'pos');

alter table public.prenotazioni_tavoli
  add column metodo_pagamento   public.metodo_tavolo,
  add column pagato_da          text,          -- email di chi ha segnato il pagamento
  add column chiusa_da          text,          -- email di chi l'ha annullata o rimborsata; null = scaduta da sola
  add column avviso_chiusura_at timestamptz;   -- email "prenotazione chiusa" già mandata al cliente
-- Il metodo c'è solo su una prenotazione pagata (quelle pagate prima di questa migrazione restano senza).
alter table public.prenotazioni_tavoli add constraint prenotazioni_pagamento_coerente
  check (metodo_pagamento is null or pagato_at is not null);

-- Alla porta una rimborsata vale come chiusa, come una annullata o scaduta: qui sotto si confronta con gli stati
-- ancora attivi, così le funzioni non usano il valore nuovo nella stessa transazione in cui nasce.
create or replace function public.porta_tavoli(p_evento_id uuid)
returns table (id uuid, token_qr text, codice text, nome text, cognome text, tavolo text, persone integer,
               entrati integer, pagato boolean, chiusa boolean, spesa_minima numeric, lista text,
               ora_ultimo timestamptz, porta_ultima text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_o_admin() then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;
  return query
    select p.id, p.token_qr, p.codice, p.nome, p.cognome, t.nome, p.persone,
           (select count(*)::integer from public.ingressi_tavoli i where i.prenotazione_id = p.id),
           p.stato = 'confermata',
           p.stato not in ('in_attesa', 'confermata') or (p.stato = 'in_attesa' and p.scade <= now()),
           p.spesa_minima, coalesce(r.nome_display, 'Maremma Musica'), u.ora, u.porta
      from public.prenotazioni_tavoli p
      join public.tavoli t on t.id = p.tavolo_id
      left join public.pr r on r.id = p.pr_id
      left join lateral (select i.ora, i.porta from public.ingressi_tavoli i where i.prenotazione_id = p.id order by i.ora desc limit 1) u on true
     where p.evento_id = p_evento_id;
end $$;

create or replace function public.porta_ingresso_tavolo(
  p_evento_id uuid, p_chiave text, p_rif text, p_porta text, p_ora timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.prenotazioni_tavoli;
  v_entrati integer;
  v_ora timestamptz := least(coalesce(p_ora, now()), now());
begin
  if not public.is_staff_o_admin() then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;

  select * into r from public.prenotazioni_tavoli
   where evento_id = p_evento_id
     and (token_qr = p_chiave or codice = upper(replace(p_chiave, '-', '')) or id::text = p_chiave)
   for update;
  if not found then
    return jsonb_build_object('esito', 'non_valido');
  end if;
  if r.stato not in ('in_attesa', 'confermata') or (r.stato = 'in_attesa' and r.scade <= now()) then
    return jsonb_build_object('esito', 'annullato', 'id', r.id, 'stato', r.stato);
  end if;
  if exists (select 1 from public.ingressi_tavoli where prenotazione_id = r.id and rif = p_rif) then
    return jsonb_build_object('esito', 'entrato', 'id', r.id, 'ripetuto', true);
  end if;
  if r.stato <> 'confermata' then
    return jsonb_build_object('esito', 'non_valido', 'motivo', 'Tavolo non ancora pagato', 'id', r.id);
  end if;

  select count(*) into v_entrati from public.ingressi_tavoli where prenotazione_id = r.id;
  if v_entrati >= r.persone then
    return jsonb_build_object('esito', 'gia_entrato', 'id', r.id, 'entrati', v_entrati, 'persone', r.persone);
  end if;

  insert into public.ingressi_tavoli (prenotazione_id, rif, ora, porta) values (r.id, p_rif, v_ora, coalesce(p_porta, 'P1'));
  return jsonb_build_object('esito', 'entrato', 'id', r.id, 'entrati', v_entrati + 1, 'persone', r.persone, 'ora', v_ora);
end $$;
