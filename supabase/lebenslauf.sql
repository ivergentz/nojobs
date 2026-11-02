-- Schritt 2.4 · Lebenslauf hochladen und auslesen (weitere Profile)
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.
-- Dein Profil ist nicht betroffen: Dein Lebenslauf kommt weiter von deiner Website.

-- 1. Ausgelesener Lebenslauf je Profil (immer der zuletzt hochgeladene)
create table if not exists profile_cv (
  profile_id   uuid primary key references profiles (id) on delete cascade,
  datei_pfad   text,
  datei_name   text,
  datei_typ    text,
  datei_bytes  integer,
  status       text not null default 'hochgeladen' check (status in ('hochgeladen', 'ausgelesen', 'fehler')),
  fehler       text,
  lebenslauf   jsonb,           -- Struktur: Person, Kurzprofil, Stationen, Ausbildung, Kenntnisse, Sprachen
  richtungen   jsonb,           -- 2–3 vorgeschlagene Richtungen mit Suchbegriffen
  pruefung     jsonb,           -- Prüfbericht (rot / gelb / hinweis)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table profile_cv enable row level security;

-- 2. Privater Dateispeicher für die Originale (nur der Server kommt dran)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lebenslaeufe', 'lebenslaeufe', false, 10485760,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

select (select count(*) from profile_cv) as lebenslaeufe,
       (select count(*) from storage.buckets where id = 'lebenslaeufe') as speicher_angelegt;

-- RÜCKBAU: drop table if exists profile_cv;  (Speicher im Dashboard unter Storage löschen)
