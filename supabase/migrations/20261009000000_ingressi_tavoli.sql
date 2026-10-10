-- Ingressi alla porta con il QR del tavolo: uno per persona, fino al numero prenotato.
-- `rif` è l'id del movimento creato dal telefono della porta: la stessa sincronizzazione ripetuta non conta due volte.

create table public.ingressi_tavoli (
  id               uuid primary key default gen_random_uuid(),
  prenotazione_id  uuid not null references public.prenotazioni_tavoli(id) on delete cascade,
  rif              text not null,
  ora              timestamptz not null,
  porta            text not null,
  unique (prenotazione_id, rif)
);
create index ingressi_tavoli_prenotazione_idx on public.ingressi_tavoli (prenotazione_id);

alter table public.ingressi_tavoli enable row level security;
create policy ingressi_tavoli_staff_admin on public.ingressi_tavoli for select to authenticated using (public.is_staff_o_admin());
