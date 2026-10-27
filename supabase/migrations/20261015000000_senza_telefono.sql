-- Serate senza telefono: alla porta non si mostra il QR, lo staff controlla nome, cognome e data di nascita sul documento.
-- Colonna sulla tabella eventi, che ha già le sue policy (lettura pubblica se pubblicata, scrittura solo admin).
alter table public.eventi
  add column senza_telefono boolean not null default false;
