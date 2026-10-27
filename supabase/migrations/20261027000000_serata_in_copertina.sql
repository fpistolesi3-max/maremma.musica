-- Serata in copertina nella home: la sceglie l'admin, una alla volta (la regola sta nel codice).
-- Senza nessuna scelta la home mostra la prossima data. L'archivio jsonb non cambia: il campo è facoltativo.
-- Colonna sulla tabella eventi, che ha già le sue policy (lettura pubblica se pubblicata, scrittura solo admin).
alter table public.eventi
  add column in_copertina boolean not null default false;
