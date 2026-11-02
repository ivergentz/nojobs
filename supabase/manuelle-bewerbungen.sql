-- Bewerbungen aus der Zeit vor der Career Inbox nachtragen.
-- Damit greift die Warnung "bereits beworben" auch für diese Firmen (60 Tage ab Datum).
-- Supabase → SQL Editor → einfügen → Run. Mehrfaches Ausführen schadet nicht:
-- Steht die Firma schon als beworben/Interview/Absage in der Inbox, wird sie übersprungen.

insert into jobs (uuid, source, title, employer_name, status, app_status, app_status_at)
select v.uuid, 'manuell', v.title, v.employer_name, 'INACTIVE', v.app_status, v.app_status_at
from (
  values
    ('manuell-medac-ai-solutions-partner',  'AI Solutions Partner',                        'medac GmbH',          'absage',   now(), 'medac'),
    ('manuell-freenet-po-ai-bots',          'Product Owner AI & Conversational Bots',      'freenet AG',          'absage',   now(), 'freenet'),
    ('manuell-synergeticon-pm-ki',          'Projektmanager KI-Softwareprojekte',          'Synergeticon GmbH',   'absage',   now(), 'synergeticon'),
    ('manuell-catworkx-ai-program-manager', 'AI Program Manager',                          'catworkx GmbH',       'beworben', now(), 'catworkx'),
    ('manuell-plancraft-senior-ai-pm',      'Senior AI Product Manager',                   'plancraft',           'beworben', now(), 'plancraft')
) as v(uuid, title, employer_name, app_status, app_status_at, kern)
where not exists (
  select 1 from jobs j
  where j.uuid = v.uuid
     or (j.app_status in ('beworben', 'interview', 'absage') and j.employer_name ilike '%' || v.kern || '%')
);

-- Kontrolle: alle Bewerbungen, neueste zuerst
select employer_name, title, app_status, app_status_at, source
from jobs
where app_status in ('beworben', 'interview', 'absage')
order by app_status_at desc;
