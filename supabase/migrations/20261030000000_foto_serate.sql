-- Foto delle serate (sezione "Foto" della scheda serata, pagina della serata passata, Galleria e home).
-- I dati stanno fuori dalla riga `archivio_mvp`, che si riscrive per intero a ogni vendita: una riga per foto.
-- Le legge e le scrive solo il server con la service role (lib/dati/foto.ts), dopo il controllo del ruolo admin.
-- `evento_id` non ha una chiave esterna perché, finché gli eventi stanno nella riga jsonb, non c'è una tabella
-- a cui puntare: con lo schema relazionale (…_schema.sql) si aggiunge `references public.eventi (id) on delete cascade`.

create table if not exists public.foto_serate (
  id           uuid primary key,
  evento_id    text not null,
  ordine       integer not null default 0,
  in_evidenza  boolean not null default false,
  nascosta     boolean not null default false,
  larghezza    integer not null default 0,
  altezza      integer not null default 0,
  byte         integer not null default 0,
  -- false finché il browser non ha caricato i due file e il server non li ha controllati
  pronta       boolean not null default false,
  creata_at    timestamptz not null default now()
);
create index if not exists foto_serate_evento on public.foto_serate (evento_id, ordine);

-- Credito al fotografo ("Foto di …"): uno per serata, facoltativo.
create table if not exists public.serate_foto_credito (
  evento_id  text primary key,
  credito    text not null check (char_length(credito) <= 80)
);

-- RLS attiva e nessuna policy: anon e authenticated non vedono niente. Il pubblico vede le foto dal sito.
alter table public.foto_serate enable row level security;
alter table public.serate_foto_credito enable row level security;
revoke all on public.foto_serate, public.serate_foto_credito from anon, authenticated;
grant all on table public.foto_serate, public.serate_foto_credito to service_role;

-- Bucket pubblico in lettura, solo JPEG/WebP, al massimo 1,5 MB a file (il browser riduce ogni foto prima di caricarla).
-- Non c'è nessuna policy di scrittura: si carica solo con gli indirizzi firmati che il server rilascia agli admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-serate', 'foto-serate', true, 1572864, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;
