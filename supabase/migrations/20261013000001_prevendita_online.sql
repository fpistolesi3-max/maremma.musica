-- Prevendita in lista pagata solo online (Stripe Checkout), come i tavoli (20261012). Stesse regole di
-- lib/dati/prevendita.ts, lib/dati/pubblico.ts (creaIscrizione) e lib/dati/porta.ts.
-- - L'iscrizione a pagamento nasce 'in_attesa' con il posto del lotto tenuto fino a `scade`; vale ('pagato') solo
--   a pagamento ricevuto. Le scritture le fa solo il server (service role): il webhook di Stripe arriva al server.
-- - Il PR non incassa più e non consegna soldi: via pr_segna_pagato e le consegne (la tabella resta come storico).
-- - Alla porta chi è in lista non si incassa; l'ingresso in cassa resta, attivabile per serata (eventi.cassa_attiva).

-- ---------------------------------------------------------------- colonne
alter table public.eventi
  add column cassa_attiva boolean not null default true;  -- false = ingresso solo in prevendita, niente cassa

alter table public.iscrizioni
  add column scade              timestamptz,                    -- in attesa: termine per pagare
  add column pagamento_online   boolean not null default false, -- prevendita da pagare (o pagata) sul sito
  add column pagamento_sessione text,                           -- ultima pagina di pagamento aperta
  add column pagamento_id       text,                           -- pagamento riuscito: serve per il rimborso
  add column da_rimborsare      boolean not null default false; -- pagata quando non valeva più

alter table public.iscrizioni add constraint iscrizioni_attesa_con_termine
  check (stato <> 'in_attesa' or scade is not null);

-- Lo stesso pagamento non conferma due iscrizioni (il webhook può arrivare più volte).
create unique index iscrizioni_pagamento_id on public.iscrizioni (pagamento_id) where pagamento_id is not null;
-- Per l'admin: i pagamenti da restituire saltano all'occhio.
create index iscrizioni_da_rimborsare on public.iscrizioni (evento_id) where da_rimborsare;
-- Per il controllo giornaliero dei pagamenti rimasti senza esito.
create index iscrizioni_in_attesa on public.iscrizioni (scade) where stato = 'in_attesa';

-- ---------------------------------------------------------------- dati esistenti
-- Prima della regola nuova esistevano solo dati di esempio e di prova (26.10.2026): chi era in lista senza aver
-- pagato, o aveva pagato al PR, diventa pagato online con un pagamento di prova (come lib/dati/archivio.ts).
update public.iscrizioni
   set stato = case when stato = 'in_lista' then 'pagato'::public.stato_iscrizione else stato end,
       metodo_pagamento = 'online', pagato_at = coalesce(pagato_at, created_at),
       pagamento_online = true, pagamento_id = 'prova_import_' || id
 where origine = 'lista'
   and ((stato = 'in_lista' and importo > 0) or metodo_pagamento = 'pr');

-- ---------------------------------------------------------------- policy
-- Il PR vede i suoi clienti solo quando hanno pagato: chi ha chiesto la prevendita senza pagarla non è in lista.
drop policy if exists iscrizioni_pr on public.iscrizioni;
create policy iscrizioni_pr on public.iscrizioni for select to authenticated
  using (pr_id is not null and pr_id = public.pr_corrente() and stato not in ('in_attesa', 'scaduta'));
-- Lo staff della porta non ha bisogno delle prevendite scadute senza pagare.
drop policy if exists iscrizioni_staff on public.iscrizioni;
create policy iscrizioni_staff on public.iscrizioni for select to authenticated
  using (public.ruolo_corrente() = 'staff' and stato <> 'scaduta');

-- ---------------------------------------------------------------- funzioni
-- Tiene un posto del lotto: valida, oppure in attesa di pagamento e ancora nel termine (regole.ts: tienePosto).
create or replace function public.tiene_posto(r public.iscrizioni)
returns boolean language sql stable set search_path = ''
as $$ select r.stato in ('in_lista', 'pagato', 'entrato') or (r.stato = 'in_attesa' and r.scade > now()) $$;

-- Iscrizione con i posti controllati in modo atomico. Con p_scade nasce in attesa di pagamento online,
-- senza (serata gratis) vale subito.
drop function if exists public.inserisci_iscrizione(uuid, uuid, uuid, uuid, text, text, date, text, text, text, numeric, boolean);
create function public.inserisci_iscrizione(
  p_id uuid, p_evento_id uuid, p_lotto_id uuid, p_pr_id uuid,
  p_nome text, p_cognome text, p_data_nascita date, p_email text,
  p_token_qr text, p_codice text, p_importo numeric, p_consenso_marketing boolean, p_scade timestamptz
) returns public.iscrizioni
language plpgsql security definer set search_path = ''
as $$
declare
  v_quantita integer;
  v_usati integer;
  r public.iscrizioni;
begin
  if p_importo > 0 and p_scade is null then raise exception 'serve_pagamento_online' using errcode = 'P0001'; end if;
  if p_lotto_id is not null then
    select quantita into v_quantita from public.lotti where id = p_lotto_id for update;
    if v_quantita is not null then
      select count(*) into v_usati from public.iscrizioni i where i.lotto_id = p_lotto_id and public.tiene_posto(i);
      if v_usati >= v_quantita then raise exception 'lotto_esaurito' using errcode = 'P0001'; end if;
    end if;
  end if;

  insert into public.iscrizioni (id, evento_id, lotto_id, pr_id, nome, cognome, data_nascita, email,
    token_qr, codice, importo, consenso_privacy_at, consenso_marketing, stato, scade, pagamento_online)
  values (p_id, p_evento_id, p_lotto_id, p_pr_id, btrim(p_nome), btrim(p_cognome), p_data_nascita,
    lower(btrim(p_email)), p_token_qr, p_codice, p_importo, now(), p_consenso_marketing,
    case when p_scade is null then 'in_lista' else 'in_attesa' end, p_scade, p_scade is not null)
  returning * into r;
  return r;
end $$;
revoke execute on function public.inserisci_iscrizione from public, anon, authenticated;

create or replace function public.posti_usati(p_evento_id uuid)
returns table (lotto_id uuid, usati bigint)
language sql stable security definer set search_path = ''
as $$
  select i.lotto_id, count(*) from public.iscrizioni i
  where i.evento_id = p_evento_id and public.tiene_posto(i) and i.lotto_id is not null
  group by i.lotto_id
$$;

-- Pagamento online riuscito (webhook, ritorno del cliente, controllo giornaliero). Idempotente sul pagamento.
-- Vale se aspettava ancora il pagamento (o è scaduta da poco), la serata non è iniziata, nel lotto c'è posto e la
-- persona non ha già un altro QR valido (regole.ts: pagamentoIscrizioneValido); altrimenti va rimborsato.
-- Restituisce 'confermata', 'gia', 'da_rimborsare' o 'sconosciuta'. Solo service role.
create or replace function public.conferma_pagamento_iscrizione(p_id uuid, p_pagamento text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  r public.iscrizioni;
  e public.eventi;
  v_quantita integer;
  v_altri integer;
  v_doppione boolean;
begin
  select * into r from public.iscrizioni where id = p_id for update;
  if not found then return 'sconosciuta'; end if;
  if r.pagamento_id = p_pagamento then return 'gia'; end if;
  select * into e from public.eventi where id = r.evento_id;
  if r.lotto_id is not null then
    select quantita into v_quantita from public.lotti where id = r.lotto_id for update;
    select count(*) into v_altri from public.iscrizioni i where i.lotto_id = r.lotto_id and i.id <> r.id and public.tiene_posto(i);
  end if;
  select exists (select 1 from public.iscrizioni i where i.evento_id = r.evento_id and i.id <> r.id
    and i.stato in ('in_lista', 'pagato', 'entrato') and i.data_nascita = r.data_nascita
    and lower(i.cognome) = lower(r.cognome)) into v_doppione;

  update public.iscrizioni set pagato_at = now(), metodo_pagamento = 'online', pagamento_id = p_pagamento where id = r.id;
  if r.stato not in ('in_attesa', 'scaduta') or e.data <= now()
     or (v_quantita is not null and v_altri >= v_quantita) or v_doppione then
    update public.iscrizioni set da_rimborsare = true where id = r.id;
    return 'da_rimborsare';
  end if;
  update public.iscrizioni set stato = 'pagato', scade = null where id = r.id;
  return 'confermata';
end $$;
revoke execute on function public.conferma_pagamento_iscrizione from public, anon, authenticated;

-- Classifica PR: contano solo le prevendite pagate (o gratis) e gli entrati; l'admin vede l'incassato online.
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
           count(*) filter (where i.stato in ('in_lista', 'pagato', 'entrato')),
           count(*) filter (where i.stato = 'entrato'),
           case when v_ruolo = 'admin'
             then coalesce(sum(i.importo) filter (where i.metodo_pagamento = 'online' and i.stato in ('in_lista', 'pagato', 'entrato')), 0)
             else null end,
           (i.pr_id is not null and i.pr_id = v_me)
    from public.iscrizioni i
    left join public.pr p on p.id = i.pr_id
    where i.evento_id = p_evento_id and i.origine = 'lista' and i.stato not in ('in_attesa', 'scaduta')
    group by i.pr_id, p.nome_display
    order by 3 desc, 2;
end $$;

-- Elenco per la porta: senza le prevendite scadute; quelle in attesa ci sono (la porta dice "Non pagato").
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
    where i.evento_id = p_evento_id and i.stato <> 'scaduta' and not (i.stato = 'in_attesa' and i.scade <= now());
end $$;

-- Check-in alla porta: chi è in lista ha già pagato online, alla porta non si incassa niente.
-- La prevendita non pagata non entra ('non_pagato'). Idempotente: il secondo passaggio dà 'gia_entrato'.
drop function if exists public.porta_check_in(uuid, text, boolean, public.metodo_pagamento, text, timestamptz);
create function public.porta_check_in(
  p_evento_id uuid, p_chiave text, p_porta text default null, p_ora timestamptz default null
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
     and (token_qr = p_chiave or codice = upper(replace(p_chiave, '-', '')) or id::text = p_chiave)
   for update;
  if not found or r.stato = 'scaduta' then
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
  if r.stato = 'in_attesa' then
    return jsonb_build_object('esito', 'non_pagato', 'id', r.id, 'nome', r.nome, 'cognome', r.cognome,
      'lista', v_lista, 'importo', r.importo, 'data_nascita', r.data_nascita);
  end if;

  update public.iscrizioni set stato = 'entrato', ora_check_in = v_ora, porta = p_porta where id = r.id;
  return jsonb_build_object('esito', 'entrato', 'id', r.id, 'nome', r.nome, 'cognome', r.cognome,
    'lista', v_lista, 'ora_check_in', v_ora, 'incassato', 0);
end $$;
revoke execute on function public.porta_check_in from public, anon;
grant execute on function public.porta_check_in to authenticated;

-- Attività dei PR: niente più soldi in mano ai PR, solo quanto è stato pagato online. Le non pagate non contano.
drop function if exists public.attivita_pr(uuid);
create function public.attivita_pr(p_evento_id uuid default null)
returns table (pr_id uuid, handle text, nome_display text, stato public.stato_pr,
               in_lista bigint, nuovi_24h bigint, entrati bigint, incassato_online numeric,
               annullati bigint, ultima_attivita timestamptz)
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
      coalesce(sum(i.importo) filter (where i.metodo_pagamento = 'online' and i.stato in ('in_lista', 'pagato', 'entrato')), 0),
      count(i.id) filter (where i.stato in ('annullato', 'rimborsato')),
      greatest(max(i.created_at), max(i.pagato_at), max(i.ora_check_in), max(i.annullato_at))
    from public.pr p
    left join public.iscrizioni i on i.pr_id = p.id and (p_evento_id is null or i.evento_id = p_evento_id)
      and i.stato not in ('in_attesa', 'scaduta')
    group by p.id
    order by 5 desc, 3;
end $$;
revoke execute on function public.attivita_pr from public, anon;
grant execute on function public.attivita_pr to authenticated;

-- Il PR non segna più pagamenti e non consegna soldi: tutto passa dal sito.
drop function if exists public.pr_segna_pagato(uuid, boolean);
drop function if exists public.conferma_consegna(uuid, uuid, numeric);
drop function if exists public.annulla_consegna(uuid);
