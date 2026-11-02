-- Schritt 1.2 · Persönliche Daten pro Profil (Tabelle matches) + Spiegel
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.
--
-- VORHER ausführen (falls noch nicht geschehen): besuche.sql, label-gruende.sql, suchspur.sql,
-- absage-notiz.sql, vorbereitung.sql, profile.sql. Fehlt etwas, bricht dieses Skript mit einem
-- klaren Hinweis ab und ändert nichts.
--
-- Was passiert:
--   1. Neue Tabelle matches: Bewertung, Label, Status, Notizen, Entwurf, Vorbereitung, Tracking-Kürzel
--      — pro Profil und Stelle. Die Spaltentypen werden 1:1 aus jobs übernommen.
--   2. Deine bisherigen Daten werden einmalig nach matches kopiert (Profil "iver").
--   3. Ein Spiegel in der Datenbank kopiert ab jetzt jede Änderung an diesen Feldern in jobs sofort
--      nach matches — egal ob sie aus der App, einem SQL-Skript oder dem Dashboard kommt.
--
-- Die App liest und schreibt weiterhin nur jobs. Für dich ändert sich nichts.
-- Kann der Spiegel einmal nicht schreiben, wird nur eine Warnung protokolliert —
-- die Änderung an jobs geht trotzdem durch. Rückbau: siehe ganz unten.

-- 0. Voraussetzungen prüfen
do $$
declare
  fehlt text;
begin
  select string_agg(s, ', ') into fehlt
  from unnest(array[
    'eval_fit','eval_confidence','eval_summary','eval_pros','eval_cons','eval_spur','evaluated_at',
    'label','labeled_at','label_gruende','label_notiz',
    'app_status','app_status_at','app_note','absage_notiz',
    'application_draft','application_drafted_at','vorbereitung','ref','ref_at','notified_at'
  ]) as s
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = s
  );
  if fehlt is not null then
    raise exception 'Spalten in jobs fehlen: %. Bitte zuerst die älteren SQL-Dateien ausführen (siehe Kopf).', fehlt;
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    raise exception 'Tabelle profiles fehlt. Bitte zuerst profile.sql ausführen.';
  end if;
end $$;

-- 1. Tabelle anlegen (Typen exakt wie in jobs)
create table if not exists matches as
select
  null::uuid as profile_id,
  uuid as job_uuid,
  eval_fit, eval_confidence, eval_summary, eval_pros, eval_cons, eval_spur, evaluated_at,
  label, labeled_at, label_gruende, label_notiz,
  app_status, app_status_at, app_note, absage_notiz,
  application_draft, application_drafted_at, vorbereitung,
  ref, ref_at, notified_at,
  now() as gespiegelt_at
from jobs
where false;

alter table matches alter column profile_id set not null;
alter table matches alter column job_uuid set not null;
alter table matches alter column app_status set default 'neu';
alter table matches alter column gespiegelt_at set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'matches_pkey') then
    alter table matches add constraint matches_pkey primary key (profile_id, job_uuid);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_profile_fk') then
    alter table matches add constraint matches_profile_fk foreign key (profile_id) references profiles (id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_job_fk') then
    alter table matches add constraint matches_job_fk foreign key (job_uuid) references jobs (uuid) on delete cascade;
  end if;
end $$;

create unique index if not exists matches_ref_key on matches (ref) where ref is not null;
create index if not exists matches_job on matches (job_uuid);
create index if not exists matches_status on matches (profile_id, app_status);
create index if not exists matches_fit on matches (profile_id, eval_fit);

alter table matches enable row level security;

-- 2. Spiegel: jobs → matches (Profil "iver")
create or replace function spiegel_match() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  select id into pid from profiles where slug = 'iver';
  if pid is null then
    return new;
  end if;

  insert into matches (
    profile_id, job_uuid,
    eval_fit, eval_confidence, eval_summary, eval_pros, eval_cons, eval_spur, evaluated_at,
    label, labeled_at, label_gruende, label_notiz,
    app_status, app_status_at, app_note, absage_notiz,
    application_draft, application_drafted_at, vorbereitung,
    ref, ref_at, notified_at, gespiegelt_at
  ) values (
    pid, new.uuid,
    new.eval_fit, new.eval_confidence, new.eval_summary, new.eval_pros, new.eval_cons, new.eval_spur, new.evaluated_at,
    new.label, new.labeled_at, new.label_gruende, new.label_notiz,
    new.app_status, new.app_status_at, new.app_note, new.absage_notiz,
    new.application_draft, new.application_drafted_at, new.vorbereitung,
    new.ref, new.ref_at, new.notified_at, now()
  )
  on conflict (profile_id, job_uuid) do update set
    eval_fit = excluded.eval_fit, eval_confidence = excluded.eval_confidence, eval_summary = excluded.eval_summary,
    eval_pros = excluded.eval_pros, eval_cons = excluded.eval_cons, eval_spur = excluded.eval_spur,
    evaluated_at = excluded.evaluated_at,
    label = excluded.label, labeled_at = excluded.labeled_at, label_gruende = excluded.label_gruende,
    label_notiz = excluded.label_notiz,
    app_status = excluded.app_status, app_status_at = excluded.app_status_at, app_note = excluded.app_note,
    absage_notiz = excluded.absage_notiz,
    application_draft = excluded.application_draft, application_drafted_at = excluded.application_drafted_at,
    vorbereitung = excluded.vorbereitung,
    ref = excluded.ref, ref_at = excluded.ref_at, notified_at = excluded.notified_at,
    gespiegelt_at = now();
  return new;
exception when others then
  -- Der Spiegel darf nie eine Änderung an jobs verhindern.
  raise warning 'spiegel_match (%): %', new.uuid, sqlerrm;
  return new;
end $$;

drop trigger if exists jobs_spiegel_update on jobs;
create trigger jobs_spiegel_update
after update on jobs
for each row
when ((
  old.eval_fit, old.eval_confidence, old.eval_summary, old.eval_pros::text, old.eval_cons::text, old.eval_spur, old.evaluated_at,
  old.label, old.labeled_at, old.label_gruende::text, old.label_notiz,
  old.app_status, old.app_status_at, old.app_note, old.absage_notiz,
  old.application_draft::text, old.application_drafted_at, old.vorbereitung::text,
  old.ref, old.ref_at, old.notified_at
) is distinct from (
  new.eval_fit, new.eval_confidence, new.eval_summary, new.eval_pros::text, new.eval_cons::text, new.eval_spur, new.evaluated_at,
  new.label, new.labeled_at, new.label_gruende::text, new.label_notiz,
  new.app_status, new.app_status_at, new.app_note, new.absage_notiz,
  new.application_draft::text, new.application_drafted_at, new.vorbereitung::text,
  new.ref, new.ref_at, new.notified_at
))
execute function spiegel_match();

-- Neue Stellen aus dem Import haben keine persönlichen Daten → kein Spiegel.
-- Nur von Hand angelegte Stellen (z. B. manuelle Bewerbungen) werden gespiegelt.
drop trigger if exists jobs_spiegel_insert on jobs;
create trigger jobs_spiegel_insert
after insert on jobs
for each row
when (
  new.evaluated_at is not null or new.label is not null or new.application_draft is not null
  or new.vorbereitung is not null or new.ref is not null or new.notified_at is not null
  or (new.app_status is not null and new.app_status <> 'neu')
)
execute function spiegel_match();

-- 3. Einmalige Übernahme deiner bisherigen Daten
insert into matches (
  profile_id, job_uuid,
  eval_fit, eval_confidence, eval_summary, eval_pros, eval_cons, eval_spur, evaluated_at,
  label, labeled_at, label_gruende, label_notiz,
  app_status, app_status_at, app_note, absage_notiz,
  application_draft, application_drafted_at, vorbereitung,
  ref, ref_at, notified_at, gespiegelt_at
)
select
  (select id from profiles where slug = 'iver'), j.uuid,
  j.eval_fit, j.eval_confidence, j.eval_summary, j.eval_pros, j.eval_cons, j.eval_spur, j.evaluated_at,
  j.label, j.labeled_at, j.label_gruende, j.label_notiz,
  j.app_status, j.app_status_at, j.app_note, j.absage_notiz,
  j.application_draft, j.application_drafted_at, j.vorbereitung,
  j.ref, j.ref_at, j.notified_at, now()
from jobs j
where (select id from profiles where slug = 'iver') is not null
  and (
    j.evaluated_at is not null or j.label is not null or j.application_draft is not null
    or j.vorbereitung is not null or j.ref is not null or j.notified_at is not null
    or (j.app_status is not null and j.app_status <> 'neu')
  )
on conflict (profile_id, job_uuid) do update set
  eval_fit = excluded.eval_fit, eval_confidence = excluded.eval_confidence, eval_summary = excluded.eval_summary,
  eval_pros = excluded.eval_pros, eval_cons = excluded.eval_cons, eval_spur = excluded.eval_spur,
  evaluated_at = excluded.evaluated_at,
  label = excluded.label, labeled_at = excluded.labeled_at, label_gruende = excluded.label_gruende,
  label_notiz = excluded.label_notiz,
  app_status = excluded.app_status, app_status_at = excluded.app_status_at, app_note = excluded.app_note,
  absage_notiz = excluded.absage_notiz,
  application_draft = excluded.application_draft, application_drafted_at = excluded.application_drafted_at,
  vorbereitung = excluded.vorbereitung,
  ref = excluded.ref, ref_at = excluded.ref_at, notified_at = excluded.notified_at,
  gespiegelt_at = now();

-- 3b. Abgleich für die Steuerung (Schritt 1.3): jede Stelle, bei der jobs und matches nicht übereinstimmen.
--     art: fehlt = persönliche Daten in jobs, aber kein Eintrag in matches · abweichend = Werte unterscheiden sich
create or replace view matches_abweichungen
with (security_invoker = on) as
with iver as (select id from profiles where slug = 'iver'),
paar as (
  select j.uuid, j.title, j.employer_name, j, m, (m.job_uuid is null) as fehlt
  from jobs j
  left join matches m on m.job_uuid = j.uuid and m.profile_id = (select id from iver)
  where m.job_uuid is not null
     or j.evaluated_at is not null or j.label is not null or j.application_draft is not null
     or j.vorbereitung is not null or j.ref is not null or j.notified_at is not null
     or (j.app_status is not null and j.app_status <> 'neu')
)
select
  uuid as job_uuid,
  title,
  employer_name,
  case when fehlt then 'fehlt' else 'abweichend' end as art,
  case when fehlt then array[]::text[] else array_remove(array[
    case when (j).eval_fit is distinct from (m).eval_fit then 'eval_fit' end,
    case when (j).eval_confidence is distinct from (m).eval_confidence then 'eval_confidence' end,
    case when (j).eval_summary is distinct from (m).eval_summary then 'eval_summary' end,
    case when (j).eval_pros::text is distinct from (m).eval_pros::text then 'eval_pros' end,
    case when (j).eval_cons::text is distinct from (m).eval_cons::text then 'eval_cons' end,
    case when (j).eval_spur is distinct from (m).eval_spur then 'eval_spur' end,
    case when (j).evaluated_at is distinct from (m).evaluated_at then 'evaluated_at' end,
    case when (j).label is distinct from (m).label then 'label' end,
    case when (j).labeled_at is distinct from (m).labeled_at then 'labeled_at' end,
    case when (j).label_gruende::text is distinct from (m).label_gruende::text then 'label_gruende' end,
    case when (j).label_notiz is distinct from (m).label_notiz then 'label_notiz' end,
    case when (j).app_status is distinct from (m).app_status then 'app_status' end,
    case when (j).app_status_at is distinct from (m).app_status_at then 'app_status_at' end,
    case when (j).app_note is distinct from (m).app_note then 'app_note' end,
    case when (j).absage_notiz is distinct from (m).absage_notiz then 'absage_notiz' end,
    case when (j).application_draft::text is distinct from (m).application_draft::text then 'application_draft' end,
    case when (j).application_drafted_at is distinct from (m).application_drafted_at then 'application_drafted_at' end,
    case when (j).vorbereitung::text is distinct from (m).vorbereitung::text then 'vorbereitung' end,
    case when (j).ref is distinct from (m).ref then 'ref' end,
    case when (j).ref_at is distinct from (m).ref_at then 'ref_at' end,
    case when (j).notified_at is distinct from (m).notified_at then 'notified_at' end
  ], null) end as felder
from paar
where fehlt
   or ((j).eval_fit, (j).eval_confidence, (j).eval_summary, (j).eval_pros::text, (j).eval_cons::text, (j).eval_spur,
       (j).evaluated_at, (j).label, (j).labeled_at, (j).label_gruende::text, (j).label_notiz,
       (j).app_status, (j).app_status_at, (j).app_note, (j).absage_notiz,
       (j).application_draft::text, (j).application_drafted_at, (j).vorbereitung::text,
       (j).ref, (j).ref_at, (j).notified_at)
      is distinct from
      ((m).eval_fit, (m).eval_confidence, (m).eval_summary, (m).eval_pros::text, (m).eval_cons::text, (m).eval_spur,
       (m).evaluated_at, (m).label, (m).labeled_at, (m).label_gruende::text, (m).label_notiz,
       (m).app_status, (m).app_status_at, (m).app_note, (m).absage_notiz,
       (m).application_draft::text, (m).application_drafted_at, (m).vorbereitung::text,
       (m).ref, (m).ref_at, (m).notified_at);

-- Nachziehen: kopiert alles aus jobs erneut nach matches (Knopf in der Steuerung). Liest nur jobs, ändert jobs nie.
create or replace function matches_nachziehen() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  n integer;
begin
  select id into pid from profiles where slug = 'iver';
  if pid is null then
    return 0;
  end if;
  insert into matches (
    profile_id, job_uuid,
    eval_fit, eval_confidence, eval_summary, eval_pros, eval_cons, eval_spur, evaluated_at,
    label, labeled_at, label_gruende, label_notiz,
    app_status, app_status_at, app_note, absage_notiz,
    application_draft, application_drafted_at, vorbereitung,
    ref, ref_at, notified_at, gespiegelt_at
  )
  select
    pid, j.uuid,
    j.eval_fit, j.eval_confidence, j.eval_summary, j.eval_pros, j.eval_cons, j.eval_spur, j.evaluated_at,
    j.label, j.labeled_at, j.label_gruende, j.label_notiz,
    j.app_status, j.app_status_at, j.app_note, j.absage_notiz,
    j.application_draft, j.application_drafted_at, j.vorbereitung,
    j.ref, j.ref_at, j.notified_at, now()
  from jobs j
  where j.uuid in (select job_uuid from matches_abweichungen)
  on conflict (profile_id, job_uuid) do update set
    eval_fit = excluded.eval_fit, eval_confidence = excluded.eval_confidence, eval_summary = excluded.eval_summary,
    eval_pros = excluded.eval_pros, eval_cons = excluded.eval_cons, eval_spur = excluded.eval_spur,
    evaluated_at = excluded.evaluated_at,
    label = excluded.label, labeled_at = excluded.labeled_at, label_gruende = excluded.label_gruende,
    label_notiz = excluded.label_notiz,
    app_status = excluded.app_status, app_status_at = excluded.app_status_at, app_note = excluded.app_note,
    absage_notiz = excluded.absage_notiz,
    application_draft = excluded.application_draft, application_drafted_at = excluded.application_drafted_at,
    vorbereitung = excluded.vorbereitung,
    ref = excluded.ref, ref_at = excluded.ref_at, notified_at = excluded.notified_at,
    gespiegelt_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Nur der Server (Service-Schlüssel) darf nachziehen, nicht anonyme Aufrufer.
revoke all on function matches_nachziehen() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function matches_nachziehen() from anon, authenticated';
  end if;
end $$;

-- 4. Selbsttest: Spiegel wirklich aktiv? (Änderung wird sofort wieder zurückgenommen)
do $$
declare
  probe text;
begin
  select job_uuid into probe from matches limit 1;
  if probe is null then
    return;
  end if;
  begin
    update jobs set app_note = coalesce(app_note, '') || '§selbsttest' where uuid = probe;
    if not exists (select 1 from matches where job_uuid = probe and app_note like '%§selbsttest') then
      raise exception 'SPIEGEL_KAPUTT';
    end if;
    raise exception 'SELBSTTEST_OK';
  exception when others then
    if sqlerrm <> 'SELBSTTEST_OK' then
      raise exception 'Spiegel-Selbsttest fehlgeschlagen (%). Bitte Iver/Claude Bescheid geben.', sqlerrm;
    end if;
  end;
end $$;

-- 5. Kontrolle: übernommen und Abweichungen (Abweichungen muss 0 sein)
select
  (select count(*) from matches) as uebernommen,
  (select count(*) from matches where label is not null) as mit_label,
  (select count(*) from matches where app_status in ('beworben', 'interview', 'absage')) as bewerbungen,
  (select count(*) from matches_abweichungen) as abweichungen;

-- RÜCKBAU (nur bei Problemen, löscht nichts in jobs):
--   drop trigger if exists jobs_spiegel_update on jobs;
--   drop trigger if exists jobs_spiegel_insert on jobs;
--   drop function if exists spiegel_match();
--   drop function if exists matches_nachziehen();
--   drop view if exists matches_abweichungen;
--   drop table if exists matches;
