-- Kosten pro Claude-Aufruf (Career Inbox v27).
-- Im Supabase-Dashboard unter SQL Editor einmal ausführen.

create table if not exists api_kosten (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  profil             text not null default 'iver',
  zweck              text not null,          -- bewertung · unterlagen · fragen · vorbereitung · recherche
  anlass             text,                   -- morgenlauf · steuerung · status · knopf
  job_uuid           text,
  modell             text,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens  integer not null default 0,
  web_suchen         integer not null default 0,
  kosten_usd         numeric(12, 6),
  ok                 boolean not null default true
);

create index if not exists api_kosten_zeit on api_kosten (created_at desc);
create index if not exists api_kosten_profil on api_kosten (profil, created_at desc);

alter table api_kosten enable row level security;

-- Tagessummen je Person, Zweck und Anlass (Tag nach deutscher Zeit).
-- Die Kosten-Seite liest nur diese kleine Sicht statt tausender Einzelzeilen.
create or replace view api_kosten_tag
with (security_invoker = on) as
select
  (created_at at time zone 'Europe/Berlin')::date as tag,
  profil,
  zweck,
  coalesce(anlass, '–') as anlass,
  count(*)                          as aufrufe,
  count(distinct job_uuid)          as stellen,
  sum(input_tokens)                 as input_tokens,
  sum(output_tokens)                as output_tokens,
  sum(cache_write_tokens)           as cache_write_tokens,
  sum(cache_read_tokens)            as cache_read_tokens,
  sum(web_suchen)                   as web_suchen,
  coalesce(sum(kosten_usd), 0)      as kosten_usd,
  count(*) filter (where not ok)    as fehlgeschlagen
from api_kosten
group by 1, 2, 3, 4;
