-- Pagamento online dei tavoli (Stripe Checkout): il cliente paga sul sito e la prenotazione si conferma da sola.
-- Stesse regole di lib/dati/tavoli.ts (confermaPagamentoOnline, lasciaTavolo, chiudiRimborsoDovuto).
-- Le scritture le fa solo il server (service role): il webhook di Stripe arriva al server, mai al database.

alter type public.metodo_tavolo add value if not exists 'online';

alter table public.prenotazioni_tavoli
  add column pagamento_online   boolean not null default false, -- si paga sul sito (false = a mano, segna l'admin)
  add column pagamento_sessione text,                            -- ultima pagina di pagamento aperta
  add column pagamento_id       text,                            -- pagamento riuscito: serve per il rimborso
  add column da_rimborsare      boolean not null default false;  -- pagata quando il tavolo era già di un altro

-- Lo stesso pagamento non conferma due prenotazioni (il webhook può arrivare più volte).
create unique index prenotazioni_pagamento_id on public.prenotazioni_tavoli (pagamento_id) where pagamento_id is not null;
-- Per l'admin: i pagamenti da restituire saltano all'occhio.
create index prenotazioni_da_rimborsare on public.prenotazioni_tavoli (evento_id) where da_rimborsare;

-- Tutti i pagamenti passano dal sito: per un tavolo venduto a voce la richiesta la inserisce la crew (admin) e il
-- cliente paga dal link, come quando la inserisce il PR. 'crew' si aggiunge a chi può inserire una richiesta.
-- I metodi a mano (bonifico, satispay, contanti, pos) restano nel tipo solo per le prenotazioni già segnate così.
alter table public.prenotazioni_tavoli drop constraint if exists prenotazioni_tavoli_inserita_da_check;
alter table public.prenotazioni_tavoli add constraint prenotazioni_tavoli_inserita_da_check
  check (inserita_da in ('cliente', 'pr', 'crew'));
