-- Suchspur B (Career Upgrade): speichert, zu welcher Spur eine Stelle gehört.
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.

alter table jobs add column if not exists eval_spur text;
