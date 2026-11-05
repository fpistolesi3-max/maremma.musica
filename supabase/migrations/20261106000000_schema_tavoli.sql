-- Schema relazionale, tappa 3 di 3: i tavoli (tavoli, prenotazioni, ingressi) e le funzioni che li rendono sicuri quando più persone
-- agiscono insieme. Vedi PIANO-SCHEMA.md, sezioni 2.2 e 2.4.
-- Il codice dell'app NON usa ancora queste tabelle e queste funzioni: finché l'interruttore MM_ARCHIVIO resta spento il sito
-- legge e scrive la riga unica `archivio_mvp`. Questa migrazione quindi non cambia nulla per il sito.
-- Richiede la tappa 1 (20261104000000_schema_anagrafiche.sql) e la tappa 2 (20261105000000_schema_vendite.sql): se mancano si ferma
-- subito, senza creare niente.
--
-- Lo stato di un tavolo (libero / riservato / confermato) NON si salva più: lo decide la prenotazione attiva (vista `tavoli_con_stato`).
-- Un tavolo ha una colonna `in_vendita`; "non in vendita" è `in_vendita = false`.

do $$
begin
  if to_regclass('public.eventi') is null or to_regclass('public.pr') is null or to_regclass('public.utenti') is null
     or to_regclass('public.impostazioni') is null then
    raise exception 'Serve prima la tappa 1 (20261104000000_schema_anagrafiche.sql)' using errcode = 'P0001';
  end if;
  if to_regclass('public.iscrizioni') is null or to_regclass('public.pagamenti') is null or to_regclass('public.accessi') is null then
    raise exception 'Serve prima la tappa 2 (20261105000000_schema_vendite.sql)' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------- tavoli
create table if not exists public.tavoli (
  id                    uuid primary key,
  evento_id             uuid not null references public.eventi (id) on delete cascade,
  nome                  text not null check (length(btrim(nome)) between 1 and 40),     -- T4, Privé 2…
  zona                  text,                                                           -- Pista, Privé, Terrazza…
  posti                 integer check (posti is null or posti between 1 and 99),
  spesa_minima          numeric(8,2) not null default 0 check (spesa_minima >= 0),
  in_vendita            boolean not null default true,
  nota                  text,                                                           -- solo admin
  visibile_da_pr        boolean not null default true,
  pr_abilitati          uuid[],                                                         -- null = tutti (se visibile_da_pr)
  ordine                integer not null default 0,
  x                     numeric(4,1) check (x is null or x between 0 and 100),          -- posizione sulla mappa, in % della piantina
  y                     numeric(4,1) check (y is null or y between 0 and 100),
  constraint tavoli_posizione_intera check ((x is null) = (y is null))
);
create unique index if not exists tavoli_nome_per_evento on public.tavoli (evento_id, lower(btrim(nome)));
create index if not exists tavoli_evento_idx on public.tavoli (evento_id, ordine);

-- ---------------------------------------------------------------- prenotazioni dei tavoli
create table if not exists public.prenotazioni_tavoli (
  id                    uuid primary key,
  tavolo_id             uuid not null references public.tavoli (id) on delete restrict,
  evento_id             uuid not null references public.eventi (id) on delete restrict,
  pr_id                 uuid references public.pr (id) on delete set null,              -- null = Maremma Musica
  nome                  text,
  cognome               text,
  email                 text,
  telefono              text,
  -- Ultime 9 cifre del telefono (come `cifre()` in lib/dati/tavoli.ts): "un tavolo per telefono" anche con email diverse.
  telefono_cifre        text generated always as (nullif(right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 9), '')) stored,
  persone               integer not null check (persone between 1 and 99),
  spesa_minima          numeric(8,2) not null check (spesa_minima >= 0),                -- quella del tavolo al momento della richiesta
  stato                 text not null default 'in_attesa'
                          check (stato in ('in_attesa', 'confermata', 'annullata', 'rimborsata', 'scaduta')),
  scade                 timestamptz not null,                                           -- termine per pagare
  token_qr              text not null unique,                                           -- un solo QR per tutto il tavolo
  codice                text not null unique,
  inserita_da           text not null default 'cliente' check (inserita_da in ('cliente', 'pr', 'crew')),
  consenso_privacy_at   timestamptz not null,
  created_at            timestamptz not null default now(),
  pagato_at             timestamptz,
  metodo_pagamento      text check (metodo_pagamento is null or metodo_pagamento in ('bonifico', 'satispay', 'contanti', 'pos', 'online')),
  pagato_da             text,
  chiusa_at             timestamptz,                                                    -- annullata, rimborsata o scaduta
  chiusa_da             text,                                                           -- null = scaduta da sola
  promemoria_at         timestamptz,                                                    -- promemoria del termine già mandato
  avviso_chiusura_at    timestamptz,                                                    -- email "prenotazione chiusa" già mandata al cliente
  pagamento_online      boolean not null default false,
  pagamento_sessione    text,
  anonimizzata          boolean not null default false,
  anonimizzata_at       timestamptz,
  -- Il metodo c'è solo su una prenotazione pagata.
  constraint prenotazioni_pagamento_coerente check (metodo_pagamento is null or pagato_at is not null),
  -- Dati personali presenti e validi, oppure tutti cancellati (anonimizza_prenotazioni).
  constraint prenotazioni_dati_personali check (
    (not anonimizzata
      and nome is not null and length(btrim(nome)) between 1 and 80
      and cognome is not null and length(btrim(cognome)) between 1 and 80
      and email is not null and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
      and telefono is not null and length(btrim(telefono)) > 0)
    or (anonimizzata and nome is null and cognome is null and email is null and telefono is null))
);
-- Un tavolo ha al massimo una prenotazione attiva: due richieste insieme non lo prendono entrambe.
create unique index if not exists prenotazioni_tavolo_attiva on public.prenotazioni_tavoli (tavolo_id) where stato in ('in_attesa', 'confermata');
-- Un cliente tiene fermo un solo tavolo per serata (per email e per telefono). Il PR e la crew possono inserirne più d'uno per clienti diversi.
create unique index if not exists prenotazioni_cliente_email on public.prenotazioni_tavoli (evento_id, email)
  where inserita_da = 'cliente' and stato in ('in_attesa', 'confermata') and email is not null;
create unique index if not exists prenotazioni_cliente_telefono on public.prenotazioni_tavoli (evento_id, telefono_cifre)
  where inserita_da = 'cliente' and stato in ('in_attesa', 'confermata') and telefono_cifre is not null;
create index if not exists prenotazioni_evento_idx on public.prenotazioni_tavoli (evento_id, created_at desc);
create index if not exists prenotazioni_pr_idx on public.prenotazioni_tavoli (pr_id, evento_id);
create index if not exists prenotazioni_email_idx on public.prenotazioni_tavoli (lower(email)) where email is not null;
create index if not exists prenotazioni_scadenza_idx on public.prenotazioni_tavoli (scade) where stato = 'in_attesa';

-- ---------------------------------------------------------------- ingressi dei tavoli
-- `rif` è l'id del movimento creato dal telefono della porta: la stessa sincronizzazione ripetuta non conta due volte.
create table if not exists public.ingressi_tavoli (
  id                    uuid primary key default gen_random_uuid(),
  prenotazione_id       uuid not null references public.prenotazioni_tavoli (id) on delete cascade,
  rif                   text not null,
  ora                   timestamptz not null,
  porta                 text not null,
  unique (prenotazione_id, rif)
);

-- I pagamenti dei tavoli ora hanno la loro chiave esterna.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pagamenti_prenotazione_fk' and conrelid = 'public.pagamenti'::regclass) then
    alter table public.pagamenti
      add constraint pagamenti_prenotazione_fk foreign key (prenotazione_id) references public.prenotazioni_tavoli (id) on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------- vista: lo stato del tavolo
-- libero / riservato (c'è una richiesta in attesa nel termine) / confermato (pagata) / non_in_vendita.
-- `adesso` è l'istante del database: una richiesta in attesa col termine passato non tiene più il tavolo.
create or replace view public.tavoli_con_stato with (security_invoker = true) as
select t.*,
  case
    when not t.in_vendita then 'non_in_vendita'
    when exists (select 1 from public.prenotazioni_tavoli p where p.tavolo_id = t.id and p.stato = 'confermata') then 'confermato'
    when exists (select 1 from public.prenotazioni_tavoli p where p.tavolo_id = t.id and p.stato = 'in_attesa' and p.scade > now()) then 'riservato'
    else 'libero'
  end as stato
from public.tavoli t;

-- ---------------------------------------------------------------- permessi
alter table public.tavoli enable row level security;
alter table public.prenotazioni_tavoli enable row level security;
alter table public.ingressi_tavoli enable row level security;
revoke all on public.tavoli, public.prenotazioni_tavoli, public.ingressi_tavoli, public.tavoli_con_stato from anon, authenticated;
grant all on table public.tavoli, public.prenotazioni_tavoli, public.ingressi_tavoli, public.tavoli_con_stato to service_role;

-- ---------------------------------------------------------------- prenota_tavolo()
-- Richiesta di un tavolo, con i controlli nello stesso passaggio: due richieste insieme non prendono lo stesso tavolo.
-- Il codice ha già validato i dati, la serata (pubblicata, non iniziata), il link del PR e calcolato il termine (`p_scade`).
-- Prima si blocca il tavolo (sempre prima della prenotazione, come in conferma_pagamento_prenotazione: niente blocchi incrociati),
-- poi: decadono le richieste scadute di questo tavolo; per un cliente si chiude anche la sua pagina di pagamento lasciata a metà;
-- infine si controlla che il tavolo sia libero e che il cliente non ne tenga già un altro.
-- Risponde: creata | tavolo_non_disponibile | email_gia | telefono_gia | tavolo_sconosciuto.
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

-- ---------------------------------------------------------------- conferma_pagamento_prenotazione()
-- Pagamento riuscito (webhook di Stripe, ritorno del cliente, controllo giornaliero, pagina di prova). Idempotente sul pagamento.
-- Il codice passa `p_importo_ok` (importo e valuta coincidono con la spesa minima). Le ragioni che dipendono dalle gare le decide
-- il database: richiesta chiusa o tavolo ormai di un altro (`ordine_chiuso`), secondo pagamento.
-- Una richiesta scaduta da poco vale lo stesso se il tavolo è ancora libero.
-- Risponde: confermata | gia | da_rimborsare (con `motivo`, `principale`) | sconosciuta.
create or replace function public.conferma_pagamento_prenotazione(
  p_id uuid, p_pagamento text, p_centesimi integer, p_valuta text,
  p_importo_ok boolean default true,
  p_adesso timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p        public.prenotazioni_tavoli;
  t        public.tavoli;
  v_tavolo uuid;
  v_valida boolean;
begin
  -- Prima il tavolo, poi la prenotazione (stesso ordine di prenota_tavolo): due conferme dello stesso ordine si mettono in fila.
  select tavolo_id into v_tavolo from public.prenotazioni_tavoli where id = p_id;
  if not found then return jsonb_build_object('esito', 'sconosciuta'); end if;
  select * into t from public.tavoli where id = v_tavolo for update;
  select * into p from public.prenotazioni_tavoli where id = p_id for update;
  if exists (select 1 from public.pagamenti where id = p_pagamento) then return jsonb_build_object('esito', 'gia'); end if;

  if not p_importo_ok then
    insert into public.pagamenti (id, prenotazione_id, ruolo, centesimi, valuta, motivo, da_rimborsare, at)
    values (p_pagamento, p.id, 'in_piu', p_centesimi, lower(p_valuta), 'importo', true, p_adesso);
    return jsonb_build_object('esito', 'da_rimborsare', 'motivo', 'importo', 'principale', false, 'centesimi', p_centesimi);
  end if;
  -- Ha già un pagamento (due pagine di pagamento aperte, pagate entrambe): la prenotazione resta com'è.
  if exists (select 1 from public.pagamenti where prenotazione_id = p.id and ruolo = 'principale') then
    insert into public.pagamenti (id, prenotazione_id, ruolo, centesimi, valuta, motivo, da_rimborsare, at)
    values (p_pagamento, p.id, 'in_piu', p_centesimi, lower(p_valuta), 'secondo_pagamento', true, p_adesso);
    return jsonb_build_object('esito', 'da_rimborsare', 'motivo', 'secondo_pagamento', 'principale', false, 'centesimi', p_centesimi);
  end if;

  -- In attesa (anche col termine appena passato) tiene ancora il tavolo; scaduta lo riprende solo se è rimasto libero.
  v_valida := p.stato = 'in_attesa' or (p.stato = 'scaduta' and t.in_vendita);
  if v_valida and exists (select 1 from public.prenotazioni_tavoli x where x.tavolo_id = p.tavolo_id and x.id <> p.id and x.stato in ('in_attesa', 'confermata')) then
    v_valida := false;
  end if;

  insert into public.pagamenti (id, prenotazione_id, ruolo, centesimi, valuta, motivo, da_rimborsare, at)
  values (p_pagamento, p.id, 'principale', p_centesimi, lower(p_valuta), case when v_valida then null else 'ordine_chiuso' end, not v_valida, p_adesso);
  update public.prenotazioni_tavoli
     set pagato_at = p_adesso, metodo_pagamento = 'online', pagato_da = 'pagamento online', pagamento_online = true,
         stato = case when v_valida then 'confermata' else stato end,
         chiusa_at = case when v_valida then null else chiusa_at end,
         avviso_chiusura_at = case when v_valida then null else avviso_chiusura_at end
   where id = p.id;
  if v_valida then return jsonb_build_object('esito', 'confermata'); end if;
  return jsonb_build_object('esito', 'da_rimborsare', 'motivo', 'ordine_chiuso', 'principale', true, 'centesimi', p_centesimi);
end $$;

-- ---------------------------------------------------------------- annulla_prenotazione()
-- Annulla una richiesta non pagata e libera il tavolo (che è libero da solo: lo stato è derivato). Vale per l'admin, per il PR sulle
-- sue richieste e per il cliente che lascia il tavolo: chi può farlo lo decide il codice. `p_da` = email di chi l'ha chiusa.
-- Una prenotazione pagata non si annulla da qui (si restituiscono i soldi: concludi_rimborso).
-- Risponde: annullata (solo la prima volta: l'email parte una volta sola) | gia_chiusa | pagata | sconosciuta.
create or replace function public.annulla_prenotazione(p_id uuid, p_da text, p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare p public.prenotazioni_tavoli;
begin
  select * into p from public.prenotazioni_tavoli where id = p_id for update;
  if not found then return jsonb_build_object('esito', 'sconosciuta'); end if;
  if p.stato = 'confermata' then return jsonb_build_object('esito', 'pagata'); end if;
  if p.stato <> 'in_attesa' then return jsonb_build_object('esito', 'gia_chiusa'); end if;
  update public.prenotazioni_tavoli
     set stato = 'annullata', chiusa_at = p_adesso, chiusa_da = p_da, avviso_chiusura_at = p_adesso
   where id = p.id;
  return jsonb_build_object('esito', 'annullata');
end $$;

-- ---------------------------------------------------------------- scadenze, avvisi, promemoria
-- Le richieste non pagate in tempo decadono. Idempotente; restituisce quante ne ha chiuse.
create or replace function public.scadenze_prenotazioni(p_adesso timestamptz default now())
returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  update public.prenotazioni_tavoli set stato = 'scaduta', chiusa_at = p_adesso where stato = 'in_attesa' and scade <= p_adesso;
  get diagnostics n = row_count;
  return n;
end $$;

-- Richieste decadute da sole il cui cliente non sa ancora niente: le segna come avvisate e restituisce gli id, così l'email parte una
-- volta sola. Una pagina di pagamento lasciata a metà dal cliente non conta (lo sa già): solo le richieste inserite dal PR o dalla crew.
-- Il codice scarta poi le serate già passate.
create or replace function public.avvisi_chiusura(p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare ids jsonb;
begin
  update public.prenotazioni_tavoli set stato = 'scaduta', chiusa_at = p_adesso where stato = 'in_attesa' and scade <= p_adesso;
  with segnate as (
    update public.prenotazioni_tavoli set avviso_chiusura_at = p_adesso
     where stato = 'scaduta' and avviso_chiusura_at is null and inserita_da <> 'cliente'
     returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from segnate;
  return ids;
end $$;

-- Richieste inserite dal PR o dalla crew, ancora da pagare, il cui cliente ha il link da almeno `p_ore_minime` ore e che non hanno già
-- ricevuto il promemoria: le segna e restituisce gli id (una volta sola). Il numero di ore lo decide il codice.
create or replace function public.promemoria_prenotazioni(p_ore_minime integer, p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare ids jsonb;
begin
  update public.prenotazioni_tavoli set stato = 'scaduta', chiusa_at = p_adesso where stato = 'in_attesa' and scade <= p_adesso;
  with segnate as (
    update public.prenotazioni_tavoli set promemoria_at = p_adesso
     where stato = 'in_attesa' and pagamento_online and inserita_da <> 'cliente' and promemoria_at is null
       and created_at <= p_adesso - make_interval(hours => p_ore_minime) and scade > p_adesso
     returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into ids from segnate;
  return ids;
end $$;

-- ---------------------------------------------------------------- ingresso alla porta con il QR del tavolo
-- Una persona per passaggio, fino al numero prenotato. `p_rif` è l'id del movimento creato dal telefono: una sincronizzazione
-- ripetuta non conta due volte. La prenotazione si blocca: due telefoni insieme non fanno entrare più persone del prenotato.
-- Risponde: entrato | gia_contato (stesso `rif`) | completo | non_pagato | chiusa | sconosciuta; sempre con `entrati` e `persone`.
create or replace function public.ingresso_tavolo(p_prenotazione_id uuid, p_rif text, p_ora timestamptz, p_porta text, p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.prenotazioni_tavoli;
  n integer;
begin
  select * into p from public.prenotazioni_tavoli where id = p_prenotazione_id for update;
  if not found then return jsonb_build_object('esito', 'sconosciuta'); end if;
  select count(*) into n from public.ingressi_tavoli where prenotazione_id = p.id;
  if exists (select 1 from public.ingressi_tavoli where prenotazione_id = p.id and rif = p_rif) then
    return jsonb_build_object('esito', 'gia_contato', 'entrati', n, 'persone', p.persone);
  end if;
  if p.stato in ('annullata', 'rimborsata', 'scaduta') or (p.stato = 'in_attesa' and p.scade <= p_adesso) then
    return jsonb_build_object('esito', 'chiusa', 'entrati', n, 'persone', p.persone);
  end if;
  if p.stato <> 'confermata' then return jsonb_build_object('esito', 'non_pagato', 'entrati', n, 'persone', p.persone); end if;
  if n >= p.persone then return jsonb_build_object('esito', 'completo', 'entrati', n, 'persone', p.persone); end if;
  insert into public.ingressi_tavoli (prenotazione_id, rif, ora, porta) values (p.id, p_rif, p_ora, p_porta);
  return jsonb_build_object('esito', 'entrato', 'entrati', n + 1, 'persone', p.persone);
end $$;

-- ---------------------------------------------------------------- anonimizzazione
-- Cancella nome, cognome, email e telefono delle prenotazioni delle serate finite da più di `p_giorni` giorni. Restano serata, tavolo,
-- persone, spesa minima, PR, pagamenti e ingressi. La durata NON è fissata qui: la decide il chiamante (da concordare col cliente).
-- La fine di una serata è la chiusura, o 8 ore dopo l'apertura se manca (come `eventoPassato` in lib/regole.ts).
-- Idempotente; restituisce quante ne ha anonimizzate.
create or replace function public.anonimizza_prenotazioni(p_giorni integer, p_adesso timestamptz default now())
returns integer
language plpgsql security definer set search_path = ''
as $$
declare n integer;
begin
  if p_giorni is null or p_giorni < 0 then raise exception 'giorni_non_validi' using errcode = 'P0001'; end if;
  update public.prenotazioni_tavoli p
     set nome = null, cognome = null, email = null, telefono = null, anonimizzata = true, anonimizzata_at = p_adesso
    from public.eventi e
   where e.id = p.evento_id and not p.anonimizzata
     and coalesce(e.data_fine, e.data + interval '8 hours') < p_adesso - make_interval(days => p_giorni);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- concludi_rimborso() (estesa ai tavoli)
-- Come nella tappa 2; ora chiude anche la prenotazione di un tavolo (rimborsata: il tavolo torna libero da solo).
create or replace function public.concludi_rimborso(p_pagamento text, p_da text, p_adesso timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  x       public.pagamenti;
  o       public.iscrizioni;
  pr_     public.prenotazioni_tavoli;
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
      select * into pr_ from public.prenotazioni_tavoli where id = x.prenotazione_id for update;
      if found and pr_.stato <> 'rimborsata' then
        update public.prenotazioni_tavoli
           set stato = 'rimborsata', chiusa_at = p_adesso, chiusa_da = p_da, avviso_chiusura_at = p_adesso
         where id = pr_.id;
        v_chiuso := true;
      end if;
    end if;
  end if;
  return jsonb_build_object('esito', 'chiuso', 'chiusa_ordine', v_chiuso, 'iscrizione_id', x.iscrizione_id, 'prenotazione_id', x.prenotazione_id);
end $$;

-- ---------------------------------------------------------------- importa_archivio() (estesa)
-- Come nella tappa 2, più tavoli, prenotazioni, ingressi e pagamenti dei tavoli. Il `pagamentoOnline` di ogni ordine si spezza in righe
-- di `pagamenti`; lo stato dei tavoli non si copia (è derivato). Si ferma con un errore chiaro se la riga contiene ingressi in cassa
-- o consegne, che le tabelle non portano.
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
  if jsonb_array_length(coalesce(a->'consegne', '[]'::jsonb)) > 0
     or exists (select 1 from jsonb_array_elements(coalesce(a->'iscrizioni', '[]'::jsonb)) i where coalesce(i->>'origine', 'lista') <> 'lista') then
    raise exception 'cassa_e_consegne_non_supportate' using errcode = 'P0001';
  end if;

  -- Prima i figli, poi i genitori. `where true`: sui progetti Supabase un DELETE senza WHERE viene rifiutato anche dentro le funzioni.
  delete from public.pagamenti where true;
  delete from public.accessi where true;
  delete from public.ingressi_tavoli where true;
  delete from public.prenotazioni_tavoli where true;
  delete from public.iscrizioni where true;
  delete from public.tavoli where true;
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

  -- Tavoli: lo stato (libero / riservato / confermato) è derivato dalle prenotazioni, si copia solo "non in vendita".
  insert into public.tavoli (id, evento_id, nome, zona, posti, spesa_minima, in_vendita, nota, visibile_da_pr, pr_abilitati, ordine, x, y)
  select t.id, t."eventoId", t.nome, t.zona, t.posti, coalesce(t."spesaMinima", 0), coalesce(t.stato, 'libero') <> 'non_in_vendita', t.nota,
    coalesce(t."visibileDaPr", true),
    case when jsonb_typeof(t."prAbilitati") = 'array' then array(select jsonb_array_elements_text(t."prAbilitati")::uuid) end,
    coalesce(t.ordine, 0), t.x, t.y
  from jsonb_to_recordset(coalesce(a->'tavoli', '[]'::jsonb)) as t(
    id uuid, "eventoId" uuid, nome text, zona text, posti integer, "spesaMinima" numeric, stato text, nota text,
    "visibileDaPr" boolean, "prAbilitati" jsonb, ordine integer, x numeric, y numeric);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('tavoli', n);

  insert into public.prenotazioni_tavoli (
    id, tavolo_id, evento_id, pr_id, nome, cognome, email, telefono, persone, spesa_minima, stato, scade, token_qr, codice, inserita_da,
    consenso_privacy_at, created_at, pagato_at, metodo_pagamento, pagato_da, chiusa_at, chiusa_da, promemoria_at, avviso_chiusura_at,
    pagamento_online, pagamento_sessione)
  select p.id, p."tavoloId", p."eventoId", p."prId", p.nome, p.cognome, p.email, p.telefono, p.persone, coalesce(p."spesaMinima", 0),
    p.stato, p.scade, p."tokenQr", p.codice, coalesce(p."inseritaDa", 'cliente'), p."consensoPrivacyAt", p."createdAt", p."pagatoAt",
    p."metodoPagamento", p."pagatoDa", p."chiusaAt", p."chiusaDa", p."promemoriaAt", p."avvisoChiusuraAt",
    jsonb_typeof(p."pagamentoOnline") = 'object', p."pagamentoOnline"->>'sessione'
  from jsonb_to_recordset(coalesce(a->'prenotazioni', '[]'::jsonb)) as p(
    id uuid, "tavoloId" uuid, "eventoId" uuid, "prId" uuid, nome text, cognome text, email text, telefono text, persone integer,
    "spesaMinima" numeric, stato text, scade timestamptz, "tokenQr" text, codice text, "inseritaDa" text, "consensoPrivacyAt" timestamptz,
    "createdAt" timestamptz, "pagatoAt" timestamptz, "metodoPagamento" text, "pagatoDa" text, "chiusaAt" timestamptz, "chiusaDa" text,
    "promemoriaAt" timestamptz, "avvisoChiusuraAt" timestamptz, "pagamentoOnline" jsonb);
  get diagnostics n = row_count; esito := esito || jsonb_build_object('prenotazioni', n);

  insert into public.ingressi_tavoli (prenotazione_id, rif, ora, porta)
  select p.id, x->>'rif', (x->>'ora')::timestamptz, x->>'porta'
  from jsonb_to_recordset(coalesce(a->'prenotazioni', '[]'::jsonb)) as p(id uuid, ingressi jsonb),
    lateral jsonb_array_elements(coalesce(p.ingressi, '[]'::jsonb)) as x;
  get diagnostics n = row_count; esito := esito || jsonb_build_object('ingressi', n);

  -- Pagamenti: il principale (importo = prezzo dell'ordine, valuta euro) e gli "in più". Un rimborso c'è se la riga lo dice.
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
  n := n + m;
  -- Gli stessi per le prenotazioni dei tavoli.
  insert into public.pagamenti (id, prenotazione_id, ruolo, centesimi, valuta, motivo, da_rimborsare,
    rimborso_stato, rimborso_chiave, rimborso_avviato_at, rimborso_fatto_at, rimborso_da, at)
  select po->>'pagamento', t.id, 'principale', round(coalesce(t."spesaMinima", 0) * 100)::integer, 'eur', nullif(po->>'motivo', ''),
    coalesce((po->>'daRimborsare')::boolean, false),
    po->'rimborso'->>'stato', po->'rimborso'->>'chiave', (po->'rimborso'->>'avviatoAt')::timestamptz,
    (po->'rimborso'->>'fattoAt')::timestamptz, po->'rimborso'->>'da',
    coalesce(t."pagatoAt", t."createdAt")
  from jsonb_to_recordset(coalesce(a->'prenotazioni', '[]'::jsonb)) as t(
    id uuid, "spesaMinima" numeric, "pagatoAt" timestamptz, "createdAt" timestamptz, "pagamentoOnline" jsonb),
    lateral (select t."pagamentoOnline" as po) x
  where jsonb_typeof(t."pagamentoOnline") = 'object' and nullif(t."pagamentoOnline"->>'pagamento', '') is not null;
  get diagnostics m = row_count;
  n := n + m;
  insert into public.pagamenti (id, prenotazione_id, ruolo, centesimi, valuta, motivo, da_rimborsare,
    rimborso_stato, rimborso_chiave, rimborso_avviato_at, rimborso_fatto_at, rimborso_da, at)
  select p->>'pagamento', t.id, 'in_piu', (p->>'centesimi')::integer, lower(coalesce(p->>'valuta', 'eur')), p->>'motivo',
    coalesce(p->'rimborso'->>'stato', '') <> 'fatto',
    p->'rimborso'->>'stato', p->'rimborso'->>'chiave', (p->'rimborso'->>'avviatoAt')::timestamptz,
    (p->'rimborso'->>'fattoAt')::timestamptz, p->'rimborso'->>'da', (p->>'at')::timestamptz
  from jsonb_to_recordset(coalesce(a->'prenotazioni', '[]'::jsonb)) as t(id uuid, "pagamentoOnline" jsonb),
    lateral jsonb_array_elements(coalesce(t."pagamentoOnline"->'inPiu', '[]'::jsonb)) as p;
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
  gruppi      text[] := array['eventi', 'lotti', 'pr', 'utenti', 'iscrizioni', 'tavoli', 'prenotazioni'];
  tabelle     text[] := array['eventi', 'lotti', 'pr', 'utenti', 'iscrizioni', 'tavoli', 'prenotazioni_tavoli'];
  k           integer;
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

  -- Gruppi con chiave `id`.
  for k in 1 .. array_length(gruppi, 1) loop
    execute format('select count(*) from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb))', gruppi[k]) into nella_riga using a;
    execute format('select count(*) from public.%I', tabelle[k]) into nelle_tab;
    -- (`el` e non `x`: la tabella dei tavoli ha una colonna `x`, che prenderebbe il posto dell'elemento.)
    execute format('select count(*) from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb)) el where not exists (select 1 from public.%I t where t.id = (el->>''id'')::uuid)', gruppi[k], tabelle[k])
      into mancanti using a;
    execute format('select count(*) from public.%I t where not exists (select 1 from jsonb_array_elements(coalesce($1->%L, ''[]''::jsonb)) el where (el->>''id'')::uuid = t.id)', tabelle[k], gruppi[k])
      into in_piu using a;
    conteggi := conteggi || jsonb_build_object(gruppi[k], jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
    if nella_riga <> nelle_tab then differenze := differenze || (gruppi[k] || ': conteggio diverso'); end if;
    if mancanti > 0 then differenze := differenze || (gruppi[k] || ': ' || mancanti || ' mancanti nelle tabelle'); end if;
    if in_piu > 0 then differenze := differenze || (gruppi[k] || ': ' || in_piu || ' in più nelle tabelle'); end if;
  end loop;

  -- Porte: chiave (serata, nome).
  select count(*) into nella_riga from jsonb_array_elements(coalesce(a->'porte', '[]'::jsonb));
  select count(*) into nelle_tab from public.porte;
  select count(*) into mancanti from jsonb_array_elements(coalesce(a->'porte', '[]'::jsonb)) x
    where not exists (select 1 from public.porte t where t.evento_id = (x->>'eventoId')::uuid and t.nome = x->>'nome');
  conteggi := conteggi || jsonb_build_object('porte', jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
  if nella_riga <> nelle_tab or mancanti > 0 then differenze := differenze || 'porte: diverse'::text; end if;

  -- Ingressi dei tavoli: chiave (prenotazione, rif).
  select count(*), count(*) filter (where not exists (select 1 from public.ingressi_tavoli t where t.prenotazione_id = (y.id)::uuid and t.rif = y.rif))
    into nella_riga, mancanti
    from (select p->>'id' as id, x->>'rif' as rif
            from jsonb_array_elements(coalesce(a->'prenotazioni', '[]'::jsonb)) p,
                 jsonb_array_elements(coalesce(p->'ingressi', '[]'::jsonb)) x) y;
  select count(*) into nelle_tab from public.ingressi_tavoli;
  conteggi := conteggi || jsonb_build_object('ingressi', jsonb_build_object('riga', nella_riga, 'tabella', nelle_tab));
  if nella_riga <> nelle_tab or mancanti > 0 then differenze := differenze || 'ingressi: diversi'::text; end if;

  -- Pagamenti: principali e "in più" di tutte le iscrizioni e di tutte le prenotazioni.
  with ordini as (
    select o from jsonb_array_elements(coalesce(a->'iscrizioni', '[]'::jsonb)) o
    union all
    select o from jsonb_array_elements(coalesce(a->'prenotazioni', '[]'::jsonb)) o),
  p as (
    select o->'pagamentoOnline'->>'pagamento' as id from ordini where nullif(o->'pagamentoOnline'->>'pagamento', '') is not null
    union all
    select x->>'pagamento' from ordini, jsonb_array_elements(coalesce(o->'pagamentoOnline'->'inPiu', '[]'::jsonb)) x)
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
revoke execute on function public.prenota_tavolo(uuid, uuid, uuid, text, text, text, text, integer, timestamptz, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.conferma_pagamento_prenotazione(uuid, text, integer, text, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function public.annulla_prenotazione(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.scadenze_prenotazioni(timestamptz) from public, anon, authenticated;
revoke execute on function public.avvisi_chiusura(timestamptz) from public, anon, authenticated;
revoke execute on function public.promemoria_prenotazioni(integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.ingresso_tavolo(uuid, text, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.anonimizza_prenotazioni(integer, timestamptz) from public, anon, authenticated;
revoke execute on function public.concludi_rimborso(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.importa_archivio() from public, anon, authenticated;
revoke execute on function public.verifica_importo() from public, anon, authenticated;
grant execute on function public.prenota_tavolo(uuid, uuid, uuid, text, text, text, text, integer, timestamptz, text, text, text, timestamptz) to service_role;
grant execute on function public.conferma_pagamento_prenotazione(uuid, text, integer, text, boolean, timestamptz) to service_role;
grant execute on function public.annulla_prenotazione(uuid, text, timestamptz) to service_role;
grant execute on function public.scadenze_prenotazioni(timestamptz) to service_role;
grant execute on function public.avvisi_chiusura(timestamptz) to service_role;
grant execute on function public.promemoria_prenotazioni(integer, timestamptz) to service_role;
grant execute on function public.ingresso_tavolo(uuid, text, timestamptz, text, timestamptz) to service_role;
grant execute on function public.anonimizza_prenotazioni(integer, timestamptz) to service_role;
grant execute on function public.concludi_rimborso(text, text, timestamptz) to service_role;
grant execute on function public.importa_archivio() to service_role;
grant execute on function public.verifica_importo() to service_role;

-- Fa vedere subito all'API le tabelle e le funzioni nuove.
notify pgrst, 'reload schema';
