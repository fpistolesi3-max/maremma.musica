-- Schema relazionale, tappa 4: la lettura dalle tabelle. Una sola funzione, `leggi_tutto()`, che restituisce in un solo viaggio tutte le
-- tabelle come righe JSON (stessi nomi di colonna): lib/dati/tabelle.ts le ricompone nell'oggetto `Archivio` che il resto del codice
-- già conosce. Vedi PIANO-SCHEMA.md, sezione 2.4 ("Lettura").
-- Il codice dell'app la chiama SOLO con l'interruttore MM_ARCHIVIO=tabelle (spento di default): finché è spento il sito legge e scrive
-- la riga unica `archivio_mvp` e questa migrazione non cambia nulla. Richiede le tappe 1, 2 e 3.
--
-- È una lettura "di passaggio": va bene finché i dati sono pochi (una serata con centinaia di prevendite pesa qualche centinaio di kB);
-- prima di serate vere si passa a letture per serata (tappa 8). Un solo JSON, quindi il limite delle 1000 righe per richiesta di
-- Supabase non c'entra.

do $$
begin
  if to_regclass('public.prenotazioni_tavoli') is null or to_regclass('public.pagamenti') is null or to_regclass('public.eventi') is null then
    raise exception 'Servono prima le tappe 1, 2 e 3 (20261104…, 20261105…, 20261106…)' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.leggi_tutto()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'adesso',        now(),
    'impostazioni',  coalesce((select jsonb_object_agg(chiave, valore) from public.impostazioni), '{}'::jsonb),
    'eventi',        coalesce((select jsonb_agg(to_jsonb(t) order by t.data, t.id) from public.eventi t), '[]'::jsonb),
    'lotti',         coalesce((select jsonb_agg(to_jsonb(t) order by t.evento_id, t.ordine, t.id) from public.lotti t), '[]'::jsonb),
    'pr',            coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.pr t), '[]'::jsonb),
    'utenti',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.utenti t), '[]'::jsonb),
    'accessi',       coalesce((select jsonb_agg(to_jsonb(t) order by t.scade, t.id) from public.accessi t), '[]'::jsonb),
    'porte',         coalesce((select jsonb_agg(to_jsonb(t) order by t.evento_id, t.nome) from public.porte t), '[]'::jsonb),
    'iscrizioni',    coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.iscrizioni t), '[]'::jsonb),
    'pagamenti',     coalesce((select jsonb_agg(to_jsonb(t) order by t.at, t.id) from public.pagamenti t), '[]'::jsonb),
    'tavoli',        coalesce((select jsonb_agg(to_jsonb(t) order by t.evento_id, t.ordine, t.id) from public.tavoli t), '[]'::jsonb),
    'prenotazioni',  coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from public.prenotazioni_tavoli t), '[]'::jsonb),
    'ingressi',      coalesce((select jsonb_agg(to_jsonb(t) order by t.ora, t.id) from public.ingressi_tavoli t), '[]'::jsonb),
    'posta',         coalesce((select jsonb_agg(to_jsonb(t) order by t.inviata_at, t.id) from public.posta_inviata t), '[]'::jsonb)
  )
$$;

revoke execute on function public.leggi_tutto() from public, anon, authenticated;
grant execute on function public.leggi_tutto() to service_role;

-- Fa vedere subito all'API la funzione nuova.
notify pgrst, 'reload schema';
