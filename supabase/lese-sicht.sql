-- Schritt 1.4 · Lese-Sicht jobs_sicht
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.
-- Voraussetzung: matches.sql ist gelaufen.
--
-- jobs_sicht sieht aus wie jobs, holt deine persönlichen Felder (Bewertung, Label, Status,
-- Notizen, Entwurf, Vorbereitung, Tracking) aber aus matches. Die App liest daraus erst,
-- wenn in Vercel LESEN_AUS=matches gesetzt ist. Ohne die Variable ändert sich nichts.
--
-- Stellen ohne Eintrag in matches haben keine persönlichen Daten — dort gelten die
-- Werte aus jobs (leer bzw. Status "neu"). Kommen später neue Spalten in jobs dazu:
-- dieses Skript einfach erneut ausführen.

do $$
declare
  persoenlich text[] := array[
    'eval_fit','eval_confidence','eval_summary','eval_pros','eval_cons','eval_spur','evaluated_at',
    'label','labeled_at','label_gruende','label_notiz',
    'app_status','app_status_at','app_note','absage_notiz',
    'application_draft','application_drafted_at','vorbereitung','ref','ref_at','notified_at'
  ];
  spalten text;
begin
  if to_regclass('public.matches') is null then
    raise exception 'Tabelle matches fehlt. Bitte zuerst matches.sql ausführen.';
  end if;

  -- alle Spalten von jobs in ihrer Reihenfolge; persönliche aus matches (sofort vorhanden), sonst aus jobs
  select string_agg(
           case when c.column_name = any (persoenlich)
                then format('case when m.job_uuid is null then j.%1$I else m.%1$I end as %1$I', c.column_name)
                else format('j.%I', c.column_name)
           end,
           ', ' order by c.ordinal_position)
    into spalten
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'jobs';

  execute 'drop view if exists jobs_sicht';
  execute format(
    'create view jobs_sicht with (security_invoker = on) as
       select %s
         from jobs j
         left join matches m
           on m.job_uuid = j.uuid
          and m.profile_id = (select id from profiles where slug = %L)%s',
    spalten, 'iver',
    -- Schritt 2.7: Stellen, die nur für ein anderes Profil importiert wurden, gehören nicht in deine Inbox.
    case when exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'jobs' and column_name = 'import_profil')
         then ' where j.import_profil is null' else '' end);
end $$;

-- Kontrolle: jobs_sicht muss Zeile für Zeile exakt jobs entsprechen (unterschiede = 0).
-- Ab Schritt 2.7 fehlen in der Sicht nur die Stellen, die für andere Profile importiert wurden.
select
  (select count(*) from jobs) as stellen,
  (select count(*) from jobs_sicht) as stellen_in_sicht,
  (select count(*)
     from jobs j
     join jobs_sicht s on s.uuid = j.uuid
    where to_jsonb(j) is distinct from to_jsonb(s)) as unterschiede;

-- RÜCKBAU: drop view if exists jobs_sicht;
