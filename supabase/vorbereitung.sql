-- Gesprächsvorbereitung pro Bewerbung (entsteht beim Status "Beworben").
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.

alter table jobs add column if not exists vorbereitung jsonb;
