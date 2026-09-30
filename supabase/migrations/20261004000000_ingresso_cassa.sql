-- Ingresso in cassa: registrato alla porta da staff/admin, senza email e senza QR mostrato.

alter table public.eventi add column prezzo_cassa numeric(8,2) check (prezzo_cassa is null or prezzo_cassa >= 0);

alter table public.iscrizioni add column origine text not null default 'lista' check (origine in ('lista', 'cassa'));
alter table public.iscrizioni add column rif_cassa text;
create unique index iscrizioni_rif_cassa on public.iscrizioni (evento_id, rif_cassa) where rif_cassa is not null;
-- L'email resta obbligatoria per la lista, non per la cassa.
alter table public.iscrizioni alter column email drop not null;
alter table public.iscrizioni drop constraint if exists iscrizioni_email_check;
alter table public.iscrizioni add constraint iscrizioni_email_check
  check ((origine = 'cassa' and email is null) or (origine = 'lista' and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

-- Registrazione in cassa, idempotente sul riferimento creato dal telefono (sincronizzazioni ripetute).
-- Token e codice sono generati dal server (servono solo come chiavi interne).
create or replace function public.porta_cassa(
  p_evento_id uuid, p_rif text, p_nome text, p_cognome text, p_data_nascita date,
  p_importo numeric, p_metodo public.metodo_pagamento, p_porta text, p_ora timestamptz,
  p_token_qr text, p_codice text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  e public.eventi;
  r public.iscrizioni;
  v_ora timestamptz := least(coalesce(p_ora, now()), now());
begin
  if not public.is_staff_o_admin() then raise exception 'non_autorizzato' using errcode = '42501'; end if;
  select * into r from public.iscrizioni where evento_id = p_evento_id and rif_cassa = p_rif;
  if found then return jsonb_build_object('esito', 'entrato', 'id', r.id, 'incassato', r.importo); end if;
  select * into e from public.eventi where id = p_evento_id;
  if not found then return jsonb_build_object('esito', 'non_valido', 'motivo', 'Serata non trovata'); end if;
  if p_data_nascita + make_interval(years => e.eta_minima) > (e.data at time zone 'Europe/Rome')::date then
    return jsonb_build_object('esito', 'non_valido', 'motivo', 'minorenne');
  end if;
  begin
    insert into public.iscrizioni (evento_id, nome, cognome, data_nascita, email, token_qr, codice, stato,
      metodo_pagamento, importo, pagato_at, ora_check_in, porta, consenso_privacy_at, canale, origine, rif_cassa)
    values (p_evento_id, btrim(p_nome), btrim(p_cognome), p_data_nascita, null, p_token_qr, p_codice, 'entrato',
      case when p_importo > 0 then p_metodo end, greatest(p_importo, 0), case when p_importo > 0 then v_ora end,
      v_ora, p_porta, v_ora, 'cassa', 'cassa', p_rif)
    returning * into r;
  exception when unique_violation then
    return jsonb_build_object('esito', 'non_valido', 'motivo', 'già in lista');
  end;
  return jsonb_build_object('esito', 'entrato', 'id', r.id, 'incassato', r.importo);
end $$;
revoke execute on function public.porta_cassa from public, anon;
grant execute on function public.porta_cassa to authenticated;
