-- Career Inbox: Stellen ohne Ortsangabe aufräumen
-- Legt Stellen still, die keinen Ort haben und im Text weder Hamburg noch
-- Remote nennen (z. B. internationale Stellen aus Firmen-Feeds).
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.

update jobs
set status = 'INACTIVE'
where status = 'ACTIVE'
  and source in ('ats', 'google', 'arbeitnow')
  and (municipal is null or trim(municipal) = '')
  and coalesce(description, '') not ilike '%hamburg%'
  and not (
    coalesce(description, '') ~* '(remote|home ?office|mobiles arbeiten)'
    and coalesce(description, '') ~* '(deutschland|germany|dach|bundesweit)'
  );
