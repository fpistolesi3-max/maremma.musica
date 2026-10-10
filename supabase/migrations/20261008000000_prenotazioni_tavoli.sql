-- Prenotazione dei tavoli: richiesta dal sito o dal PR, pagamento anticipato della spesa minima entro un termine,
-- conferma dell'admin. Le richieste le crea solo il server (service role), come le iscrizioni.

-- A quali PR è affidato il tavolo: null = tutti (se visibile_da_pr), altrimenti solo quelli elencati.
alter table public.tavoli add column pr_abilitati uuid[];

create type public.stato_prenotazione as enum ('in_attesa', 'confermata', 'annullata', 'scaduta');

create table public.prenotazioni_tavoli (
  id                  uuid primary key default gen_random_uuid(),
  tavolo_id           uuid not null references public.tavoli(id) on delete restrict,
  evento_id           uuid not null references public.eventi(id) on delete restrict,
  pr_id               uuid references public.pr(id) on delete set null,   -- null = Maremma Musica
  nome                text not null check (length(btrim(nome)) between 1 and 80),
  cognome             text not null check (length(btrim(cognome)) between 1 and 80),
  email               text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono            text not null,
  persone             integer not null check (persone between 1 and 99),
  spesa_minima        numeric(8,2) not null check (spesa_minima >= 0),    -- quella del tavolo al momento della richiesta
  stato               public.stato_prenotazione not null default 'in_attesa',
  scade               timestamptz not null,                                -- termine per pagare
  token_qr            text not null unique,                                -- un solo QR per tutto il tavolo
  codice              text not null unique,
  inserita_da         text not null default 'cliente' check (inserita_da in ('cliente', 'pr')),
  consenso_privacy_at timestamptz not null,
  created_at          timestamptz not null default now(),
  pagato_at           timestamptz,
  chiusa_at           timestamptz
);
-- Un tavolo ha al massimo una prenotazione attiva: due richieste insieme non lo prendono entrambe.
create unique index prenotazioni_tavolo_attiva on public.prenotazioni_tavoli (tavolo_id) where stato in ('in_attesa', 'confermata');
create index prenotazioni_evento_idx on public.prenotazioni_tavoli (evento_id, created_at desc);
create index prenotazioni_pr_idx on public.prenotazioni_tavoli (pr_id, evento_id);
create index prenotazioni_scadenza_idx on public.prenotazioni_tavoli (scade) where stato = 'in_attesa';

alter table public.prenotazioni_tavoli enable row level security;
create policy prenotazioni_admin on public.prenotazioni_tavoli for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Il PR legge solo le proprie (stessa regola delle iscrizioni).
create policy prenotazioni_pr on public.prenotazioni_tavoli for select to authenticated
  using (pr_id = public.pr_corrente());
