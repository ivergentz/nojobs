-- Career Inbox: Protokoll für ausgefallene Schnittstellen (Seite /log)
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.

create table if not exists quellen_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  quelle text not null,
  detail text,
  meldung text not null
);

create index if not exists quellen_log_created_at_idx on quellen_log (created_at desc);

-- Nur der Server (Service-Role-Schlüssel) liest und schreibt.
alter table quellen_log enable row level security;

-- Alte Einträge nach 60 Tagen löschen, damit die Tabelle klein bleibt.
-- (Optional: läuft nur, wenn pg_cron aktiviert ist. Sonst diese Zeilen weglassen.)
-- select cron.schedule('quellen_log_aufraeumen', '30 3 * * *', $$delete from quellen_log where created_at < now() - interval '60 days'$$);
