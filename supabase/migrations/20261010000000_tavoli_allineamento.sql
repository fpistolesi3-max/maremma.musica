-- Tavoli allineati con lib/dati (archivio locale): promemoria, pagina pubblica, porta, decadenza e permessi del server.
-- Stesse regole di lib/dati/tavoli.ts e lib/dati/porta.ts: il visitatore non vede nota né chi ha preso il tavolo,
-- lo staff alla porta vede il gruppo ma non email e telefono, solo il server fa decadere le prenotazioni.

-- Promemoria del termine già mandato: parte una volta sola anche se il controllo gira più volte.
alter table public.prenotazioni_tavoli add column promemoria_at timestamptz;

-- Il server (service role) scrive prenotazioni e ingressi: sui progetti nuovi i permessi automatici possono mancare.
grant all on table public.tavoli, public.prenotazioni_tavoli, public.ingressi_tavoli to service_role;

-- Pagina /tavoli/[slug]: i tavoli in vendita di una serata pubblicata e non passata, senza nota.
-- p_pr_id: solo quelli che quel PR può proporre (il PR con la sessione aperta vede solo i suoi).
create or replace function public.tavoli_pubblici(p_slug text, p_pr_id uuid default null)
returns table (id uuid, nome text, zona text, posti integer, spesa_minima numeric, x numeric, y numeric, libero boolean)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.nome, t.zona, t.posti, t.spesa_minima, t.x, t.y, t.stato = 'libero'
    from public.tavoli t join public.eventi e on e.id = t.evento_id
   where e.slug = p_slug and e.pubblicato
     and coalesce(e.data_fine, e.data + interval '8 hours') >= now()
     and t.stato <> 'non_in_vendita'
     and (p_pr_id is null or (t.visibile_da_pr and (t.pr_abilitati is null or p_pr_id = any (t.pr_abilitati))))
   order by t.ordine;
$$;
grant execute on function public.tavoli_pubblici to anon, authenticated;

-- Elenco della porta: una voce per tavolo prenotato, con quanti sono già entrati. Niente email né telefono.
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
           p.stato in ('annullata', 'scaduta') or (p.stato = 'in_attesa' and p.scade <= now()),
           p.spesa_minima, coalesce(r.nome_display, 'Maremma Musica'), u.ora, u.porta
      from public.prenotazioni_tavoli p
      join public.tavoli t on t.id = p.tavolo_id
      left join public.pr r on r.id = p.pr_id
      left join lateral (select i.ora, i.porta from public.ingressi_tavoli i where i.prenotazione_id = p.id order by i.ora desc limit 1) u on true
     where p.evento_id = p_evento_id;
end $$;
revoke execute on function public.porta_tavoli from public, anon;
grant execute on function public.porta_tavoli to authenticated;

-- Un passaggio alla porta con il QR del tavolo: entra una persona finché ci sono posti, solo se pagato.
-- p_rif è l'id del movimento creato dal telefono: la stessa sincronizzazione ripetuta non conta due volte.
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
  if r.stato in ('annullata', 'scaduta') or (r.stato = 'in_attesa' and r.scade <= now()) then
    return jsonb_build_object('esito', 'annullato', 'id', r.id);
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
revoke execute on function public.porta_ingresso_tavolo from public, anon;
grant execute on function public.porta_ingresso_tavolo to authenticated;

-- Termine passato senza pagamento: la prenotazione decade e il tavolo torna libero (cron e letture del server).
-- Restituisce quanti tavoli sono tornati liberi.
create or replace function public.tavoli_fai_decadere()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  n integer;
begin
  with scadute as (
    update public.prenotazioni_tavoli set stato = 'scaduta', chiusa_at = now()
     where stato = 'in_attesa' and scade <= now()
    returning tavolo_id
  )
  update public.tavoli t set stato = 'libero'
    from scadute s where t.id = s.tavolo_id and t.stato = 'riservato';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.tavoli_fai_decadere from public, anon, authenticated;
grant execute on function public.tavoli_fai_decadere to service_role;

-- Un tavolo con prenotazioni (anche chiuse) non si elimina: lo storico e il CSV le tengono legate al tavolo
-- (tavolo_id è "on delete restrict"). Per toglierlo dalla vendita si mette "non in vendita", come fa lib/dati/admin.ts.
