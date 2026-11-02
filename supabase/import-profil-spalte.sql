-- Schritt 2.7 · Import pro Profil — Spalte import_profil
-- Merkt sich, für welches Profil eine Stelle importiert wurde (leer = deine Suche).
-- Solche Stellen erscheinen nicht in deiner Inbox und kosten dich keine Bewertung.

alter table jobs add column if not exists import_profil text;
create index if not exists jobs_import_profil on jobs (import_profil) where import_profil is not null;
