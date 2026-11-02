-- Schritt 1.1 · Profile (Career Inbox für mehrere Personen)
-- Im Supabase-Dashboard unter SQL Editor einmal ausführen. Mehrfaches Ausführen schadet nicht.
--
-- Rein additiv: neue Tabelle, nichts an bestehenden Tabellen geändert.
-- Ivers Profil wird mit leeren Textfeldern angelegt — leer heißt:
-- Profiltext und Bewertungsregeln kommen wie bisher aus dem Code (src/lib/evaluate.ts).

create table if not exists profiles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,            -- kurzer Schlüssel, z. B. "iver"; steht auch in api_kosten.profil
  name             text not null,
  email            text,
  rolle            text not null default 'nutzer' check (rolle in ('admin', 'nutzer')),
  auth_user_id     uuid unique,                      -- Supabase-Login, ab Phase 2
  telegram_chat_id text,                             -- ab Phase 3; Iver bis dahin über TELEGRAM_CHAT_ID
  profiltext       text,                             -- leer = Standard aus dem Code
  regeln           text,                             -- leer = Standard aus dem Code
  suchbegriffe     text[],                           -- ab Phase 2 (Import pro Profil)
  einstellungen    jsonb not null default '{}'::jsonb,
  aktiv            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table profiles enable row level security;

insert into profiles (slug, name, rolle)
values ('iver', 'Iver Bohnes', 'admin')
on conflict (slug) do nothing;
