-- Run only in a disposable/local Supabase test database after applying both analytics migrations.
-- All rows use synthetic IDs and are rolled back with this transaction.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select ok(has_function_privilege('service_role', 'public.record_site_analytics_events_v2(uuid,uuid,jsonb,text,text,text,text)', 'EXECUTE'), 'service role can ingest v2 events');
select ok(not has_function_privilege('anon', 'public.record_site_analytics_events_v2(uuid,uuid,jsonb,text,text,text,text)', 'EXECUTE'), 'anon cannot ingest v2 events');
select ok(has_function_privilege('service_role', 'public.get_site_analytics_sessions(timestamptz,timestamptz,text,text,text,text,text,timestamptz,uuid,integer,uuid,text,text)', 'EXECUTE'), 'service role can query journeys');
select ok(not has_function_privilege('authenticated', 'public.get_site_analytics_session_detail(uuid)', 'EXECUTE'), 'authenticated cannot read journey details');

create temporary table journey_times as
select date_trunc('minute', now()) - interval '2 days' as first_start,
       date_trunc('minute', now()) - interval '1 day' as next_start;

insert into private.site_analytics_sessions (
  session_id, visitor_id, started_at, last_seen_at, entry_path, source, medium, device
)
select 'c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', first_start, now(), '/', 'instagram', 'social', 'mobile'
from journey_times
union all
select 'c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', next_start, now(), '/', 'direct', null, 'desktop'
from journey_times
union all
select 'c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002', first_start + interval '20 minutes', now(), '/', 'other', 'referral', 'mobile'
from journey_times;

with t as (select * from journey_times), fixture(
  event_id, offset_time, schema_version, event_name, page_path, page_visit_id, event_seq, tab_seq,
  form_instance_id, step_id, placement, destination, error_code, visible_percent, visible_ms, session_id
) as (values
  ('c7000000-0000-4000-8000-000000000001'::uuid, interval '0 minutes', 2, 'page_view', '/portfolio/', 'c3000000-0000-4000-8000-000000000001'::uuid, 1, 1, null::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000002'::uuid, interval '1 minute', 2, 'cta_view', '/portfolio/', 'c3000000-0000-4000-8000-000000000001'::uuid, 2, 1, null::uuid, null::text, 'portfolio-index', null::text, null::text, 75::smallint, 1500, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000003'::uuid, interval '2 minutes', 2, 'inquiry_cta_click', '/portfolio/', 'c3000000-0000-4000-8000-000000000001'::uuid, 3, 1, null::uuid, null::text, 'portfolio-index', 'google_form', null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000004'::uuid, interval '3 minutes', 2, 'cta_view', '/portfolio/', 'c3000000-0000-4000-8000-000000000001'::uuid, 4, 1, null::uuid, null::text, 'footer', null::text, null::text, 100::smallint, 60000, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000005'::uuid, interval '4 minutes', 2, 'inquiry_cta_click', '/portfolio/', 'c3000000-0000-4000-8000-000000000001'::uuid, 5, 1, null::uuid, null::text, 'hero', 'google_form', null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000017'::uuid, interval '4 minutes 30 seconds', 2, 'inquiry_cta_click', '/portfolio/', 'c3000000-0000-4000-8000-000000000001'::uuid, 6, 1, null::uuid, null::text, 'portfolio-index', 'google_form', null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000006'::uuid, interval '5 minutes', 2, 'page_view', '/cooperation/', 'c3000000-0000-4000-8000-000000000002'::uuid, 7, 2, null::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000022'::uuid, interval '7 minutes', 2, 'page_view', '/portfolio/', 'c3000000-0000-4000-8000-000000000006'::uuid, 1, 3, null::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000023'::uuid, interval '8 minutes', 2, 'page_view', '/cooperation/', 'c3000000-0000-4000-8000-000000000007'::uuid, 1, 4, null::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  ('c7000000-0000-4000-8000-000000000007'::uuid, interval '6 minutes', 1, 'inquiry_cta_click', '/portfolio/', null::uuid, null::integer, null::bigint, null::uuid, null::text, 'hero', 'google_form', null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000001'::uuid),
  -- Exact period end is excluded. This makes the direct return context-only in the first range.
  ('c7000000-0000-4000-8000-000000000008'::uuid, interval '0 minutes', 2, 'page_view', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 1, 1, null::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  ('c7000000-0000-4000-8000-000000000009'::uuid, interval '1 minute', 2, 'form_start', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 2, 1, 'c6000000-0000-4000-8000-000000000001'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  ('c7000000-0000-4000-8000-000000000010'::uuid, interval '2 minutes', 2, 'form_review', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 3, 1, 'c6000000-0000-4000-8000-000000000001'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  ('c7000000-0000-4000-8000-000000000011'::uuid, interval '3 minutes', 2, 'form_submit_attempt', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 4, 1, 'c6000000-0000-4000-8000-000000000001'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  ('c7000000-0000-4000-8000-000000000012'::uuid, interval '4 minutes', 2, 'form_submit_error', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 5, 1, 'c6000000-0000-4000-8000-000000000001'::uuid, null::text, null::text, null::text, 'network', null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  -- A second form instance in the same visit proves v2 uniqueness is per form, not per session.
  ('c7000000-0000-4000-8000-000000000013'::uuid, interval '5 minutes', 2, 'form_start', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 6, 1, 'c6000000-0000-4000-8000-000000000002'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  ('c7000000-0000-4000-8000-000000000014'::uuid, interval '6 minutes', 2, 'form_step_enter', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 7, 1, 'c6000000-0000-4000-8000-000000000002'::uuid, 'styles', null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  ('c7000000-0000-4000-8000-000000000015'::uuid, interval '7 minutes', 2, 'form_review', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 8, 1, 'c6000000-0000-4000-8000-000000000002'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid),
  ('c7000000-0000-4000-8000-000000000016'::uuid, interval '8 minutes', 2, 'form_submit_attempt', '/cooperation/', 'c3000000-0000-4000-8000-000000000003'::uuid, 9, 1, 'c6000000-0000-4000-8000-000000000002'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000002'::uuid)
  ,('c7000000-0000-4000-8000-000000000018'::uuid, interval '20 minutes', 2, 'form_start', '/cooperation/', 'c3000000-0000-4000-8000-000000000004'::uuid, 1, 1, 'c6000000-0000-4000-8000-000000000003'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000003'::uuid)
  ,('c7000000-0000-4000-8000-000000000019'::uuid, interval '21 minutes', 2, 'form_review', '/cooperation/', 'c3000000-0000-4000-8000-000000000004'::uuid, 2, 1, 'c6000000-0000-4000-8000-000000000003'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000003'::uuid)
  ,('c7000000-0000-4000-8000-000000000020'::uuid, interval '22 minutes', 2, 'form_submit_attempt', '/cooperation/', 'c3000000-0000-4000-8000-000000000004'::uuid, 3, 1, 'c6000000-0000-4000-8000-000000000004'::uuid, null::text, null::text, null::text, null::text, null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000003'::uuid)
  ,('c7000000-0000-4000-8000-000000000021'::uuid, interval '23 minutes', 2, 'form_submit_error', '/cooperation/', 'c3000000-0000-4000-8000-000000000004'::uuid, 4, 1, 'c6000000-0000-4000-8000-000000000004'::uuid, null::text, null::text, null::text, 'network', null::smallint, null::integer, 'c2000000-0000-4000-8000-000000000003'::uuid)
)
insert into private.site_analytics_events (
  event_id, schema_version, received_at, client_at, visitor_id, session_id, event_name, page_path,
  page_visit_id, tab_id, document_id, event_seq, tab_seq, form_instance_id, step_id,
  placement, destination, error_code, visible_percent, visible_ms
)
select f.event_id, f.schema_version, case when f.session_id = 'c2000000-0000-4000-8000-000000000002'::uuid
       then t.next_start + f.offset_time else t.first_start + f.offset_time end,
       case when f.session_id = 'c2000000-0000-4000-8000-000000000002'::uuid
       then t.next_start + f.offset_time else t.first_start + f.offset_time end,
       case when f.session_id = 'c2000000-0000-4000-8000-000000000003'::uuid
         then 'c1000000-0000-4000-8000-000000000002'::uuid
         else 'c1000000-0000-4000-8000-000000000001'::uuid end,
       f.session_id, f.event_name, f.page_path,
       f.page_visit_id,
       case when f.schema_version = 2 then case when f.session_id = 'c2000000-0000-4000-8000-000000000002'::uuid then 'c4000000-0000-4000-8000-000000000002'::uuid else 'c4000000-0000-4000-8000-000000000001'::uuid end else null end,
       case when f.schema_version = 2 then case
         when f.event_id = 'c7000000-0000-4000-8000-000000000022'::uuid then 'c5000000-0000-4000-8000-000000000003'::uuid
         when f.event_id = 'c7000000-0000-4000-8000-000000000023'::uuid then 'c5000000-0000-4000-8000-000000000004'::uuid
         when f.session_id = 'c2000000-0000-4000-8000-000000000002'::uuid then 'c5000000-0000-4000-8000-000000000002'::uuid
         else 'c5000000-0000-4000-8000-000000000001'::uuid end else null end,
       f.event_seq, f.tab_seq, f.form_instance_id, f.step_id,
       f.placement, f.destination, f.error_code, f.visible_percent, f.visible_ms
from t cross join fixture f;

insert into public.collaboration_requests (
  id, name, contact_method, contact_account, collaboration_type, description, consent, created_at
)
select 'c8000000-0000-4000-8000-000000000001', 'SYNTHETIC ANALYTICS', 'Instagram', 'fixture-only', '其他', 'synthetic fixture', true, next_start + interval '10 minutes'
from journey_times;
insert into private.inquiry_receipts (submission_id, inquiry_id, token_hash, request_hash, reference, created_at)
select 'c9000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', repeat('c', 64), repeat('d', 64), 'PHOX-CCCCCCCCCCCCCCCCCCCC', next_start + interval '10 minutes'
from journey_times;

select ok(public.record_site_analytics_inquiry_v2(
  'c9000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002',
  'c6000000-0000-4000-8000-000000000002'
), 'attribution binds only a committed receipt and observed form instance');

create temporary table first_period as
select public.get_site_analytics_sessions(
  p_start => first_start, p_end => next_start, p_result => 'portfolio_no_form_start', p_limit => 50
) as response
from journey_times;
create temporary table visitor_history as
select public.get_site_analytics_sessions(
  p_start => first_start, p_end => next_start, p_result => 'portfolio_no_form_start', p_limit => 1,
  p_visitor_id => 'c1000000-0000-4000-8000-000000000001'
) as response
from journey_times;

select is((select response ->> 'total' from first_period), '1', 'result count includes only the matching in-range visit');
select is((select jsonb_array_length(response -> 'items') from first_period), 1, 'result drilldown returns the matching visit');
select is((select response ->> 'total' from visitor_history), '2', 'visitor context total includes the later out-of-range visit');
select is((select jsonb_array_length(response -> 'items') from visitor_history), 1, 'visitor context uses bounded keyset pagination');
select ok((select response -> 'nextCursor' <> 'null'::jsonb from visitor_history), 'visitor history returns a stable next cursor');
select ok((select exists (
  select 1 from jsonb_array_elements(response -> 'items') item
  where item ->> 'sessionId' = 'c2000000-0000-4000-8000-000000000002'
    and item ->> 'source' = 'direct' and item ->> 'matchesCurrentFilter' = 'false'
    and item ->> 'everInquiryReceived' = 'true' and item ->> 'inquiryReceived' = 'false'
) from visitor_history), 'later direct success remains visible as context without entering the selected period');

create temporary table transition_drill as
select public.get_site_analytics_sessions(
  p_start => first_start, p_end => next_start, p_page_path => '/cooperation/',
  p_transition_from => '/portfolio/', p_transition_to => '/cooperation/', p_limit => 50
) as response
from journey_times;
select is((select response ->> 'total' from transition_drill), '1', 'a transition drill returns each matching session once');
select is((select response #>> '{items,0,sessionId}' from transition_drill), 'c2000000-0000-4000-8000-000000000001', 'a transition drill returns the session containing that exact adjacent path pair');

create temporary table return_period as
select public.get_site_analytics_sessions(
  p_start => next_start, p_end => now(), p_source => 'direct', p_result => 'error_then_success', p_limit => 50
) as response
from journey_times;
select is((select response ->> 'total' from return_period), '1', 'direct-source error-then-success visit has its own in-range count');
select ok((select exists (
  select 1 from jsonb_array_elements(response -> 'items') item
  where item ->> 'source' = 'direct' and item ->> 'submitError' = 'true'
    and item ->> 'inquiryReceived' = 'true' and item ->> 'errorThenSuccess' = 'true'
) from return_period), 'submit error and backend success are both retained on the same visit');

create temporary table v2_form_funnel as
select public.get_site_analytics_form_funnel(p_start => first_start, p_end => next_start) as response
from journey_times;
select is((select response #>> '{funnel,0,sessions}' from v2_form_funnel), '1', 'form start is counted by distinct session');
select is((select response #>> '{funnel,1,sessions}' from v2_form_funnel), '1', 'form review requires a matching form instance');
select is((select response #>> '{funnel,2,sessions}' from v2_form_funnel), '0', 'an attempt from a different form instance cannot complete the earlier review');
select is((select response #>> '{funnel,3,sessions}' from v2_form_funnel), '0', 'form steps without a matching backend receipt do not count as completed');

create temporary table visit_detail as
select public.get_site_analytics_session_detail('c2000000-0000-4000-8000-000000000002') as detail;
select ok((select detail -> 'events' @> '[{"eventName":"form_submit_error","errorCode":"network"}]'::jsonb from visit_detail), 'detail preserves allowlisted form error classification');
select is((select jsonb_array_length(detail -> 'inquiries') from visit_detail), 1, 'detail separates backend receipt evidence');
select is((select detail ->> 'firstMeasuredSource' from visit_detail), 'instagram', 'first measured source stays separate from the current direct visit');

create temporary table path_report as
select public.get_site_analytics_paths(p_start => first_start, p_end => next_start, p_limit => 100) as response
from journey_times;
select is((select (page ->> 'ctaDenominator')::integer from path_report, jsonb_array_elements(response -> 'pages') page where page ->> 'path' = '/portfolio/'), 3, 'CTA denominator is the deduplicated visible-or-clicked visit/placement union');
select is((select (page ->> 'ctaClicks')::integer from path_report, jsonb_array_elements(response -> 'pages') page where page ->> 'path' = '/portfolio/'), 2, 'CTA numerator counts clicked pairs once even when a pair has repeated clicks');
select is((select (page ->> 'visibleProof')::integer from path_report, jsonb_array_elements(response -> 'pages') page where page ->> 'path' = '/portfolio/'), 2, 'visible proof is counted independently from click-supplemented exposure');
select is((select (page ->> 'clickSupplement')::integer from path_report, jsonb_array_elements(response -> 'pages') page where page ->> 'path' = '/portfolio/'), 1, 'fast click without a visibility event supplies one denominator unit');
select ok((select (page ->> 'ctaClickRate')::numeric <= 100 from path_report, jsonb_array_elements(response -> 'pages') page where page ->> 'path' = '/portfolio/'), 'paired CTA click rate cannot exceed 100 percent');
select is((select response ->> 'legacyUnpairedClicks' from path_report), '1', 'v1 CTA clicks stay visible as unpaired and do not enter the v2 ratio');
select ok((select response -> 'transitions' @> '[{"from":"/portfolio/","to":"/cooperation/","sessions":1,"visits":2}]'::jsonb from path_report), 'transition sessions are distinct while repeated adjacent page pairs remain available as context');

select is((public.record_site_analytics_events_v2(
  'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  '[
    {"event_id":"d7000000-0000-4000-8000-000000000001","schema_version":2,"event_name":"page_view","page_path":"/","page_visit_id":"d3000000-0000-4000-8000-000000000001","tab_id":"d4000000-0000-4000-8000-000000000001","document_id":"d5000000-0000-4000-8000-000000000001","event_seq":1,"tab_seq":1},
    {"event_id":"d7000000-0000-4000-8000-000000000002","schema_version":2,"event_name":"cta_view","page_path":"/","page_visit_id":"d3000000-0000-4000-8000-000000000001","tab_id":"d4000000-0000-4000-8000-000000000001","document_id":"d5000000-0000-4000-8000-000000000001","event_seq":2,"tab_seq":1,"placement":"footer","visible_percent":100,"visible_ms":60000}
  ]'::jsonb,
  'direct', null, null, 'desktop'
) ->> 'accepted')::integer, 2, 'v2 ingestion accepts exact 60000 ms visibility boundary');
select is((public.record_site_analytics_events_v2(
  'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
  '[
    {"event_id":"d7000000-0000-4000-8000-000000000001","schema_version":2,"event_name":"page_view","page_path":"/","page_visit_id":"d3000000-0000-4000-8000-000000000001","tab_id":"d4000000-0000-4000-8000-000000000001","document_id":"d5000000-0000-4000-8000-000000000001","event_seq":1,"tab_seq":1},
    {"event_id":"d7000000-0000-4000-8000-000000000002","schema_version":2,"event_name":"cta_view","page_path":"/","page_visit_id":"d3000000-0000-4000-8000-000000000001","tab_id":"d4000000-0000-4000-8000-000000000001","document_id":"d5000000-0000-4000-8000-000000000001","event_seq":2,"tab_seq":1,"placement":"footer","visible_percent":100,"visible_ms":60000}
  ]'::jsonb,
  'direct', null, null, 'desktop'
) ->> 'accepted')::integer, 0, 'event ID retry is deduplicated');
select is((select count(*)::integer from private.site_analytics_events where event_id in ('d7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002')), 2, 'v2 retries persist only one copy of each event');

insert into private.site_analytics_sessions (
  session_id, visitor_id, started_at, last_seen_at, entry_path, source, device
) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', now() - interval '91 days', now() - interval '91 days', '/', 'direct', 'unknown'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', now(), now(), '/', 'direct', 'unknown');
insert into private.site_analytics_events (
  event_id, schema_version, received_at, client_at, visitor_id, session_id, event_name, page_path,
  page_visit_id, tab_id, document_id, event_seq, tab_seq
) values
  ('e7000000-0000-4000-8000-000000000001', 2, now() - interval '91 days', now() - interval '91 days', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'page_view', '/', 'e3000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 1, 1),
  ('e7000000-0000-4000-8000-000000000002', 2, now(), now(), 'e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'page_view', '/', 'e3000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000002', 1, 1);
update private.site_analytics_inquiry_attribution
set created_at = now() - interval '91 days'
where inquiry_id = 'c8000000-0000-4000-8000-000000000001';
select public.purge_site_analytics();
select is((select count(*)::integer from private.site_analytics_events where event_id = 'e7000000-0000-4000-8000-000000000001'), 0, '90-day purge removes expired v2 events');
select is((select count(*)::integer from private.site_analytics_events where event_id = 'e7000000-0000-4000-8000-000000000002'), 1, '90-day purge retains current v2 events');
select is((select count(*)::integer from private.site_analytics_sessions where session_id = 'e2000000-0000-4000-8000-000000000001'), 0, '90-day purge removes expired sessions');
select is((select count(*)::integer from private.site_analytics_inquiry_attribution where inquiry_id = 'c8000000-0000-4000-8000-000000000001'), 0, '90-day purge removes expired attribution');

select * from finish();
rollback;
