-- Absagegründe: was eine Firma bei der Absage als Grund genannt hat.
-- Fließt als Lernpunkt in die Bewertung neuer Stellen ein.
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.

alter table jobs add column if not exists absage_notiz text;
