-- Archivio provvisorio per l'istanza online di test (Vercel).
-- L'intero archivio dell'app sta in una riga jsonb: lo legge e lo scrive solo il server con la service role
-- (lib/dati/archivio-remoto.ts), con controllo di versione per non perdere scritture simultanee.
-- Da sostituire con le tabelle relazionali (…_schema.sql) prima del lancio.

create table if not exists public.archivio_mvp (
  id          integer primary key check (id = 1),
  versione    bigint not null default 1,
  dati        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- RLS attiva e nessuna policy: anon e authenticated non vedono niente (iscrizioni, email, segreto).
alter table public.archivio_mvp enable row level security;
revoke all on public.archivio_mvp from anon, authenticated;
-- Sui progetti nuovi i permessi automatici per l'API possono mancare: li diamo esplicitamente al server.
grant all on table public.archivio_mvp to service_role;

-- Locandine: bucket pubblico in lettura; si scrive solo dal server (service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('locandine', 'locandine', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
