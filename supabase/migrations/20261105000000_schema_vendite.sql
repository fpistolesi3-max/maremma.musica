-- Schema relazionale, tappa 2 di 3: le vendite delle prevendite (iscrizioni, pagamenti, accessi) e le funzioni che le rendono
-- sicure quando più persone agiscono insieme. Vedi PIANO-SCHEMA.md, sezioni 2.2 e 2.4.
-- Il codice dell'app NON usa ancora queste tabelle e queste funzioni: finché l'interruttore MM_ARCHIVIO resta spento il sito
-- legge e scrive la riga unica `archivio_mvp`. Questa migrazione quindi non cambia nulla per il sito. Richiede la tappa 1
-- (20261104000000_schema_anagrafiche.sql).
--
-- Principio: le regole che dipendono da orari e testi restano in TypeScript (lib/regole.ts) e arrivano alle funzioni già decise
-- (`p_serata_chiusa`, `p_importo_ok`, `p_scade`). Il database garantisce solo quello che può andare storto per richieste
-- simultanee: posti finiti, persona già in lista, pagamento già registrato, QR già entrato, rimborso già fatto, link già usato.
-- Le tavole `prenotazioni_tavoli` arrivano con la tappa 3: `pagamenti.prenotazione_id` per ora è un id senza chiave esterna.

-- ---------------------------------------------------------------- funzioni di servizio
-- Chiave "stessa persona": cognome senza accenti, minuscolo, solo lettere a-z. Come `chiaveCognome()` in lib/regole.ts
-- ("D'Àngelo " e "d'angelo" sono la stessa persona). Un solo punto nel database: le righe copiate e quelle nuove usano la stessa.
create or replace function public.chiave_cognome(c text)
returns text language sql immutable set search_path = ''
as $$ select regexp_replace(lower(normalize(coalesce(c, ''), NFD)), '[^a-z]', '', 'g') $$;

-- Occupa un posto del tipo: valida, oppure in attesa di pagamento e ancora nel termine (lib/regole.ts: tienePosto).
create or replace function public.tiene_posto(p_stato text, p_scade timestamptz, p_adesso timestamptz default now())
returns boolean language sql immutable set search_path = ''
as $$ select p_stato in ('in_lista', 'pagato', 'entrato') or (p_stato = 'in_attesa' and p_scade is not null and p_scade > p_adesso) $$;

-- ---------------------------------------------------------------- iscrizioni
create table if not exists public.iscrizioni (
  id                    uuid primary key,
  evento_id             uuid not null references public.eventi (id) on delete restrict,
  lotto_id              uuid references public.lotti (id) on delete set null,
  pr_id                 uuid references public.pr (id) on delete set null,             -- null = Lista Maremma Musica
  nome                  text,
  cognome               text,
  chiave_cognome        text,                                                          -- vedi chiave_cognome()
  data_nascita          date,
  email                 text,
  token_qr              text not null unique,                                          -- firmato HMAC lato server, mai progressivo
  codice                text not null unique,                                          -- 8 caratteri da dettare alla porta
  stato                 text not null default 'in_lista'
                          check (stato in ('in_attesa', 'scaduta', 'in_lista', 'pagato', 'entrato', 'annullato', 'rimborsato')),
  metodo_pagamento      text check (metodo_pagamento is null or metodo_pagamento = 'online'),
  importo               numeric(8,2) not null default 0 check (importo >= 0),         -- prezzo del tipo al momento dell'iscrizione
  pagato_at             timestamptz,
  scade                 timestamptz,                                                   -- in attesa: termine per pagare online
  ora_check_in          timestamptz,
  porta                 text,
  rifiuto_ingresso      jsonb,                                                         -- "Non rientra" dello staff: { ora, porta, da }
  categoria             text,                                                          -- categoria del tipo all'iscrizione (si controlla alla porta)
  canale                text not null default 'diretto' check (canale ~ '^[a-z0-9._-]{1,24}$'),
  consenso_privacy_at   timestamptz not null,
  consenso_marketing    boolean not null default false,
  annullato_at          timestamptz,
  created_at            timestamptz not null default now(),
  pagamento_online      boolean not null default false,                                -- da pagare (o pagata) sul sito
  pagamento_sessione    text,                                                          -- ultima pagina di pagamento aperta
  anonimizzata          boolean not null default false,
  eta_alla_serata       smallint check (eta_alla_serata is null or eta_alla_serata between 0 and 130),
  anonimizzata_at       timestamptz,
  constraint iscrizioni_attesa_con_termine check (stato <> 'in_attesa' or scade is not null),
  -- Dati personali presenti e validi, oppure tutti cancellati (30 giorni dopo la serata).
  constraint iscrizioni_dati_personali check (
    (not anonimizzata
      and nome is not null and length(btrim(nome)) between 1 and 80
      and cognome is not null and length(btrim(cognome)) between 1 and 80
      and chiave_cognome is not null
      and data_nascita is not null
      and email is not null and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$')
    or (anonimizzata
      and nome is null and cognome is null and chiave_cognome is null and data_nascita is null and email is null))
);
-- Un solo QR a persona per serata (lib/regole.ts: giaIscritto). Valgono solo le iscrizioni valide con i dati ancora presenti.
create unique index if not exists iscrizioni_unica_persona
  on public.iscrizioni (evento_id, chiave_cognome, data_nascita)
  where not anonimizzata and stato in ('in_lista', 'pagato', 'entrato');
create index if not exists iscrizioni_evento_idx on public.iscrizioni (evento_id, created_at desc);
create index if not exists iscrizioni_pr_idx on public.iscrizioni (pr_id, evento_id);
create index if not exists iscrizioni_email_idx on public.iscrizioni (lower(email)) where email is not null;
create index if not exists iscrizioni_lotto_idx on public.iscrizioni (lotto_id) where stato in ('in_attesa', 'in_lista', 'pagato', 'entrato');
create index if not exists iscrizioni_in_attesa_idx on public.iscrizioni (scade) where stato = 'in_attesa';
create index if not exists iscrizioni_canale_idx on public.iscrizioni (evento_id, canale);

-- ---------------------------------------------------------------- pagamenti
-- Un pagamento Stripe (o di prova) = una riga. La chiave primaria è l'id del pagamento: lo stesso pagamento non si registra due volte.
-- `principale` = quello che conferma l'ordine; `in_piu` = secondo clic su "Paga" o importo sbagliato: non conferma niente, va solo restituito.
create table if not exists public.pagamenti (
  id                    text primary key,
  iscrizione_id         uuid references public.iscrizioni (id) on delete restrict,
  prenotazione_id       uuid,                                                          -- chiave esterna con la tappa 3
  ruolo                 text not null check (ruolo in ('principale', 'in_piu')),
  centesimi             integer not null check (centesimi >= 0),
  valuta                text not null default 'eur',
  motivo                text check (motivo is null or motivo in
                          ('serata_iniziata', 'lotto_pieno', 'doppione', 'ordine_chiuso', 'secondo_pagamento', 'importo')),
  da_rimborsare         boolean not null default false,
  rimborso_stato        text check (rimborso_stato is null or rimborso_stato in ('in_corso', 'fatto')),
  rimborso_chiave       text,                                                          -- chiave di idempotenza che Stripe usa per non rimborsare due volte
  rimborso_avviato_at   timestamptz,
  rimborso_fatto_at     timestamptz,
  rimborso_da           text,
  at                    timestamptz not null default now(),
  constraint pagamenti_un_ordine check ((iscrizione_id is null) <> (prenotazione_id is null)),
  constraint pagamenti_rimborso_coerente check (
    (rimborso_stato is null and rimborso_chiave is null and rimborso_avviato_at is null and rimborso_fatto_at is null)
    or (rimborso_stato = 'in_corso' and rimborso_chiave is not null and rimborso_avviato_at is not null and rimborso_fatto_at is null)
    or (rimborso_stato = 'fatto' and rimborso_chiave is not null and rimborso_avviato_at is not null and rimborso_fatto_at is not null))
);
create unique index if not exists pagamenti_principale_iscrizione on public.pagamenti (iscrizione_id) where ruolo = 'principale' and iscrizione_id is not null;
create unique index if not exists pagamenti_principale_prenotazione on public.pagamenti (prenotazione_id) where ruolo = 'principale' and prenotazione_id is not null;
create index if not exists pagamenti_iscrizione_idx on public.pagamenti (iscrizione_id) where iscrizione_id is not null;
create index if not exists pagamenti_prenotazione_idx on public.pagamenti (prenotazione_id) where prenotazione_id is not null;
create index if not exists pagamenti_da_rimborsare_idx on public.pagamenti (at) where da_rimborsare and rimborso_stato is distinct from 'fatto';

-- ---------------------------------------------------------------- accessi (link magico e codice a 6 cifre)
-- Si salvano solo gli hash. Il cron toglie quelli scaduti.
create table if not exists public.accessi (
  id                    uuid primary key,
  utente_id             uuid not null references public.utenti (id) on delete cascade,
  token_hash            text not null unique,
  codice_hash           text not null,
  scade                 timestamptz not null,
  usato                 boolean not null default false,
  tentativi             integer not null default 0 check (tentativi >= 0)
);
create index if not exists accessi_utente_idx on public.accessi (utente_id) where not usato;
create index if not exists accessi_scade_idx on public.accessi (scade);

-- ---------------------------------------------------------------- permessi
alter table public.iscrizioni enable row level security;
alter table public.pagamenti enable row level security;
alter table public.accessi enable row level security;
revoke all on public.iscrizioni, public.pagamenti, public.accessi from anon, authenticated;
grant all on table public.iscrizioni, public.pagamenti, public.accessi to service_role;

-- ---------------------------------------------------------------- crea_iscrizione()
-- Iscrizione con i posti del tipo controllati in modo atomico. Il codice ha già validato età, link del PR, orario limite e prezzo.
-- Risponde: creata | ripresa (richiesta ancora aperta della stessa persona, stessa email) | sospesa_altra_email |
--           doppione (ha già un QR valido) | lotto_pieno.
-- Il blocco sul tipo (`for update`) tocca solo quel tipo; quello sulla persona evita due richieste identiche insieme.
create or replace function public.crea_iscrizione(
  p_id uuid, p_evento_id uuid, p_lotto_id uuid, p_pr_id uuid,
  p_nome text, p_cognome text, p_data_nascita date, p_email text,
  p_token_qr text, p_codice text, p_stato text, p_importo numeric, p_categoria text, p_canale text,
  p_consenso_marketing boolean, p_scade timestamptz, p_pagamento_online boolean,
  p_adesso timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_chiave    text := public.chiave_cognome(p_cognome);
  v_email     text := lower(btrim(p_email));
  v_quantita  integer;
  v_usati     integer;
  v_altra     public.iscrizioni;
begin
  if p_stato not in ('in_attesa', 'in_lista') then raise exception 'stato_non_valido' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_evento_id::text || '|' || v_chiave || '|' || p_data_nascita::text, 0));

  select * into v_altra from public.iscrizioni i
   where i.evento_id = p_evento_id and i.chiave_cognome = v_chiave and i.data_nascita = p_data_nascita
     and not i.anonimizzata and i.stato in ('in_lista', 'pagato', 'entrato')
   limit 1;
  if found then return jsonb_build_object('esito', 'doppione', 'email', v_altra.email); end if;

  select * into v_altra from public.iscrizioni i
   where i.evento_id = p_evento_id and i.chiave_cognome = v_chiave and i.data_nascita = p_data_nascita
     and not i.anonimizzata and i.stato = 'in_attesa' and i.scade > p_adesso
   limit 1;
  if found then
    if v_altra.email = v_email then return jsonb_build_object('esito', 'ripresa', 'id', v_altra.id); end if;
    return jsonb_build_object('esito', 'sospesa_altra_email');
  end if;

  if p_lotto_id is not null then
    select quantita into v_quantita from public.lotti where id = p_lotto_id for update;
    if not found then raise exception 'lotto_non_trovato' using errcode = 'P0001'; end if;
    if v_quantita is not null then
      select count(*) into v_usati from public.iscrizioni i
       where i.lotto_id = p_lotto_id and public.tiene_posto(i.stato, i.scade, p_adesso);
      if v_usati >= v_quantita then return jsonb_build_object('esito', 'lotto_pieno'); end if;
    end if;
  end if;

  insert into public.iscrizioni (id, evento_id, lotto_id, pr_id, nome, cognome, chiave_cognome, data_nascita, email, token_qr, codice,
    stato, importo, categoria, canale, consenso_privacy_at, consenso_marketing, scade, pagamento_online, created_at)
  values (p_id, p_evento_id, p_lotto_id, p_pr_id, btrim(p_nome), btrim(p_cognome), v_chiave, p_data_nascita, v_email, p_token_qr, p_codice,
    p_stato, p_importo, p_categoria, coalesce(p_canale, 'diretto'), p_adesso, p_consenso_marketing, p_scade, p_pagamento_online, p_adesso);
  return jsonb_build_object('esito', 'creata', 'id', p_id);
end $$;

-- ---------------------------------------------------------------- conferma_pagamento_iscrizione()
-- Pagamento riuscito (webhook di Stripe, ritorno del cliente, controllo giornaliero, pagina di prova). Idempotente sul pagamento.
-- Il codice passa `p_importo_ok` (importo e valuta coincidono con il prezzo) e `p_serata_chiusa` (orario limite passato).
-- Le ragioni che dipendono dalle gare le decide il database: ordine chiuso, tipo pieno, persona già in lista, secondo pagamento.
-- Risponde: confermata | gia | da_rimborsare (con `motivo`, `principale` = è il pagamento dell'ordine) | sconosciuta.
create or replace function public.conferma_pagamento_iscrizione(
  p_id uuid, p_pagamento text, p_centesimi integer, p_valuta text,
  p_importo_ok boolean default true, p_serata_chiusa boolean default false,
  p_adesso timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r          public.iscrizioni;
  v_quantita integer;
  v_altri    integer;
  v_motivo   text;
begin
  -- Prima l'ordine: due conferme dello stesso ordine si mettono in fila e la seconda trova il pagamento già scritto.
  select * into r from public.iscrizioni where id = p_id for update;
  if not found then return jsonb_build_object('esito', 'sconosciuta'); end if;
  if exists (select 1 from public.pagamenti where id = p_pagamento) then return jsonb_build_object('esito', 'gia'); end if;

  if not p_importo_ok then
    insert into public.pagamenti (id, iscrizione_id, ruolo, centesimi, valuta, motivo, da_rimborsare, at)
    values (p_pagamento, r.id, 'in_piu', p_centesimi, lower(p_valuta), 'importo', true, p_adesso);
    return jsonb_build_object('esito', 'da_rimborsare', 'motivo', 'importo', 'principale', false, 'centesimi', p_centesimi);
  end if;
  -- Ha già un pagamento (due pagine di pagamento aperte, pagate entrambe): il QR resta com'è.
  if exists (select 1 from public.pagamenti where iscrizione_id = r.id and ruolo = 'principale') then
    insert into public.pagamenti (id, iscrizione_id, ruolo, centesimi, valuta, motivo, da_rimborsare, at)
    values (p_pagamento, r.id, 'in_piu', p_centesimi, lower(p_valuta), 'secondo_pagamento', true, p_adesso);
    return jsonb_build_object('esito', 'da_rimborsare', 'motivo', 'secondo_pagamento', 'principale', false, 'centesimi', p_centesimi);
  end if;

  -- Stesso blocco di crea_iscrizione: due richieste della stessa persona che pagano insieme non diventano due QR.
  if r.chiave_cognome is not null then
    perform pg_advisory_xact_lock(hashtextextended(r.evento_id::text || '|' || r.chiave_cognome || '|' || r.data_nascita::text, 0));
  end if;

  if r.stato not in ('in_attesa', 'scaduta') then
    v_motivo := 'ordine_chiuso';
  elsif p_serata_chiusa then
    v_motivo := 'serata_iniziata';
  else
    if r.lotto_id is not null then
      select quantita into v_quantita from public.lotti where id = r.lotto_id for update;
      if v_quantita is not null then
        select count(*) into v_altri from public.iscrizioni i
         where i.lotto_id = r.lotto_id and i.id <> r.id and public.tiene_posto(i.stato, i.scade, p_adesso);
        if v_altri >= v_quantita then v_motivo := 'lotto_pieno'; end if;
      end if;
    end if;
    if v_motivo is null and r.chiave_cognome is not null and exists (
      select 1 from public.iscrizioni i
       where i.evento_id = r.evento_id and i.id <> r.id and i.chiave_cognome = r.chiave_cognome and i.data_nascita = r.data_nascita
         and not i.anonimizzata and i.stato in ('in_lista', 'pagato', 'entrato')) then
      v_motivo := 'doppione';
    end if;
  end if;

  insert into public.pagamenti (id, iscrizione_id, ruolo, centesimi, valuta, motivo, da_rimborsare, at)
  values (p_pagamento, r.id, 'principale', p_centesimi, lower(p_valuta), v_motivo, v_motivo is not null, p_adesso);
  update public.iscrizioni
     set pagato_at = p_adesso, metodo_pagamento = 'online', pagamento_online = true,
         stato = case when v_motivo is null then 'pagato' else stato end,
         scade = case when v_motivo is null then null else scade end
   where id = r.id;
  if v_motivo is null then return jsonb_build_object('esito', 'confermata'); end if;
  return jsonb_build_object('esito', 'da_rimborsare', 'motivo', v_motivo, 'principale', true, 'centesimi', p_centesimi);
end $$;

-- ---------------------------------------------------------------- rimborso in due fasi
-- Fase 1: segna "in corso" e dà la chiave che Stripe usa per non rimborsare due volte. Un solo clic passa.
-- Il codice ha già controllato che l'ordine sia rimborsabile (lib/dati/rimborsi.ts). Dopo un errore di rete incerto riusa la chiave.
-- Risponde: avviato (con `chiave`) | gia (già rimborsato) | in_corso (un altro clic l'ha avviato da meno di 30 secondi) | sconosciuto.
create or replace function public.avvia_rimborso(p_pagamento text, p_chiave text, p_da text, p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  x       public.pagamenti;
  v_chiave text;
begin
  select * into x from public.pagamenti where id = p_pagamento for update;
  if not found then return jsonb_build_object('esito', 'sconosciuto'); end if;
  if x.rimborso_stato = 'fatto' then return jsonb_build_object('esito', 'gia'); end if;
  if x.rimborso_stato = 'in_corso' and x.rimborso_avviato_at > p_adesso - interval '30 seconds' then
    return jsonb_build_object('esito', 'in_corso');
  end if;
  v_chiave := coalesce(x.rimborso_chiave, p_chiave);
  update public.pagamenti
     set rimborso_stato = 'in_corso', rimborso_chiave = v_chiave, rimborso_avviato_at = p_adesso, rimborso_fatto_at = null, rimborso_da = p_da
   where id = p_pagamento;
  return jsonb_build_object('esito', 'avviato', 'chiave', v_chiave, 'centesimi', x.centesimi, 'principale', x.ruolo = 'principale');
end $$;

-- Stripe ha rifiutato (non è partito niente): si toglie "in corso", il prossimo tentativo avrà una chiave nuova.
create or replace function public.rimborso_respinto(p_pagamento text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.pagamenti
     set rimborso_stato = null, rimborso_chiave = null, rimborso_avviato_at = null, rimborso_fatto_at = null, rimborso_da = null
   where id = p_pagamento and rimborso_stato = 'in_corso';
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Fase 2: Stripe ha confermato (o il rimborso è stato fatto dalla dashboard di Stripe). Si segna "fatto" e, se è il pagamento
-- principale, si chiude l'ordine. Chiamabile più volte: `chiuso` è vero solo la prima volta (così l'email parte una volta sola).
-- Risponde: chiuso | gia | sconosciuto.
create or replace function public.concludi_rimborso(p_pagamento text, p_da text, p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  x       public.pagamenti;
  o       public.iscrizioni;
  v_chiuso boolean := false;
begin
  select * into x from public.pagamenti where id = p_pagamento for update;
  if not found then return jsonb_build_object('esito', 'sconosciuto'); end if;
  if x.rimborso_stato = 'fatto' then return jsonb_build_object('esito', 'gia'); end if;
  update public.pagamenti
     set rimborso_stato = 'fatto', rimborso_chiave = coalesce(rimborso_chiave, 'mm-rimborso-' || gen_random_uuid()::text),
         rimborso_avviato_at = coalesce(rimborso_avviato_at, p_adesso), rimborso_fatto_at = p_adesso, rimborso_da = p_da,
         da_rimborsare = false
   where id = p_pagamento;
  if x.ruolo = 'principale' then
    if x.iscrizione_id is not null then
      select * into o from public.iscrizioni where id = x.iscrizione_id for update;
      if found and o.stato <> 'rimborsato' then
        update public.iscrizioni set stato = 'rimborsato', annullato_at = p_adesso where id = o.id;
        v_chiuso := true;
      end if;
    else
      -- I pagamenti dei tavoli arrivano con la tappa 3.
      raise exception 'tavoli_non_ancora_supportati' using errcode = 'P0001';
    end if;
  end if;
  return jsonb_build_object('esito', 'chiuso', 'chiusa_ordine', v_chiuso, 'iscrizione_id', x.iscrizione_id);
end $$;

-- ---------------------------------------------------------------- ingresso alla porta
-- Un solo UPDATE condizionato: il primo passaggio vince, gli altri trovano "già entrato" con l'ora del primo.
-- La decisione (orario limite, categoria, serata senza telefono) resta in lib/porta-logica.ts: qui solo la garanzia "una volta sola".
-- Risponde: entrato | gia_entrato (con `ora_check_in` e `porta` del primo) | non_valida (stato che non può entrare) | sconosciuta.
create or replace function public.segna_ingresso(p_id uuid, p_evento_id uuid, p_ora timestamptz, p_porta text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r public.iscrizioni;
begin
  update public.iscrizioni
     set stato = 'entrato', ora_check_in = p_ora, porta = p_porta
   where id = p_id and evento_id = p_evento_id and stato in ('pagato', 'in_lista')
   returning * into r;
  if found then return jsonb_build_object('esito', 'entrato', 'ora_check_in', r.ora_check_in, 'porta', r.porta); end if;
  select * into r from public.iscrizioni where id = p_id and evento_id = p_evento_id;
  if not found then return jsonb_build_object('esito', 'sconosciuta'); end if;
  if r.stato = 'entrato' then
    return jsonb_build_object('esito', 'gia_entrato', 'ora_check_in', r.ora_check_in, 'porta', r.porta);
  end if;
  return jsonb_build_object('esito', 'non_valida', 'stato', r.stato);
end $$;

-- ---------------------------------------------------------------- accessi
-- Il link vale una volta sola anche se cliccato due volte insieme: risponde con l'utente, oppure null.
create or replace function public.usa_accesso_token(p_token_hash text, p_adesso timestamptz default now())
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_utente uuid;
begin
  update public.accessi set usato = true
   where token_hash = p_token_hash and not usato and scade > p_adesso
   returning utente_id into v_utente;
  return v_utente;
end $$;

-- Il codice a 6 cifre: ogni tentativo conta (contatore atomico), dopo 5 il codice si brucia. Vero solo se il codice è giusto
-- e nessun altro l'ha già usato.
create or replace function public.usa_accesso_codice(p_utente_id uuid, p_codice_hash text, p_adesso timestamptz default now())
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare x public.accessi;
begin
  update public.accessi a set tentativi = a.tentativi + 1
   where a.id = (select id from public.accessi where utente_id = p_utente_id and not usato and scade > p_adesso order by scade desc limit 1)
     and not a.usato and a.scade > p_adesso
   returning * into x;
  if not found then return false; end if;
  if x.tentativi > 5 then
    update public.accessi set usato = true where id = x.id;
    return false;
  end if;
  if x.codice_hash <> p_codice_hash then return false; end if;
  update public.accessi set usato = true where id = x.id;
  return true;
end $$;

-- ---------------------------------------------------------------- scadenze e anonimizzazione
-- Le prevendite non pagate in tempo lasciano il posto. Idempotente; restituisce quante ne ha chiuse.
create or replace function public.scadenze_iscrizioni(p_adesso timestamptz default now())
returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.iscrizioni set stato = 'scaduta' where stato = 'in_attesa' and scade <= p_adesso;
  get diagnostics n = row_count;
  return n;
end $$;

-- Cancella i dati personali delle iscrizioni indicate: `p_dati` = [{ "id": …, "eta": … }]. L'età alla serata la calcola il codice
-- (anniCompiuti) prima di cancellare la data di nascita. Idempotente: salta le già anonimizzate. Restituisce quante ne ha fatte.
create or replace function public.anonimizza_iscrizioni(p_dati jsonb, p_adesso timestamptz default now())
returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.iscrizioni i
     set nome = null, cognome = null, chiave_cognome = null, data_nascita = null, email = null,
         eta_alla_serata = x.eta, anonimizzata = true, anonimizzata_at = p_adesso
    from jsonb_to_recordset(p_dati) as x(id uuid, eta smallint)
   where i.id = x.id and not i.anonimizzata;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- importa_archivio() (estesa)
-- Come nella tappa 1, più iscrizioni, pagamenti e accessi. Il `pagamentoOnline` di ogni iscrizione si spezza in righe di `pagamenti`.
-- Si ferma con un errore chiaro se la riga contiene cose che le tabelle non portano (ingressi in cassa, consegne) o che arrivano
-- con la tappa 3 (prenotazioni dei tavoli): meglio fermarsi che copiare a metà.
create or replace function public.importa_archivio()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a        jsonb;
  v        bigint;
  flag     text;
  n        integer;
  m        integer;
  esito    jsonb := '{}'::jsonb;
begin
  select valore into flag from public.impostazioni where chiave = 'archivio';
  if flag is distinct from 'jsonb' then
    raise exception 'archivio_gia_passato_alle_tabelle' using errcode = 'P0001';
  end if;
  select dati, versione into a, v from public.archivio_mvp where id = 1;
  if a is null then raise exception 'archivio_mvp_vuoto' using errcode = 'P0001'; end if;
  if coalesce(a->>'segreto', '') = '' then raise exception 'segreto_mancante' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(a->'prenotazioni', '[]'::jsonb)) > 0 or jsonb_array_length(coalesce(a->'tavoli', '[]'::jsonb)) > 0 then
    raise exception 'tavoli_non_ancora_supportati' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(a->'consegne', '[]'::jsonb)) > 0
     or exists (select 1 from jsonb_array_elements(coalesce(a->'iscrizioni', '[]'::jsonb)) i where coalesce(i->>'origine', 'lista') <> 'lista') then
    raise exception 'cassa_e_consegne_non_supportate' using errcode = 'P0001';
  end if;

  -- Prima i figli, poi i genitori. `where true`: sui progetti Supabase un DELETE senza WHERE viene rifiutato anche dentro le funzioni.
  delete from public.pagamenti where true;
  delete from public.accessi where true;
  delete from public.iscrizioni where true;
  delete from public.porte where true;
  delete from public.lotti where true;
  delete from public.utenti where true;
  delete from public.pr where true;
  delete from public.eventi where true;

  insert into public.eventi (
    id, numero, slug, nome, data, data_fine, location, comune, lat, lng, location_segreta, tipo_ingresso, descrizione, highlight,
    dress_code, lineup, info_arrivo, locandina_url, piantina_url, prezzo_lista, senza_telefono, prevendita_fino_alle, capienza,
    eta_minima, pubblicato, in_copertina, pr_abilitati, invio_link_pr, created_at, updated_at)
  select
    e.id, e.numero, e.slug, e.nome, e.data, e."dataFine", e.location, e.comune, e.lat, e.lng, coalesce(e."locationSegreta", false),
    coalesce(e."tipoIngresso", 'lista'), e.descrizione, e.highlight, e."dressCode",
    coalesce(array(select jsonb_array_elements_text(e.lineup)), '{}'::text[]),
    e."infoArrivo", e."locandinaUrl", e."piantinaUrl", coalesce(e."prezzoLista", 0), coalesce(e."senzaTelefono", false),
    e."prevenditaFinoAlle", e.capienza, coalesce(e."etaMinima", 18), coalesce(e.pubblicato, false), coalesce(e."inCopertina", false),
    case when jsonb_typeof(e."prAbilitati") = 'array' then array(select jsonb_array_elements_text(e."prAbilitati")::uuid) end,
    case when jsonb_typeof(e."invioLinkPr") = 'object' then e."invioLinkPr" end,
    coalesce(e."createdAt", now()), coalesce(e."updatedAt", now())
  from jsonb_to_recordset(coalesce(a->'eventi', '[]'::jsonb)) as e(
    id uuid, numero integer, slug text, nome text, data timestamptz, "dataFine" timestamptz, location text, comune text,
    lat double precision, lng double precision, "locationSegreta" boolean, "tipoIngresso" text, descrizione text, highlight text,
    "dressCode" text, lineup jsonb, "infoArrivo" text, "locandinaUrl" text, "piantinaUrl" text, "prezzoLista" numeric,
    "senzaTelefono" boolean, "prevenditaFinoAlle" timestamptz, capienza integer, "etaMinima" integer, pubblicato boolean,
    "inCopertina" boolean, "prAbilitati" jsonb, "invioLinkPr" jsonb, "createdAt" timestamptz, "updatedAt" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('eventi', n);

  insert into public.lotti (
    id, evento_id, nome, prezzo, quantita, data_inizio, data_fine, visibile_da_pr, ordine, categoria, conferma_categoria,
    uscita_giorni_prima, fine_ore_prima, dopo_precedente, pr_abilitati, automatico)
  select
    l.id, l."eventoId", l.nome, coalesce(l.prezzo, 0), l.quantita, l."dataInizio", l."dataFine", coalesce(l."visibileDaPr", true),
    coalesce(l.ordine, 0), l.categoria, coalesce(l."confermaCategoria", false), l."uscitaGiorniPrima", l."fineOrePrima",
    coalesce(l."dopoPrecedente", false),
    case when jsonb_typeof(l."prAbilitati") = 'array' then array(select jsonb_array_elements_text(l."prAbilitati")::uuid) end,
    coalesce(l.automatico, false)
  from jsonb_to_recordset(coalesce(a->'lotti', '[]'::jsonb)) as l(
    id uuid, "eventoId" uuid, nome text, prezzo numeric, quantita integer, "dataInizio" timestamptz, "dataFine" timestamptz,
    "visibileDaPr" boolean, ordine integer, categoria text, "confermaCategoria" boolean, "uscitaGiorniPrima" integer,
    "fineOrePrima" integer, "dopoPrecedente" boolean, "prAbilitati" jsonb, automatico boolean);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('lotti', n);

  insert into public.pr (id, handle, nome_display, stato, created_at)
  select p.id, p.handle, p."nomeDisplay", coalesce(p.stato, 'attivo'), coalesce(p."createdAt", now())
  from jsonb_to_recordset(coalesce(a->'pr', '[]'::jsonb)) as p(
    id uuid, handle text, "nomeDisplay" text, stato text, "createdAt" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('pr', n);

  insert into public.utenti (id, email, ruolo, pr_id, created_at)
  select u.id, u.email, u.ruolo, u."prId", coalesce(u."createdAt", now())
  from jsonb_to_recordset(coalesce(a->'utenti', '[]'::jsonb)) as u(
    id uuid, email text, ruolo text, "prId" uuid, "createdAt" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('utenti', n);

  insert into public.porte (evento_id, nome, ultimo_sync)
  select q."eventoId", q.nome, q."ultimoSync"
  from jsonb_to_recordset(coalesce(a->'porte', '[]'::jsonb)) as q(
    "eventoId" uuid, nome text, "ultimoSync" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('porte', n);

  -- Iscrizioni. I campi cancellati dall'anonimizzazione sono stringhe vuote nella riga e diventano null. Una prevendita "in attesa"
  -- senza termine (impossibile oggi) vale come già scaduta, come nel codice (iscrizioneScaduta).
  insert into public.iscrizioni (
    id, evento_id, lotto_id, pr_id, nome, cognome, chiave_cognome, data_nascita, email, token_qr, codice, stato, metodo_pagamento,
    importo, pagato_at, scade, ora_check_in, porta, rifiuto_ingresso, categoria, canale, consenso_privacy_at, consenso_marketing,
    annullato_at, created_at, pagamento_online, pagamento_sessione, anonimizzata, eta_alla_serata, anonimizzata_at)
  select
    i.id, i."eventoId", i."lottoId", i."prId",
    case when coalesce(i.anonimizzata, false) then null else i.nome end,
    case when coalesce(i.anonimizzata, false) then null else i.cognome end,
    case when coalesce(i.anonimizzata, false) then null else public.chiave_cognome(i.cognome) end,
    case when coalesce(i.anonimizzata, false) then null else nullif(i."dataNascita", '')::date end,
    case when coalesce(i.anonimizzata, false) then null else i.email end,
    i."tokenQr", i.codice, i.stato, i."metodoPagamento", coalesce(i.importo, 0), i."pagatoAt",
    case when i.stato = 'in_attesa' then coalesce(i.scade, i."createdAt") else i.scade end,
    i."oraCheckIn", i.porta,
    case when jsonb_typeof(i."rifiutoIngresso") = 'object' then i."rifiutoIngresso" end,
    i.categoria, coalesce(i.canale, 'diretto'), i."consensoPrivacyAt", coalesce(i."consensoMarketing", false),
    i."annullatoAt", i."createdAt",
    jsonb_typeof(i."pagamentoOnline") = 'object', i."pagamentoOnline"->>'sessione',
    coalesce(i.anonimizzata, false), i."etaAllaSerata", i."anonimizzataAt"
  from jsonb_to_recordset(coalesce(a->'iscrizioni', '[]'::jsonb)) as i(
    id uuid, "eventoId" uuid, "lottoId" uuid, "prId" uuid, nome text, cognome text, "dataNascita" text, email text,
    "tokenQr" text, codice text, stato text, "metodoPagamento" text, importo numeric, "pagatoAt" timestamptz, scade timestamptz,
    "oraCheckIn" timestamptz, porta text, "rifiutoIngresso" jsonb, categoria text, canale text, "consensoPrivacyAt" timestamptz,
    "consensoMarketing" boolean, "annullatoAt" timestamptz, "createdAt" timestamptz, "pagamentoOnline" jsonb,
    anonimizzata boolean, "etaAllaSerata" smallint, "anonimizzataAt" timestamptz);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('iscrizioni', n);

  -- Pagamenti: il principale (importo = prezzo dell'iscrizione, valuta euro) e gli "in più". Un rimborso c'è se la riga lo dice.
  insert into public.pagamenti (id, iscrizione_id, ruolo, centesimi, valuta, motivo, da_rimborsare,
    rimborso_stato, rimborso_chiave, rimborso_avviato_at, rimborso_fatto_at, rimborso_da, at)
  select po->>'pagamento', i.id, 'principale', round(coalesce(i.importo, 0) * 100)::integer, 'eur', nullif(po->>'motivo', ''),
    coalesce((po->>'daRimborsare')::boolean, false),
    po->'rimborso'->>'stato', po->'rimborso'->>'chiave', (po->'rimborso'->>'avviatoAt')::timestamptz,
    (po->'rimborso'->>'fattoAt')::timestamptz, po->'rimborso'->>'da',
    coalesce(i."pagatoAt", i."createdAt")
  from jsonb_to_recordset(coalesce(a->'iscrizioni', '[]'::jsonb)) as i(
    id uuid, importo numeric, "pagatoAt" timestamptz, "createdAt" timestamptz, "pagamentoOnline" jsonb),
    lateral (select i."pagamentoOnline" as po) x
  where jsonb_typeof(i."pagamentoOnline") = 'object' and nullif(i."pagamentoOnline"->>'pagamento', '') is not null;
  get diagnostics n = row_count;
  insert into public.pagamenti (id, iscrizione_id, ruolo, centesimi, valuta, motivo, da_rimborsare,
    rimborso_stato, rimborso_chiave, rimborso_avviato_at, rimborso_fatto_at, rimborso_da, at)
  select p->>'pagamento', i.id, 'in_piu', (p->>'centesimi')::integer, lower(coalesce(p->>'valuta', 'eur')), p->>'motivo',
    coalesce(p->'rimborso'->>'stato', '') <> 'fatto',
    p->'rimborso'->>'stato', p->'rimborso'->>'chiave', (p->'rimborso'->>'avviatoAt')::timestamptz,
    (p->'rimborso'->>'fattoAt')::timestamptz, p->'rimborso'->>'da', (p->>'at')::timestamptz
  from jsonb_to_recordset(coalesce(a->'iscrizioni', '[]'::jsonb)) as i(id uuid, "pagamentoOnline" jsonb),
    lateral jsonb_array_elements(coalesce(i."pagamentoOnline"->'inPiu', '[]'::jsonb)) as p;
  get diagnostics m = row_count;
  esito := esito || jsonb_build_object('pagamenti', n + m);

  -- Accessi: quelli di utenti che non esistono più non si portano (non servirebbero a niente).
  insert into public.accessi (id, utente_id, token_hash, codice_hash, scade, usato, tentativi)
  select c.id, c."utenteId", c."tokenHash", c."codiceHash", c.scade, coalesce(c.usato, false), coalesce(c.tentativi, 0)
  from jsonb_to_recordset(coalesce(a->'accessi', '[]'::jsonb)) as c(
    id uuid, "utenteId" uuid, "tokenHash" text, "codiceHash" text, scade timestamptz, usato boolean, tentativi integer)
  where exists (select 1 from public.utenti u where u.id = c."utenteId");
  get diagnostics n = row_count; esito := esito || jsonb_build_object('accessi', n);

  -- Il segreto dei QR: identico alla riga. Non compare mai nel risultato.
  insert into public.impostazioni (chiave, valore) values ('segreto', a->>'segreto')
    on conflict (chiave) do update set valore = excluded.valore, updated_at = now();
  insert into public.impostazioni (chiave, valore) values ('importato_da_versione', v::text)
    on conflict (chiave) do update set valore = excluded.valore, updated_at = now();

  return esito || jsonb_build_object('versione', v);
end $$;

-- ---------------------------------------------------------------- verifica_importo() (estesa)
-- Confronta la riga con le tabelle senza mostrare dati: conteggi, id mancanti o in più, impronta del segreto, versione.
-- Il confronto campo per campo lo fa il codice (tappa 4) e i test.
create or replace function public.verifica_importo()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a           jsonb;
  v           bigint;
  gruppo      text;
  nella_riga  integer;
  nelle_tab   integer;
  mancanti    integer;
  in_piu      integer;
  conteggi    jsonb := '{}'::jsonb;
  differenze  text[] := '{}';
  segreto_ok  boolean;
  versione_ok boolean;
begin
  select dati, versione into a, v from public.archivio_mvp where id = 1;
  if a is null then return jsonb_build_object('ok', false, 'differenze', jsonb_build_array('archivio_mvp_vuoto')); end if;

  -- Gruppi con chiave `id` (le tabelle hanno lo stesso nome del gruppo).
  foreach gruppo in array array['eventi', 'lotti', 'pr', 'utenti', 'iscrizioni'] loop
    execute format('select count(*) from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb))', gruppo) into nella_riga using a;
    execute format('select count(*) from public.%I', gruppo) into nelle_tab;
    execute format('select count(*) from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb)) x where not exists (select 1 from public.%I t where t.id = (x->>''id'')::uuid)', gruppo, gruppo)
      into mancanti using a;
    execute format('select count(*) from public.%I t where not exists (select 1 from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb)) x where (x->>''id'')::uuid = t.id)', gruppo, gruppo)
      into in_piu using a;
    conteggi := conteggi || jsonb_build_object(gruppo, jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
    if nella_riga <> nelle_tab then differenze := differenze || (gruppo || ': conteggio diverso'); end if;
    if mancanti > 0 then differenze := differenze || (gruppo || ': ' || mancanti || ' mancanti nelle tabelle'); end if;
    if in_piu > 0 then differenze := differenze || (gruppo || ': ' || in_piu || ' in più nelle tabelle'); end if;
  end loop;

  -- Porte: chiave (serata, nome).
  select count(*) into nella_riga from jsonb_array_elements(coalesce(a->'porte', '[]'::jsonb));
  select count(*) into nelle_tab from public.porte;
  select count(*) into mancanti from jsonb_array_elements(coalesce(a->'porte', '[]'::jsonb)) x
    where not exists (select 1 from public.porte t where t.evento_id = (x->>'eventoId')::uuid and t.nome = x->>'nome');
  conteggi := conteggi || jsonb_build_object('porte', jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
  if nella_riga <> nelle_tab or mancanti > 0 then differenze := differenze || 'porte: diverse'::text; end if;

  -- Pagamenti: principali e "in più" di tutte le iscrizioni.
  with p as (
    select i->'pagamentoOnline'->>'pagamento' as id
      from jsonb_array_elements(coalesce(a->'iscrizioni', '[]'::jsonb)) i
     where nullif(i->'pagamentoOnline'->>'pagamento', '') is not null
    union all
    select x->>'pagamento'
      from jsonb_array_elements(coalesce(a->'iscrizioni', '[]'::jsonb)) i,
           jsonb_array_elements(coalesce(i->'pagamentoOnline'->'inPiu', '[]'::jsonb)) x)
  select count(*), count(*) filter (where not exists (select 1 from public.pagamenti t where t.id = p.id)) into nella_riga, mancanti from p;
  select count(*) into nelle_tab from public.pagamenti;
  conteggi := conteggi || jsonb_build_object('pagamenti', jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
  if nella_riga <> nelle_tab or mancanti > 0 then differenze := differenze || 'pagamenti: diversi'::text; end if;

  -- Accessi: contano quelli di utenti che esistono.
  select count(*), count(*) filter (where not exists (select 1 from public.accessi t where t.id = (x->>'id')::uuid))
    into nella_riga, mancanti
    from jsonb_array_elements(coalesce(a->'accessi', '[]'::jsonb)) x
   where exists (select 1 from jsonb_array_elements(coalesce(a->'utenti', '[]'::jsonb)) u where u->>'id' = x->>'utenteId');
  select count(*) into nelle_tab from public.accessi;
  conteggi := conteggi || jsonb_build_object('accessi', jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
  if nella_riga <> nelle_tab or mancanti > 0 then differenze := differenze || 'accessi: diversi'::text; end if;

  -- Segreto: solo l'impronta (md5), mai il valore.
  select coalesce((select md5(valore) from public.impostazioni where chiave = 'segreto') = md5(a->>'segreto'), false) into segreto_ok;
  if not segreto_ok then differenze := differenze || 'segreto: impronta diversa'::text; end if;

  -- La riga non deve essere cambiata dopo la copia (qualcuno ha scritto: si rifà).
  select coalesce((select valore from public.impostazioni where chiave = 'importato_da_versione') = v::text, false) into versione_ok;
  if not versione_ok then differenze := differenze || 'versione: la riga è cambiata dopo la copia'::text; end if;

  return jsonb_build_object('ok', cardinality(differenze) = 0, 'conteggi', conteggi, 'differenze', to_jsonb(differenze),
    'segreto_ok', segreto_ok, 'versione_ok', versione_ok, 'versione', v);
end $$;

-- ---------------------------------------------------------------- permessi sulle funzioni
revoke execute on function public.chiave_cognome(text) from public, anon, authenticated;
revoke execute on function public.tiene_posto(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.crea_iscrizione(uuid, uuid, uuid, uuid, text, text, date, text, text, text, text, numeric, text, text, boolean, timestamptz, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.conferma_pagamento_iscrizione(uuid, text, integer, text, boolean, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.avvia_rimborso(text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.rimborso_respinto(text) from public, anon, authenticated;
revoke execute on function public.concludi_rimborso(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.segna_ingresso(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.usa_accesso_token(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.usa_accesso_codice(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.scadenze_iscrizioni(timestamptz) from public, anon, authenticated;
revoke execute on function public.anonimizza_iscrizioni(jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.importa_archivio() from public, anon, authenticated;
revoke execute on function public.verifica_importo() from public, anon, authenticated;
grant execute on function public.chiave_cognome(text) to service_role;
grant execute on function public.tiene_posto(text, timestamptz, timestamptz) to service_role;
grant execute on function public.crea_iscrizione(uuid, uuid, uuid, uuid, text, text, date, text, text, text, text, numeric, text, text, boolean, timestamptz, boolean, timestamptz) to service_role;
grant execute on function public.conferma_pagamento_iscrizione(uuid, text, integer, text, boolean, boolean, timestamptz) to service_role;
grant execute on function public.avvia_rimborso(text, text, text, timestamptz) to service_role;
grant execute on function public.rimborso_respinto(text) to service_role;
grant execute on function public.concludi_rimborso(text, text, timestamptz) to service_role;
grant execute on function public.segna_ingresso(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.usa_accesso_token(text, timestamptz) to service_role;
grant execute on function public.usa_accesso_codice(uuid, text, timestamptz) to service_role;
grant execute on function public.scadenze_iscrizioni(timestamptz) to service_role;
grant execute on function public.anonimizza_iscrizioni(jsonb, timestamptz) to service_role;
grant execute on function public.importa_archivio() to service_role;
grant execute on function public.verifica_importo() to service_role;

-- Fa vedere subito all'API le tabelle e le funzioni nuove.
notify pgrst, 'reload schema';
