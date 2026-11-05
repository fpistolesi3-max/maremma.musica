-- Schema relazionale, tappa 6: le ultime operazioni sulle prevendite che servono al codice dell'app (sessione di pagamento, "lascia il posto",
-- annulla / ripristina, cambio di nominativo). Le altre (crea_iscrizione, conferma_pagamento_iscrizione, rimborsi, scadenze, anonimizzazione)
-- sono già nelle tappe 2 e 3. Vedi PIANO-SCHEMA.md, sezioni 2.4 e 4.
-- Il codice dell'app le chiama SOLO con l'interruttore MM_ARCHIVIO=tabelle (spento di default): finché è spento il sito legge e scrive la
-- riga unica `archivio_mvp`. Questa migrazione quindi non cambia nulla per il sito. Richiede le tappe 1, 2 e 3.
--
-- Stesse regole di lib/dati/prevendita.ts (salvaSessioneIscrizione, lasciaPosto) e lib/dati/admin.ts (cambiaStatoIscrizione, cambiaNominativo).
-- Le regole che dipendono da orari o dall'età (età minima, formato della data, email) le controlla il codice prima di chiamare.

do $$
begin
  if to_regclass('public.iscrizioni') is null or to_regclass('public.pagamenti') is null or to_regclass('public.prenotazioni_tavoli') is null then
    raise exception 'Servono prima le tappe 1, 2 e 3 (20261104…, 20261105…, 20261106…)' using errcode = 'P0001';
  end if;
end $$;

-- Ricorda l'ultima pagina di pagamento aperta (solo per una prevendita ancora in attesa e da pagare online).
create or replace function public.salva_sessione_iscrizione(p_id uuid, p_sessione text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.iscrizioni set pagamento_sessione = p_sessione where id = p_id and pagamento_online and stato = 'in_attesa';
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Il cliente lascia il posto prima di pagare (dalla pagina del biglietto): torna subito libero. Vero solo la prima volta e solo con l'email giusta.
create or replace function public.lascia_posto(p_id uuid, p_email text, p_adesso timestamptz default now())
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.iscrizioni set stato = 'annullato', annullato_at = p_adesso
   where id = p_id and stato = 'in_attesa' and email = lower(btrim(p_email));
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Annulla senza rimborso (solo ciò che non è stato pagato) o ripristina. Il rimborso di ciò che è pagato sta in concludi_rimborso().
-- Risponde: annullata | ripristinata | pagata (annullare una pagata: serve il rimborso) | mai_pagata (non si riattiva una prevendita mai pagata) |
--           doppio (c'è già un QR valido per la persona) | ignorata (niente da fare in questo stato) | non_trovata.
create or replace function public.cambia_stato_iscrizione(p_id uuid, p_azione text, p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.iscrizioni;
begin
  if p_azione not in ('annulla', 'ripristina') then raise exception 'azione_non_valida' using errcode = 'P0001'; end if;
  select * into r from public.iscrizioni where id = p_id for update;
  if not found then return jsonb_build_object('esito', 'non_trovata'); end if;

  if p_azione = 'annulla' then
    if r.stato not in ('in_lista', 'pagato', 'entrato') then return jsonb_build_object('esito', 'ignorata'); end if;
    if r.metodo_pagamento is not null then return jsonb_build_object('esito', 'pagata'); end if;
    update public.iscrizioni set stato = 'annullato', annullato_at = p_adesso where id = r.id;
    return jsonb_build_object('esito', 'annullata');
  end if;

  if r.stato <> 'annullato' then return jsonb_build_object('esito', 'ignorata'); end if;
  -- Una prevendita lasciata senza pagare non torna valida: sarebbe un QR regalato.
  if r.pagamento_online and r.metodo_pagamento is null then return jsonb_build_object('esito', 'mai_pagata'); end if;
  if r.chiave_cognome is not null then
    perform pg_advisory_xact_lock(hashtextextended(r.evento_id::text || '|' || r.chiave_cognome || '|' || r.data_nascita::text, 0));
    if exists (select 1 from public.iscrizioni x where x.evento_id = r.evento_id and x.id <> r.id and x.chiave_cognome = r.chiave_cognome
                and x.data_nascita = r.data_nascita and not x.anonimizzata and x.stato in ('in_lista', 'pagato', 'entrato')) then
      return jsonb_build_object('esito', 'doppio');
    end if;
  end if;
  update public.iscrizioni
     set stato = case when ora_check_in is not null then 'entrato' when metodo_pagamento is not null then 'pagato' else 'in_lista' end, annullato_at = null
   where id = r.id;
  return jsonb_build_object('esito', 'ripristinata');
end $$;

-- Cambio di nominativo (un amico subentra): solo per chi ha una prevendita valida e non è ancora entrato. Il biglietto resta lo stesso (stesso QR,
-- stesso pagamento). Il codice ha già controllato nome, data di nascita, età ed email. `p_email` vuota o null = l'email resta com'era.
-- Risponde: cambiato | doppione | non_modificabile | non_trovata.
create or replace function public.cambia_nominativo(p_id uuid, p_nome text, p_cognome text, p_data_nascita date, p_email text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r        public.iscrizioni;
  v_chiave text := public.chiave_cognome(p_cognome);
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select * into r from public.iscrizioni where id = p_id for update;
  if not found then return jsonb_build_object('esito', 'non_trovata'); end if;
  if r.stato not in ('in_lista', 'pagato') or r.anonimizzata then return jsonb_build_object('esito', 'non_modificabile'); end if;
  perform pg_advisory_xact_lock(hashtextextended(r.evento_id::text || '|' || v_chiave || '|' || p_data_nascita::text, 0));
  if exists (select 1 from public.iscrizioni x where x.evento_id = r.evento_id and x.id <> r.id and x.chiave_cognome = v_chiave
              and x.data_nascita = p_data_nascita and not x.anonimizzata and x.stato in ('in_lista', 'pagato', 'entrato')) then
    return jsonb_build_object('esito', 'doppione');
  end if;
  update public.iscrizioni
     set nome = btrim(p_nome), cognome = btrim(p_cognome), chiave_cognome = v_chiave, data_nascita = p_data_nascita, email = coalesce(v_email, email)
   where id = r.id;
  return jsonb_build_object('esito', 'cambiato');
end $$;

revoke execute on function public.salva_sessione_iscrizione(uuid, text) from public, anon, authenticated;
revoke execute on function public.lascia_posto(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.cambia_stato_iscrizione(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.cambia_nominativo(uuid, text, text, date, text) from public, anon, authenticated;
grant execute on function public.salva_sessione_iscrizione(uuid, text) to service_role;
grant execute on function public.lascia_posto(uuid, text, timestamptz) to service_role;
grant execute on function public.cambia_stato_iscrizione(uuid, text, timestamptz) to service_role;
grant execute on function public.cambia_nominativo(uuid, text, text, date, text) to service_role;

-- Fa vedere subito all'API le funzioni nuove.
notify pgrst, 'reload schema';
