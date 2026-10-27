-- Anonimizzazione delle iscrizioni: 30 giorni dopo la serata (lib/dati/prevendita.ts, anonimizzaIscrizioniVecchie, lanciata dal
-- cron giornaliero) nome, cognome, email e data di nascita si cancellano. La riga resta: età alla serata, tipo di prevendita
-- (lotto_id, categoria), importo, PR o sito (pr_id), data d'acquisto (created_at), ingresso (stato, ora_check_in). Il consenso
-- marketing non si tocca. Nell'archivio attuale (jsonb) i campi cancellati sono stringhe vuote; qui diventano null.

alter table public.iscrizioni
  add column anonimizzata    boolean not null default false,
  add column eta_alla_serata smallint check (eta_alla_serata is null or eta_alla_serata between 0 and 130),
  add column anonimizzata_at timestamptz;

alter table public.iscrizioni
  alter column nome         drop not null,
  alter column cognome      drop not null,
  alter column data_nascita drop not null;
-- (email è già nullable dalla migrazione dell'ingresso in cassa)

-- I controlli sui dati personali valgono solo per le righe non anonimizzate; una riga anonima non ne ha nessuno.
alter table public.iscrizioni drop constraint if exists iscrizioni_nome_check;
alter table public.iscrizioni drop constraint if exists iscrizioni_cognome_check;
alter table public.iscrizioni drop constraint if exists iscrizioni_email_check;
alter table public.iscrizioni add constraint iscrizioni_dati_personali check (
  (not anonimizzata
    and length(btrim(nome)) between 1 and 80
    and length(btrim(cognome)) between 1 and 80
    and data_nascita is not null
    and ((origine = 'cassa' and email is null) or (origine = 'lista' and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')))
  or (anonimizzata
    and nome is null and cognome is null and data_nascita is null and email is null)
);

-- Un solo biglietto per persona: l'indice vale solo per le righe con i dati ancora presenti, così due righe anonime
-- della stessa serata non si scontrano.
drop index public.iscrizioni_unica_persona;
create unique index iscrizioni_unica_persona
  on public.iscrizioni (evento_id, lower(btrim(cognome)), data_nascita)
  where not anonimizzata and stato not in ('annullato', 'rimborsato');
