-- Schritt 2.5 · Passfoto (weitere Profile)
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht.
-- Legt nur einen privaten Speicher für Fotos an. Keine Tabelle, nichts an deinen Daten.
-- Welches Foto zu wem gehört, steht in profiles.einstellungen (foto).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

select (select count(*) from storage.buckets where id = 'fotos') as fotospeicher_angelegt;

-- RÜCKBAU: Speicher im Dashboard unter Storage → fotos löschen
