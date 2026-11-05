-- Schema relazionale, tappa 7: le ultime operazioni che servono al codice dell'app per i tavoli, la porta e gli accessi.
-- Vedi PIANO-SCHEMA.md, sezioni 2.4 e 4. Il codice dell'app le chiama SOLO con l'interruttore MM_ARCHIVIO=tabelle (spento di default): finché
-- è spento il sito legge e scrive la riga unica `archivio_mvp`. Questa migrazione quindi non cambia nulla per il sito.
-- Richiede le tappe 1, 2 e 3. Le altre funzioni (prenota_tavolo, conferma_pagamento_prenotazione, annulla_prenotazione, scadenze, avvisi,
-- promemoria, ingresso_tavolo, segna_ingresso, usa_accesso_*) sono già nelle tappe 2 e 3.
--
-- Qui: la sessione di pagamento di un tavolo, la creazione di un accesso (link e codice), il "non rientra" della porta, e prenota_tavolo con in
-- più il controllo dei posti del tavolo (prima lo faceva il codice dopo aver letto, ma l'ordine dei controlli conta: tavolo preso, poi posti,
-- poi i limiti del cliente).

do $$
begin
  if to_regclass('public.prenotazioni_tavoli') is null or to_regclass('public.accessi') is null or to_regclass('public.pagamenti') is null then
    raise exception 'Servono prima le tappe 1, 2 e 3 (20261104…, 20261105…, 20261106…)' using errcode = 'P0001';
  end if;
end $$;

-- prenota_tavolo(): come nella tappa 3, più il controllo dei posti del tavolo (`troppe_persone`).
-- Richiesta di un tavolo, con i controlli nello stesso passaggio: due richieste insieme non prendono lo stesso tavolo.
-- Il codice ha già validato i dati, la serata (pubblicata, non iniziata), il link del PR e calcolato il termine (`p_scade`).
-- Prima si blocca il tavolo (sempre prima della prenotazione, come in conferma_pagamento_prenotazione: niente blocchi incrociati),
-- poi: decadono le richieste scadute di questo tavolo; per un cliente si chiude anche la sua pagina di pagamento lasciata a metà;
-- infine si controlla che il tavolo sia libero e che il cliente non ne tenga già un altro.
-- Risponde: creata | tavolo_non_disponibile | troppe_persone | email_gia | telefono_gia | tavolo_sconosciuto.
create or replace function public.prenota_tavolo(
  p_id uuid, p_tavolo_id uuid, p_pr_id uuid,
  p_nome text, p_cognome text, p_email text, p_telefono text, p_persone integer,
  p_scade timestamptz, p_token_qr text, p_codice text, p_inserita_da text,
  p_adesso timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  t         public.tavoli;
  v_email   text := lower(btrim(p_email));
  v_cifre   text := nullif(right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9), '');
  v_vincolo text;
begin
  if p_inserita_da not in ('cliente', 'pr', 'crew') then raise exception 'inserita_da_non_valido' using errcode = 'P0001'; end if;
  select * into t from public.tavoli where id = p_tavolo_id for update;
  if not found then return jsonb_build_object('esito', 'tavolo_sconosciuto'); end if;

  -- Decadono le richieste non pagate in tempo: del tavolo e, per un cliente, anche le sue (altrimenti il suo vecchio tavolo scaduto,
  -- non ancora segnato, gli impedirebbe di prenderne un altro).
  update public.prenotazioni_tavoli
     set stato = 'scaduta', chiusa_at = p_adesso
   where stato = 'in_attesa' and scade <= p_adesso
     and (tavolo_id = t.id or (p_inserita_da = 'cliente' and evento_id = t.evento_id and (email = v_email or telefono_cifre = v_cifre)));

  -- Pagamento lasciato a metà con la stessa email o lo stesso numero: si libera e si riparte da capo.
  if p_inserita_da = 'cliente' then
    update public.prenotazioni_tavoli
       set stato = 'annullata', chiusa_at = p_adesso, avviso_chiusura_at = p_adesso
     where evento_id = t.evento_id and stato = 'in_attesa' and pagamento_online and inserita_da = 'cliente'
       and (email = v_email or telefono_cifre = v_cifre);
  end if;

  if not t.in_vendita or exists (select 1 from public.prenotazioni_tavoli p where p.tavolo_id = t.id and p.stato in ('in_attesa', 'confermata')) then
    return jsonb_build_object('esito', 'tavolo_non_disponibile');
  end if;
  -- Il gruppo deve starci (dopo la disponibilità e prima dei limiti del cliente, nello stesso ordine in cui li controllava il codice).
  if t.posti is not null and p_persone > t.posti then
    return jsonb_build_object('esito', 'troppe_persone', 'posti', t.posti);
  end if;
  -- Un cliente tiene fermo un solo tavolo per serata (qualunque cosa lo tenga: anche una richiesta inserita da un PR).
  if p_inserita_da = 'cliente' then
    if exists (select 1 from public.prenotazioni_tavoli p where p.evento_id = t.evento_id and p.email = v_email and p.stato in ('in_attesa', 'confermata')) then
      return jsonb_build_object('esito', 'email_gia');
    end if;
    if v_cifre is not null and exists (select 1 from public.prenotazioni_tavoli p where p.evento_id = t.evento_id and p.telefono_cifre = v_cifre and p.stato in ('in_attesa', 'confermata')) then
      return jsonb_build_object('esito', 'telefono_gia');
    end if;
  end if;

  begin
    insert into public.prenotazioni_tavoli (id, tavolo_id, evento_id, pr_id, nome, cognome, email, telefono, persone, spesa_minima, stato, scade,
      token_qr, codice, inserita_da, consenso_privacy_at, created_at, pagamento_online)
    values (p_id, t.id, t.evento_id, p_pr_id, btrim(p_nome), btrim(p_cognome), v_email, btrim(p_telefono), p_persone, t.spesa_minima, 'in_attesa', p_scade,
      p_token_qr, p_codice, p_inserita_da, p_adesso, p_adesso, true);   -- si paga sempre sul sito
  exception when unique_violation then
    -- Una richiesta uguale è passata un istante prima: gli indici unici lo impediscono anche tra connessioni diverse.
    get stacked diagnostics v_vincolo = constraint_name;
    if v_vincolo = 'prenotazioni_tavolo_attiva' then return jsonb_build_object('esito', 'tavolo_non_disponibile'); end if;
    if v_vincolo = 'prenotazioni_cliente_email' then return jsonb_build_object('esito', 'email_gia'); end if;
    if v_vincolo = 'prenotazioni_cliente_telefono' then return jsonb_build_object('esito', 'telefono_gia'); end if;
    raise;
  end;
  return jsonb_build_object('esito', 'creata', 'id', p_id);
end $$;

-- ---------------------------------------------------------------- sessione di pagamento di un tavolo
create or replace function public.salva_sessione_prenotazione(p_id uuid, p_sessione text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.prenotazioni_tavoli set pagamento_sessione = p_sessione where id = p_id and pagamento_online and stato = 'in_attesa';
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------- accessi
-- Un nuovo link e un nuovo codice per un utente: i suoi vecchi accessi, e tutti quelli scaduti o già usati, si tolgono.
create or replace function public.crea_accesso(p_id uuid, p_utente_id uuid, p_token_hash text, p_codice_hash text, p_scade timestamptz, p_adesso timestamptz default now())
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.accessi where utente_id = p_utente_id or usato or scade <= p_adesso;
  insert into public.accessi (id, utente_id, token_hash, codice_hash, scade, usato, tentativi) values (p_id, p_utente_id, p_token_hash, p_codice_hash, p_scade, false, 0);
  return true;
end $$;

-- ---------------------------------------------------------------- "Non rientra" alla porta
-- Lo staff ha controllato la categoria e la persona non entra. Non registra l'ingresso: salva chi, quando e da quale porta. Ripetibile (la sincronizzazione
-- può arrivare due volte). Risponde: rifiutato | gia_entrato | non_trovata.
create or replace function public.rifiuta_ingresso(p_id uuid, p_evento_id uuid, p_ora timestamptz, p_porta text, p_da text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.iscrizioni;
begin
  update public.iscrizioni
     set rifiuto_ingresso = jsonb_build_object('ora', to_char(p_ora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'porta', p_porta, 'da', p_da)
   where id = p_id and evento_id = p_evento_id and stato <> 'entrato'
   returning * into r;
  if found then return jsonb_build_object('esito', 'rifiutato'); end if;
  select * into r from public.iscrizioni where id = p_id and evento_id = p_evento_id;
  if not found then return jsonb_build_object('esito', 'non_trovata'); end if;
  return jsonb_build_object('esito', 'gia_entrato');
end $$;

-- ---------------------------------------------------------------- permessi sulle funzioni
revoke execute on function public.prenota_tavolo(uuid, uuid, uuid, text, text, text, text, integer, timestamptz, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.salva_sessione_prenotazione(uuid, text) from public, anon, authenticated;
revoke execute on function public.crea_accesso(uuid, uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.rifiuta_ingresso(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.prenota_tavolo(uuid, uuid, uuid, text, text, text, text, integer, timestamptz, text, text, text, timestamptz) to service_role;
grant execute on function public.salva_sessione_prenotazione(uuid, text) to service_role;
grant execute on function public.crea_accesso(uuid, uuid, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.rifiuta_ingresso(uuid, uuid, timestamptz, text, text) to service_role;

-- Fa vedere subito all'API le funzioni nuove.
notify pgrst, 'reload schema';
