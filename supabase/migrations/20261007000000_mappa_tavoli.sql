-- Mappa dei tavoli: piantina del locale sulla serata e posizione di ogni tavolo in percentuale (0–100)
-- rispetto alla piantina, così vale a qualsiasi larghezza di schermo. Null = non ancora sulla mappa.

alter table public.eventi add column piantina_url text;

alter table public.tavoli add column x numeric(4,1) check (x is null or x between 0 and 100);
alter table public.tavoli add column y numeric(4,1) check (y is null or y between 0 and 100);
alter table public.tavoli add constraint tavoli_posizione_intera check ((x is null) = (y is null));
