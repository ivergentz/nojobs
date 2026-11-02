-- Schritt 2.2 · Lese-Sicht für weitere Profile (jobs_profil)
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.
-- Voraussetzung: matches.sql ist gelaufen.
--
-- jobs_profil enthält jede Stelle einmal PRO PROFIL (Spalte "profil" = Profil-Schlüssel).
-- Die Stellendaten kommen aus jobs, alle persönlichen Felder (Bewertung, Label, Status …)
-- ausschließlich aus matches dieses Profils. Ohne Eintrag: leer bzw. Status "neu".
-- Dein eigenes Profil liest weiter über jobs / jobs_sicht — diese Sicht betrifft dich nicht.
-- Kommen später neue Spalten in jobs dazu: dieses Skript einfach erneut ausführen.

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

  select string_agg(
           case
             when c.column_name = 'app_status' then 'coalesce(m.app_status, ''neu'') as app_status'
             when c.column_name = any (persoenlich) then format('m.%1$I as %1$I', c.column_name)
             else format('j.%I', c.column_name)
           end,
           ', ' order by c.ordinal_position)
    into spalten
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'jobs';

  execute 'drop view if exists jobs_profil';
  execute format(
    'create view jobs_profil with (security_invoker = on) as
       select p.slug as profil, %s
         from jobs j
         cross join profiles p
         left join matches m
           on m.job_uuid = j.uuid
          and m.profile_id = p.id',
    spalten);
end $$;

-- Kontrolle: Anzahl Profile und Stellen je Profil (jedes Profil sieht alle Stellen)
select p.slug as profil,
       (select count(*) from jobs_profil s where s.profil = p.slug) as stellen,
       (select count(*) from matches m where m.profile_id = p.id) as mit_eigenen_daten
from profiles p
order by p.created_at;

-- RÜCKBAU: drop view if exists jobs_profil;
