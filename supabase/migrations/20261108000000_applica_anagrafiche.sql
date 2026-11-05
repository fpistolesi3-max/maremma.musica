-- Schema relazionale, tappa 5: la scrittura delle anagrafiche (serate, tipi di prevendita, PR, utenti, tavoli, porte, registro email).
-- Vedi PIANO-SCHEMA.md, sezione 2.4 ("Scritture dell'admin"). Una sola funzione, `applica_anagrafiche()`, che applica in una transazione
-- le righe nuove, cambiate o tolte che il codice ha calcolato confrontando "prima" e "dopo" (lib/dati/scrittura-tabelle.ts).
-- Il codice dell'app la chiama SOLO con l'interruttore MM_ARCHIVIO=tabelle (spento di default): finché è spento il sito legge e scrive la
-- riga unica `archivio_mvp`. Questa migrazione quindi non cambia nulla per il sito. Richiede le tappe 1, 2 e 3.
--
-- Conflitti: per ogni riga cambiata o tolta il codice manda anche com'era quando l'ha letta ("prima"); se nel frattempo qualcuno l'ha
-- cambiata, la funzione si ferma con `conflitto_scrittura`, non applica niente, e il codice rilegge e riprova. Due persone che toccano
-- righe diverse non si disturbano mai.
-- Tabelle ammesse: solo le sette qui sotto. Iscrizioni, pagamenti, accessi e prenotazioni NON passano di qui: hanno le loro funzioni.

do $$
begin
  if to_regclass('public.prenotazioni_tavoli') is null or to_regclass('public.pagamenti') is null or to_regclass('public.eventi') is null then
    raise exception 'Servono prima le tappe 1, 2 e 3 (20261104…, 20261105…, 20261106…)' using errcode = 'P0001';
  end if;
end $$;

-- p = { "<tabella>": { "nuovi": [riga…], "cambi": [{ "prima": riga, "colonne": { colonna: valore… } }…], "eliminati": [riga…] }… }
-- Risponde { ok, nuovi, cambi, eliminati }. Errori: tabella_non_ammessa, conflitto_scrittura, colonna_non_valida, chiave_non_modificabile.
create or replace function public.applica_anagrafiche(p jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  -- Dai genitori ai figli: si inserisce in quest'ordine e si toglie in ordine inverso.
  tabelle   text[] := array['eventi', 'pr', 'utenti', 'lotti', 'tavoli', 'porte', 'posta_inviata'];
  chiavi    jsonb  := '{"eventi":["id"],"pr":["id"],"utenti":["id"],"lotti":["id"],"tavoli":["id"],"porte":["evento_id","nome"],"posta_inviata":["id"]}';
  nome      text;
  t         text;
  i         integer;
  el        jsonb;
  attuale   jsonb;
  kc        text[];
  dove      text;
  imposta   text;
  colonna   text;
  righe     integer;
  n_nuovi   integer := 0;
  n_cambi   integer := 0;
  n_elim    integer := 0;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'modifiche_non_valide' using errcode = 'P0001'; end if;
  for nome in select jsonb_object_keys(p) loop
    if not (nome = any(tabelle)) then raise exception 'tabella_non_ammessa: %', nome using errcode = 'P0001'; end if;
  end loop;

  -- (Nelle interrogazioni dinamiche l'alias della tabella è `riga`, non una lettera: i tavoli hanno una colonna `x`, che prenderebbe il suo posto.)
  -- 1. Righe tolte, dai figli ai genitori.
  for i in reverse array_length(tabelle, 1) .. 1 loop
    t := tabelle[i];
    kc := array(select jsonb_array_elements_text(chiavi->t));
    dove := (select string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', k, t, k), ' and ') from unnest(kc) k);
    for el in select e from jsonb_array_elements(coalesce(p->t->'eliminati', '[]'::jsonb)) e loop
      execute format('select to_jsonb(riga) from public.%I riga where %s for update', t, dove) into attuale using el;
      if attuale is distinct from el then raise exception 'conflitto_scrittura' using errcode = 'P0001'; end if;
      execute format('delete from public.%I where %s', t, dove) using el;
      n_elim := n_elim + 1;
    end loop;
  end loop;

  -- 2. Righe nuove, dai genitori ai figli.
  for i in 1 .. array_length(tabelle, 1) loop
    t := tabelle[i];
    if jsonb_array_length(coalesce(p->t->'nuovi', '[]'::jsonb)) > 0 then
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t) using p->t->'nuovi';
      get diagnostics righe = row_count;
      n_nuovi := n_nuovi + righe;
    end if;
  end loop;

  -- 3. Righe cambiate: solo le colonne indicate, dopo aver controllato che la riga sia ancora com'era quando il codice l'ha letta.
  for i in 1 .. array_length(tabelle, 1) loop
    t := tabelle[i];
    kc := array(select jsonb_array_elements_text(chiavi->t));
    dove := (select string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', k, t, k), ' and ') from unnest(kc) k);
    -- Chi toglie la copertina passa prima di chi la mette: l'indice unico "una sola serata in copertina" non ammette due `true` nemmeno per un istante.
    for el in select x.e from jsonb_array_elements(coalesce(p->t->'cambi', '[]'::jsonb)) with ordinality as x(e, n)
               order by coalesce(x.e->'colonne'->'in_copertina' = 'true'::jsonb, false), x.n loop
      if jsonb_typeof(el->'colonne') is distinct from 'object' or (select count(*) from jsonb_object_keys(el->'colonne')) = 0 then continue; end if;
      for colonna in select jsonb_object_keys(el->'colonne') loop
        if colonna = any(kc) then raise exception 'chiave_non_modificabile: %', colonna using errcode = 'P0001'; end if;
        if not exists (select 1 from pg_attribute a where a.attrelid = format('public.%I', t)::regclass and a.attname = colonna and a.attnum > 0 and not a.attisdropped and a.attgenerated = '') then
          raise exception 'colonna_non_valida: %.%', t, colonna using errcode = 'P0001';
        end if;
      end loop;
      execute format('select to_jsonb(riga) from public.%I riga where %s for update', t, dove) into attuale using el->'prima';
      if attuale is distinct from el->'prima' then raise exception 'conflitto_scrittura' using errcode = 'P0001'; end if;
      imposta := (select string_agg(format('%I = (jsonb_populate_record(null::public.%I, $2)).%I', c, t, c), ', ') from jsonb_object_keys(el->'colonne') c);
      execute format('update public.%I set %s where %s', t, imposta, dove) using el->'prima', el->'colonne';
      n_cambi := n_cambi + 1;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'nuovi', n_nuovi, 'cambi', n_cambi, 'eliminati', n_elim);
end $$;

revoke execute on function public.applica_anagrafiche(jsonb) from public, anon, authenticated;
grant execute on function public.applica_anagrafiche(jsonb) to service_role;

-- Fa vedere subito all'API la funzione nuova.
notify pgrst, 'reload schema';
