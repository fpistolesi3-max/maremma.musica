-- Prevendita in lista pagata online (Stripe): i nuovi valori dei tipi stanno in un file a sé,
-- perché Postgres non li lascia usare nella stessa transazione in cui li aggiunge (vedi 20261013000001).

-- in_attesa = prevendita chiesta, posto tenuto finché il cliente paga online; scaduta = non pagata in tempo.
alter type public.stato_iscrizione add value if not exists 'in_attesa';
alter type public.stato_iscrizione add value if not exists 'scaduta';
-- online = prevendita pagata sul sito. 'pr' (pagato al PR) resta nel tipo solo per i dati vecchi: non si usa più.
alter type public.metodo_pagamento add value if not exists 'online';
