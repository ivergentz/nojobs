-- Schritt 1.5 · Aufbewahrungsregel
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.
-- Voraussetzung: matches.sql ist gelaufen.
--
-- Legt nur eine Funktion an — gelöscht wird durch dieses Skript NICHTS.
-- Das nächtliche Aufräumen ruft sie auf:
--   ohne Schalter (Standard)       → zählt nur, was gelöscht würde (Vorschau in der Steuerung)
--   AUFRAEUMEN_LOESCHEN=an (Vercel) → löscht wirklich, höchstens 5.000 Stellen pro Nacht
--
-- Regel:
--   Für immer behalten: jede Stelle, die du angefasst hast — Label, Status (außer neu/abgelaufen),
--                       Notiz, Absagegrund, Entwurf, Vorbereitung, Tracking-Kürzel.
--   Löschen:           unangetastete Stellen, die vor mehr als 60 Tagen importiert wurden.
--                      Ausnahme: Stellen von Karriereseiten, die dort noch aktiv gelistet sind
--                      (sonst kämen sie beim nächsten Import als „neu“ zurück).
--   Löschen:           aussortierte Anzeigen (dropped_ads) nach 90 Tagen.

create or replace function aufraeumen(
  loeschen boolean default false,
  tage_stellen integer default 60,
  tage_aussortiert integer default 90,
  max_stellen integer default 5000
)
returns table (stellen bigint, aussortiert bigint, behalten bigint, geloescht boolean, hinweis text)
language plpgsql
security definer
set search_path = public
as $$
declare
  grenze_stellen timestamptz := now() - make_interval(days => greatest(tage_stellen, 30));
  grenze_aussortiert timestamptz := now() - make_interval(days => greatest(tage_aussortiert, 30));
  zeitspalte text;
  n_stellen bigint := 0;
  n_aussortiert bigint := 0;
  n_behalten bigint := 0;
  notiz text := null;
begin
  -- Angefasst = irgendein persönliches Feld gesetzt (in jobs ODER in matches irgendeines Profils)
  create temp table if not exists _kandidaten (uuid text primary key) on commit drop;
  truncate _kandidaten;

  insert into _kandidaten (uuid)
  select j.uuid::text
  from jobs j
  where j.imported_at is not null
    and j.imported_at < grenze_stellen
    and not (j.source = 'ats' and j.status = 'ACTIVE')
    and j.label is null
    and coalesce(j.app_status, 'neu') in ('neu', 'abgelaufen')
    and j.application_draft is null
    and j.vorbereitung is null
    and j.ref is null
    and j.app_note is null
    and j.absage_notiz is null
    and j.label_notiz is null
    and j.label_gruende is null
    and not exists (
      select 1 from matches m
      where m.job_uuid = j.uuid
        and (m.label is not null
             or coalesce(m.app_status, 'neu') not in ('neu', 'abgelaufen')
             or m.application_draft is not null or m.vorbereitung is not null or m.ref is not null
             or m.app_note is not null or m.absage_notiz is not null
             or m.label_notiz is not null or m.label_gruende is not null)
    );

  select count(*) into n_stellen from _kandidaten;
  select count(*) into n_behalten from jobs j where not exists (select 1 from _kandidaten k where k.uuid = j.uuid::text);

  -- Zeitspalte der aussortierten Anzeigen finden (je nach Stand heißt sie unterschiedlich)
  select c.column_name into zeitspalte
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'dropped_ads'
    and c.column_name in ('dropped_at', 'created_at', 'imported_at')
    and c.data_type like 'timestamp%'
  order by array_position(array['dropped_at', 'created_at', 'imported_at'], c.column_name::text)
  limit 1;

  if zeitspalte is null then
    notiz := 'dropped_ads ohne Zeitspalte — aussortierte Anzeigen werden nicht gelöscht';
  else
    execute format('select count(*) from dropped_ads where %I < $1', zeitspalte) into n_aussortiert using grenze_aussortiert;
  end if;

  if loeschen then
    delete from jobs j
    where j.uuid::text in (select k.uuid from _kandidaten k limit greatest(max_stellen, 0));
    get diagnostics n_stellen = row_count;

    if zeitspalte is not null then
      execute format('delete from dropped_ads where %I < $1', zeitspalte) using grenze_aussortiert;
      get diagnostics n_aussortiert = row_count;
    end if;
  end if;

  return query select n_stellen, n_aussortiert, n_behalten, loeschen, notiz;
end $$;

-- Nur der Server (Service-Schlüssel) darf das aufrufen.
revoke all on function aufraeumen(boolean, integer, integer, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function aufraeumen(boolean, integer, integer, integer) from anon, authenticated';
  end if;
end $$;

-- Vorschau: was würde heute Nacht gelöscht? (löscht nichts)
select * from aufraeumen(false);

-- RÜCKBAU: drop function if exists aufraeumen(boolean, integer, integer, integer);
