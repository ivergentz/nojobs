-- Begründungen beim Labeln (Ignorieren / Anschauen).
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.

alter table jobs add column if not exists label_gruende text[];
alter table jobs add column if not exists label_notiz text;
