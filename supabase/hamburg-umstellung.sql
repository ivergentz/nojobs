-- Career Inbox: Umstellung auf Hamburg & Remote
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.

-- 1. Norwegen und Schweden stilllegen (Daten bleiben erhalten, tauchen nirgends mehr auf)
update jobs set status = 'INACTIVE' where source in ('nav', 'jobstream');
delete from import_cursor where id in ('nav', 'se');

-- 2. Bearbeitungsstatus absichern: die Inbox zeigt nur Stellen mit Status
update jobs set app_status = 'neu' where app_status is null;
alter table jobs alter column app_status set default 'neu';

-- 3. Deutsche Stellen mit dem neuen Prompt neu bewerten lassen.
--    Das alte Prompt nannte Norwegen/Schweden als Zielmarkt und hat deutsche
--    Stellen deshalb schlecht eingestuft.
update jobs
set evaluated_at = null
where source = 'ba' and status = 'ACTIVE' and app_status = 'neu';
