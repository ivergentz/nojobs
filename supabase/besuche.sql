-- Bewerbungs-Tracking: persönliche Links (iverbohnes.de/<kürzel>) und ihre Aufrufe.
-- Im Supabase-Dashboard → SQL Editor einmal ausführen. Mehrfaches Ausführen schadet nicht.

-- 1. Jede Bewerbung bekommt ein eindeutiges Kürzel.
alter table jobs add column if not exists ref text;
alter table jobs add column if not exists ref_at timestamptz;
create unique index if not exists jobs_ref_key on jobs (ref) where ref is not null;

-- 2. Ein Eintrag pro Besuch (Sitzung). Keine IP, keine Cookies.
create table if not exists besuche (
  id          bigserial primary key,
  sitzung     text not null unique,
  ref         text not null,
  job_uuid    text,
  seiten      text[] not null default '{}',
  sekunden    integer,
  geraet      text,
  bot         boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists besuche_ref_idx on besuche (ref);
create index if not exists besuche_job_idx on besuche (job_uuid);
create index if not exists besuche_created_idx on besuche (created_at desc);

-- Nur der Server (Service-Role-Key) darf lesen und schreiben.
alter table besuche enable row level security;
