-- Tipi di prevendita per serata: i lotti diventano tipi con categoria (es. Donne, controllata alla porta),
-- uscita e chiusura relative alla serata, uscita a esaurimento del tipo precedente e PR abilitati.
-- Stesse regole di lib/regole.ts (finestraLotto, tipiVista, statoLista). RLS invariata: le colonne nuove stanno
-- su tabelle che hanno già le loro policy (lotti: lettura pubblica se la serata è pubblicata, scrittura solo admin;
-- iscrizioni: scritte solo dal server, lette da admin, staff della porta e PR per le proprie).

alter table public.lotti
  add column categoria            text check (categoria is null or length(btrim(categoria)) between 1 and 40),
  add column conferma_categoria   boolean not null default false,
  add column uscita_giorni_prima  integer check (uscita_giorni_prima is null or uscita_giorni_prima >= 0),
  add column fine_ore_prima       integer check (fine_ore_prima is null or fine_ore_prima >= 0),
  add column dopo_precedente      boolean not null default false,
  add column pr_abilitati         uuid[];   -- null = tutti i PR (se visibile_da_pr)

-- Ha senso chiedere la conferma solo se c'è una categoria.
alter table public.lotti add constraint lotti_conferma_con_categoria check (not conferma_categoria or categoria is not null);
-- Un'uscita è o relativa o a data fissa, non entrambe; lo stesso per la chiusura.
alter table public.lotti add constraint lotti_uscita_unica check (uscita_giorni_prima is null or data_inizio is null);
alter table public.lotti add constraint lotti_chiusura_unica check (fine_ore_prima is null or data_fine is null);

-- La categoria resta sull'iscrizione anche se il tipo viene cambiato dopo: è quella che si controlla alla porta.
alter table public.iscrizioni add column categoria text;
-- "Non rientra" dello staff alla porta (categoria non rispettata): chi, quando, da quale porta. L'iscrizione resta valida.
alter table public.iscrizioni
  add column rifiuto_ingresso_at    timestamptz,
  add column rifiuto_ingresso_porta text,
  add column rifiuto_ingresso_da    text;
update public.iscrizioni i set categoria = l.categoria from public.lotti l where l.id = i.lotto_id and l.categoria is not null;

-- Elenco della porta (anche offline): ora con la categoria.
drop function if exists public.porta_elenco(uuid);
create function public.porta_elenco(p_evento_id uuid)
returns table (id uuid, token_qr text, codice text, nome text, cognome text, data_nascita date,
               stato public.stato_iscrizione, importo numeric, ora_check_in timestamptz, porta text, lista text, categoria text,
               rifiuto_at timestamptz, rifiuto_porta text, rifiuto_da text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_staff_o_admin() then
    raise exception 'non_autorizzato' using errcode = '42501';
  end if;
  return query
    select i.id, i.token_qr, i.codice, i.nome, i.cognome, i.data_nascita, i.stato, i.importo,
           i.ora_check_in, i.porta, coalesce(p.nome_display, 'Maremma Musica'), i.categoria,
           i.rifiuto_ingresso_at, i.rifiuto_ingresso_porta, i.rifiuto_ingresso_da
    from public.iscrizioni i left join public.pr p on p.id = i.pr_id
    where i.evento_id = p_evento_id and i.stato <> 'scaduta' and not (i.stato = 'in_attesa' and i.scade <= now());
end $$;
