-- Run ONLY in a disposable/local Supabase test database after applying the migration.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select ok(not has_table_privilege('anon', 'private.site_analytics_events', 'SELECT'), 'anon cannot read raw events');
select ok(not has_table_privilege('authenticated', 'private.site_analytics_sessions', 'SELECT'), 'authenticated cannot read sessions');
select ok(not has_table_privilege('anon', 'private.site_analytics_inquiry_attribution', 'SELECT'), 'anon cannot read inquiry attribution');
select ok(has_function_privilege('service_role', 'public.record_site_analytics_events(uuid,uuid,jsonb,text,text,text,text)', 'EXECUTE'), 'service role can ingest events');
select ok(not has_function_privilege('anon', 'public.record_site_analytics_events(uuid,uuid,jsonb,text,text,text,text)', 'EXECUTE'), 'anon cannot ingest events');
select ok(not has_function_privilege('authenticated', 'public.get_site_analytics_report(timestamptz,timestamptz,boolean)', 'EXECUTE'), 'authenticated cannot read reports');

insert into private.site_analytics_sessions (
  session_id, visitor_id, started_at, last_seen_at, entry_path, source, device
)
select
  ('a2000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
  ('a1000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
  now(), now(), '/', case when n = 1 then 'instagram' else 'direct' end, 'desktop'
from generate_series(1, 10) as n;

insert into private.site_analytics_events (
  event_id, schema_version, received_at, client_at, visitor_id, session_id,
  event_name, page_path, placement, destination
)
values
  ('a3200000-0000-4000-8000-000000000001', 1, now(), now() - interval '30 seconds',
   'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
   'inquiry_cta_click', '/', 'header-desktop', 'google_form'),
  ('a3210000-0000-4000-8000-000000000001', 1, now(), now() - interval '20 seconds',
   'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
   'outbound_contact_click', '/', null, 'google_form');

insert into private.site_analytics_events (
  event_id, schema_version, received_at, client_at, visitor_id, session_id, event_name, page_path
)
select
  ('a3000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
  1, now(), now() - interval '1 minute',
  ('a1000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
  ('a2000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
  'page_view', '/'
from generate_series(1, 10) as n;

insert into private.site_analytics_events (
  event_id, schema_version, received_at, client_at, visitor_id, session_id, event_name, page_path
)
select ids.event_id, 1, now(), ids.client_at,
  ('a1000000-0000-4000-8000-' || lpad(to_hex(ids.visitor_no), 12, '0'))::uuid,
  ('a2000000-0000-4000-8000-' || lpad(to_hex(ids.visitor_no), 12, '0'))::uuid,
  ids.event_name, '/'
from (
  values
    ('a3100000-0000-4000-8000-000000000001'::uuid, 1, 'form_start', now() - interval '60 seconds'),
    ('a3110000-0000-4000-8000-000000000001'::uuid, 1, 'form_review', now() - interval '50 seconds'),
    ('a3120000-0000-4000-8000-000000000001'::uuid, 1, 'form_submit_attempt', now() - interval '40 seconds'),
    ('a3100000-0000-4000-8000-000000000002'::uuid, 2, 'form_start', now() - interval '60 seconds'),
    ('a3110000-0000-4000-8000-000000000002'::uuid, 2, 'form_review', now() - interval '50 seconds'),
    ('a3120000-0000-4000-8000-000000000002'::uuid, 2, 'form_submit_attempt', now() - interval '40 seconds'),
    ('a3100000-0000-4000-8000-000000000003'::uuid, 3, 'form_start', now() - interval '60 seconds'),
    ('a3110000-0000-4000-8000-000000000003'::uuid, 3, 'form_review', now() - interval '40 seconds'),
    ('a3120000-0000-4000-8000-000000000003'::uuid, 3, 'form_submit_attempt', now() - interval '50 seconds')
) as ids(event_id, visitor_no, event_name, client_at);

insert into public.collaboration_requests (id, name, contact_method, contact_account, collaboration_type, description, consent, created_at)
values
  ('a4000000-0000-4000-8000-000000000001', 'TEST ANALYTICS', 'Instagram', 'test-account', '其他', 'test-only', true, now() - interval '30 seconds'),
  -- This inquiry predates its session's review/attempt: attributed, but not a completed funnel.
  ('a4000000-0000-4000-8000-000000000002', 'TEST ANALYTICS', 'Instagram', 'test-account', '其他', 'test-only', true, now() - interval '55 seconds'),
  ('a4000000-0000-4000-8000-000000000003', 'TEST ANALYTICS', 'Instagram', 'test-account', '其他', 'test-only', true, now() - interval '30 seconds');

insert into private.site_analytics_inquiry_attribution (inquiry_id, visitor_id, session_id)
values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001');

insert into private.inquiry_receipts (submission_id, inquiry_id, token_hash, request_hash, reference, created_at)
values (
  'a5000000-0000-4000-8000-000000000003',
  'a4000000-0000-4000-8000-000000000003',
  repeat('a', 64), repeat('b', 64), 'PHOX-AAAAAAAAAAAAAAAAAAAA', now() - interval '30 seconds'
);

select ok(
  public.record_site_analytics_inquiry(
    'a5000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002'
  ),
  'inquiry attribution resolves only through a committed receipt'
);
select ok(not public.record_site_analytics_inquiry(
  'a5000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000002'
), 'attribution retry does not create another mapping');

create temporary table analytics_report_fixture as
select public.get_site_analytics_report(now() - interval '1 day', now() + interval '1 second', false) as report;

select is((select report #>> '{totals,visitors}' from analytics_report_fixture), '10', 'ten measured visitors are deduplicated across the report');
select is((select report #>> '{totals,pageViews}' from analytics_report_fixture), '10', 'page views count each accepted event');
select is((select report #>> '{totals,inquiries}' from analytics_report_fixture), '3', 'all committed inquiries remain in the success total');
select is((select jsonb_array_length(report -> 'clicks') from analytics_report_fixture), 2, 'CTA and outbound intent are reported as separate click categories');
select is((select report #>> '{totals,convertedVisitors}' from analytics_report_fixture), '2', 'two visitors convert even though one creates two inquiries');
select is((select (report #>> '{totals,conversionRate}')::numeric from analytics_report_fixture), 20::numeric, 'visitor conversion rate uses two of ten visitors');
select is((select report #>> '{funnel,0,sessions}' from analytics_report_fixture), '3', 'funnel starts count distinct sessions');
select is((select report #>> '{funnel,2,sessions}' from analytics_report_fixture), '2', 'funnel attempts require an earlier review');
select is((select report #>> '{funnel,3,sessions}' from analytics_report_fixture), '2', 'funnel success requires an ordered same-session submission');
select is((select report ->> 'unpairedInquiries' from analytics_report_fixture), '1', 'unpaired successes remain visible outside the funnel');

select is(
  (public.record_site_analytics_events(
    'a1000000-0000-4000-8000-000000000011',
    'a2000000-0000-4000-8000-000000000011',
    '[{"event_id":"a3990000-0000-4000-8000-000000000011","event_name":"page_view","page_path":"/"}]'::jsonb,
    'direct', null, null, 'desktop'
  ) ->> 'accepted')::integer,
  1,
  'first event delivery is accepted'
);
select is(
  (public.record_site_analytics_events(
    'a1000000-0000-4000-8000-000000000011',
    'a2000000-0000-4000-8000-000000000011',
    '[{"event_id":"a3990000-0000-4000-8000-000000000011","event_name":"page_view","page_path":"/"}]'::jsonb,
    'direct', null, null, 'desktop'
  ) ->> 'accepted')::integer,
  0,
  'retry with the same event ID is deduplicated'
);
select is((select count(*)::integer from private.site_analytics_events where event_id = 'a3990000-0000-4000-8000-000000000011'), 1, 'a retried event exists only once');

select * from finish();
rollback;
