begin;

alter table private.site_analytics_events
  add column page_visit_id uuid,
  add column tab_id uuid,
  add column document_id uuid,
  add column event_seq integer,
  add column tab_seq bigint,
  add column form_instance_id uuid,
  add column step_id text,
  add column visible_percent smallint,
  add column visible_ms integer;

alter table private.site_analytics_events
  drop constraint if exists site_analytics_events_schema_version_check,
  drop constraint if exists site_analytics_events_event_name_check,
  drop constraint if exists site_analytics_events_placement_check;

alter table private.site_analytics_events
  add constraint site_analytics_events_schema_version_check check (schema_version in (1, 2)),
  add constraint site_analytics_events_event_name_check check (event_name in (
    'page_view', 'inquiry_cta_click', 'cta_view', 'outbound_contact_click',
    'form_start', 'form_review', 'form_submit_attempt', 'form_submit_error',
    'form_step_enter', 'form_step_complete'
  )),
  add constraint site_analytics_events_placement_check check (placement is null or placement in (
    'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
    'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board', 'contact-icon',
    'journal-footer', 'journal-body', 'plans', 'footer', 'other'
  )),
  add constraint site_analytics_events_schema_contract_check check (
    (schema_version = 1 and page_visit_id is null and tab_id is null and document_id is null
      and event_seq is null and tab_seq is null and form_instance_id is null and step_id is null
      and visible_percent is null and visible_ms is null)
    or
    (schema_version = 2 and page_visit_id is not null and tab_id is not null and document_id is not null
      and event_seq between 1 and 10000 and tab_seq between 1 and 1000000000
      and ((event_name in ('form_start', 'form_review', 'form_submit_attempt', 'form_submit_error', 'form_step_enter', 'form_step_complete') and form_instance_id is not null)
        or (event_name not in ('form_start', 'form_review', 'form_submit_attempt', 'form_submit_error', 'form_step_enter', 'form_step_complete') and form_instance_id is null))
      and ((event_name in ('form_step_enter', 'form_step_complete') and step_id in ('styles', 'details', 'review'))
        or (event_name not in ('form_step_enter', 'form_step_complete') and step_id is null))
      and ((event_name = 'cta_view' and visible_percent between 50 and 100 and visible_ms between 1000 and 60000 and placement is not null)
        or (event_name <> 'cta_view' and visible_percent is null and visible_ms is null)))
  );

drop index if exists private.site_analytics_events_form_start_once_idx;
drop index if exists private.site_analytics_events_form_review_once_idx;
create unique index site_analytics_events_form_start_v1_once_idx
  on private.site_analytics_events (session_id) where event_name = 'form_start' and schema_version = 1;
create unique index site_analytics_events_form_review_v1_once_idx
  on private.site_analytics_events (session_id) where event_name = 'form_review' and schema_version = 1;
create unique index site_analytics_events_form_start_v2_instance_once_idx
  on private.site_analytics_events (session_id, form_instance_id) where event_name = 'form_start' and schema_version = 2;
create unique index site_analytics_events_form_review_v2_instance_once_idx
  on private.site_analytics_events (session_id, form_instance_id) where event_name = 'form_review' and schema_version = 2;
create index site_analytics_events_session_pagevisit_idx
  on private.site_analytics_events (session_id, page_visit_id, placement, event_name);
create index site_analytics_events_v2_tab_sequence_idx
  on private.site_analytics_events (session_id, tab_id, tab_seq) where schema_version = 2 and event_name = 'page_view';
create index site_analytics_events_form_instance_idx
  on private.site_analytics_events (session_id, form_instance_id, received_at) where form_instance_id is not null;

alter table private.site_analytics_inquiry_attribution
  add column form_instance_id uuid;

create or replace function public.record_site_analytics_events_v2(
  p_visitor_id uuid,
  p_session_id uuid,
  p_events jsonb,
  p_source text,
  p_medium text,
  p_campaign text,
  p_device text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_count integer;
  v_written integer;
  v_entry_path text;
begin
  if p_visitor_id is null or p_session_id is null
    or p_source not in ('direct', 'instagram', 'threads', 'facebook', 'google', 'other')
    or (p_medium is not null and p_medium not in ('social', 'story', 'post', 'bio', 'referral', 'organic', 'paid', 'email', 'other'))
    or (p_campaign is not null and (length(p_campaign) not between 1 and 40 or p_campaign !~ '^[a-z0-9][a-z0-9_-]*$'))
    or p_device not in ('mobile', 'tablet', 'desktop', 'unknown')
    or p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  v_event_count := jsonb_array_length(p_events);
  if v_event_count < 1 or v_event_count > 10 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_events) as item(value)
    where jsonb_typeof(value) <> 'object'
      or value - array['event_id', 'schema_version', 'event_name', 'page_path', 'client_at', 'placement', 'destination', 'error_code', 'page_visit_id', 'tab_id', 'document_id', 'event_seq', 'tab_seq', 'form_instance_id', 'step_id', 'visible_percent', 'visible_ms']::text[] <> '{}'::jsonb
      or coalesce(value ->> 'event_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(value ->> 'schema_version', '') !~ '^[12]$'
      or coalesce(value ->> 'event_name', '') not in (
        'page_view', 'inquiry_cta_click', 'cta_view', 'outbound_contact_click',
        'form_start', 'form_review', 'form_submit_attempt', 'form_submit_error',
        'form_step_enter', 'form_step_complete'
      )
      or (value ->> 'event_name' in ('cta_view', 'form_step_enter', 'form_step_complete') and value ->> 'schema_version' <> '2')
      or coalesce(value ->> 'page_path', '') !~ '^/'
      or length(value ->> 'page_path') > 500
      or position('?' in coalesce(value ->> 'page_path', '')) > 0
      or position('#' in coalesce(value ->> 'page_path', '')) > 0
      or coalesce(value ->> 'page_path', '') ~ '^/(admin|client|cooperation-status|projects/preview)(/|$)'
      or (value ->> 'schema_version' = '1' and (
        nullif(value ->> 'page_visit_id', '') is not null or nullif(value ->> 'tab_id', '') is not null
        or nullif(value ->> 'document_id', '') is not null or nullif(value ->> 'form_instance_id', '') is not null
        or nullif(value ->> 'event_seq', '') is not null or nullif(value ->> 'tab_seq', '') is not null
        or nullif(value ->> 'step_id', '') is not null or nullif(value ->> 'visible_percent', '') is not null
        or nullif(value ->> 'visible_ms', '') is not null
      ))
      or (value ->> 'schema_version' = '2' and (
        coalesce(value ->> 'page_visit_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(value ->> 'tab_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(value ->> 'document_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or not (case when coalesce(value ->> 'event_seq', '') ~ '^[1-9][0-9]{0,4}$'
          then (value ->> 'event_seq')::integer between 1 and 10000 else false end)
        or not (case when coalesce(value ->> 'tab_seq', '') ~ '^[1-9][0-9]{0,9}$'
          then (value ->> 'tab_seq')::bigint between 1 and 1000000000 else false end)
      ))
      or (value ->> 'event_name' in ('form_start', 'form_review', 'form_submit_attempt', 'form_submit_error', 'form_step_enter', 'form_step_complete')
        and value ->> 'schema_version' = '2'
        and coalesce(value ->> 'form_instance_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or (value ->> 'event_name' in ('form_step_enter', 'form_step_complete') and coalesce(value ->> 'step_id', '') not in ('styles', 'details', 'review'))
      or (value ->> 'event_name' not in ('form_step_enter', 'form_step_complete') and nullif(value ->> 'step_id', '') is not null)
      or (value ->> 'event_name' = 'inquiry_cta_click' and (
        coalesce(value ->> 'placement', '') not in (
          'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
          'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board', 'contact-icon',
          'journal-footer', 'journal-body', 'plans', 'footer', 'other'
        )
        or coalesce(value ->> 'destination', '') not in ('internal', 'google_form', 'instagram', 'threads', 'facebook', 'email', 'other')
      ))
      or (value ->> 'event_name' = 'cta_view' and (
        value ->> 'schema_version' <> '2'
        or coalesce(value ->> 'placement', '') not in (
          'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
          'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board', 'contact-icon',
          'journal-footer', 'journal-body', 'plans', 'footer', 'other'
        )
        or coalesce(value ->> 'visible_percent', '') !~ '^(5[0-9]|[6-9][0-9]|100)$'
        or not (case when coalesce(value ->> 'visible_ms', '') ~ '^[0-9]{4,5}$'
          then (value ->> 'visible_ms')::integer between 1000 and 60000 else false end)
      ))
      or (value ->> 'event_name' = 'outbound_contact_click' and
        coalesce(value ->> 'destination', '') not in ('google_form', 'instagram', 'threads', 'facebook', 'email', 'other'))
      or (value ->> 'event_name' = 'form_submit_error' and
        coalesce(value ->> 'error_code', '') not in ('validation', 'network', 'server', 'rate_limited', 'unknown'))
  ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if (select count(*) from private.site_analytics_events
      where session_id = p_session_id and received_at >= pg_catalog.now() - interval '1 minute') + v_event_count > 120 then
    return jsonb_build_object('accepted', 0, 'rate_limited', true);
  end if;

  select value ->> 'page_path' into v_entry_path
  from jsonb_array_elements(p_events) as item(value)
  where value ->> 'event_name' = 'page_view'
  order by (value ->> 'client_at') nulls last
  limit 1;

  insert into private.site_analytics_sessions (
    session_id, visitor_id, started_at, last_seen_at, entry_path, source, medium, campaign, device
  ) values (
    p_session_id, p_visitor_id, pg_catalog.now(), pg_catalog.now(), coalesce(v_entry_path, '/'), p_source, p_medium, p_campaign, p_device
  ) on conflict (session_id) do update
    set last_seen_at = greatest(private.site_analytics_sessions.last_seen_at, excluded.last_seen_at)
    where private.site_analytics_sessions.visitor_id = excluded.visitor_id;

  if not found then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  insert into private.site_analytics_events (
    event_id, schema_version, received_at, client_at, visitor_id, session_id, event_name, page_path,
    placement, destination, error_code, page_visit_id, tab_id, document_id, event_seq, tab_seq,
    form_instance_id, step_id, visible_percent, visible_ms
  )
  select
    (value ->> 'event_id')::uuid,
    (value ->> 'schema_version')::smallint,
    pg_catalog.now(),
    case when coalesce(value ->> 'client_at', '') = '' then null else (value ->> 'client_at')::timestamptz end,
    p_visitor_id,
    p_session_id,
    value ->> 'event_name',
    value ->> 'page_path',
    nullif(value ->> 'placement', ''),
    nullif(value ->> 'destination', ''),
    nullif(value ->> 'error_code', ''),
    nullif(value ->> 'page_visit_id', '')::uuid,
    nullif(value ->> 'tab_id', '')::uuid,
    nullif(value ->> 'document_id', '')::uuid,
    nullif(value ->> 'event_seq', '')::integer,
    nullif(value ->> 'tab_seq', '')::bigint,
    nullif(value ->> 'form_instance_id', '')::uuid,
    nullif(value ->> 'step_id', ''),
    nullif(value ->> 'visible_percent', '')::smallint,
    nullif(value ->> 'visible_ms', '')::integer
  from jsonb_array_elements(p_events) as item(value)
  on conflict do nothing;

  get diagnostics v_written = row_count;
  return jsonb_build_object('accepted', v_written, 'rate_limited', false);
end;
$$;

create or replace function public.record_site_analytics_inquiry_v2(
  p_submission_id uuid,
  p_visitor_id uuid,
  p_session_id uuid,
  p_form_instance_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_written integer;
  v_form_instance_id uuid;
begin
  if p_submission_id is null or p_visitor_id is null or p_session_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select inquiry_id into v_inquiry_id
  from private.inquiry_receipts
  where submission_id = p_submission_id;
  if v_inquiry_id is null then return false; end if;

  -- A valid instance UUID may arrive before its event batch; correlation alone never proves funnel completion.
  v_form_instance_id := p_form_instance_id;

  insert into private.site_analytics_inquiry_attribution (inquiry_id, visitor_id, session_id, form_instance_id)
  select v_inquiry_id, p_visitor_id, p_session_id, v_form_instance_id
  where exists (
    select 1 from private.site_analytics_sessions s
    where s.session_id = p_session_id and s.visitor_id = p_visitor_id
  )
  on conflict (inquiry_id) do nothing;

  get diagnostics v_written = row_count;
  return v_written = 1;
end;
$$;

create or replace function private.site_analytics_session_rows(
  p_start timestamptz,
  p_end timestamptz,
  p_source text,
  p_device text,
  p_page_path text,
  p_result text,
  p_visitor_prefix text,
  p_visitor_id uuid
)
returns table (
  session_id uuid,
  visitor_id uuid,
  started_at timestamptz,
  source text,
  medium text,
  campaign text,
  device text,
  entry_path text,
  entry_path_uncertain boolean,
  last_page_path text,
  last_page_uncertain boolean,
  page_views bigint,
  distinct_pages bigint,
  event_count bigint,
  has_form_start boolean,
  has_cta_click boolean,
  has_submit_error boolean,
  has_success boolean,
  ever_inquiry_received boolean,
  error_before_success boolean,
  first_error_at timestamptz,
  first_success_at timestamptz,
  first_inquiry_received_at timestamptz,
  last_event_at timestamptz,
  in_range boolean,
  matches_filter boolean
)
language plpgsql
set search_path = ''
as $$
begin
  if p_start is null or p_end is null or p_start >= p_end
    or p_end > pg_catalog.now() + interval '1 minute'
    or p_start < pg_catalog.now() - interval '90 days'
    or (p_source is not null and p_source not in ('direct', 'instagram', 'threads', 'facebook', 'google', 'other'))
    or (p_device is not null and p_device not in ('mobile', 'tablet', 'desktop', 'unknown'))
    or (p_result is not null and p_result not in ('portfolio_no_form_start', 'cta_no_form_start', 'submit_error', 'error_then_success'))
    or (p_page_path is not null and (p_page_path !~ '^/' or length(p_page_path) > 500 or p_page_path ~ '[?#]'))
    or (p_visitor_prefix is not null and p_visitor_prefix !~ '^[0-9a-f]{1,8}$') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  return query
  with base as (
    select s.session_id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device,
      count(e.event_id) filter (where e.event_name = 'page_view')::bigint as page_views,
      count(distinct e.page_path) filter (where e.event_name = 'page_view')::bigint as distinct_pages,
      count(e.event_id)::bigint as event_count,
      coalesce(bool_or(e.event_name = 'form_start'), false) as has_form_start,
      coalesce(bool_or(e.event_name = 'inquiry_cta_click'), false) as has_cta_click,
      coalesce(bool_or(e.event_name = 'form_submit_error'), false) as has_submit_error,
      min(e.received_at) filter (where e.event_name = 'form_submit_error') as first_error_at,
      max(e.received_at) as last_event_at,
      coalesce(bool_or(e.event_name = 'page_view' and (e.page_path = '/portfolio/' or e.page_path like '/portfolio/%')), false) as saw_portfolio
    from private.site_analytics_sessions s
    left join private.site_analytics_events e
      on e.session_id = s.session_id and e.visitor_id = s.visitor_id
      and e.received_at >= p_start and e.received_at < p_end
    where s.last_seen_at >= pg_catalog.now() - interval '90 days'
      and (p_visitor_id is null or s.visitor_id = p_visitor_id)
      and (
        (p_visitor_id is not null)
        or exists (select 1 from private.site_analytics_events er where er.session_id = s.session_id and er.received_at >= p_start and er.received_at < p_end)
        or exists (select 1 from private.site_analytics_inquiry_attribution a join public.collaboration_requests i on i.id = a.inquiry_id where a.session_id = s.session_id and i.created_at >= p_start and i.created_at < p_end)
      )
    group by s.session_id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device
  ),
  enriched as (
    select b.*,
      entry_page.path as entry_path,
      coalesce(entry_page.uncertain, false) as entry_path_uncertain,
      last_page.path as last_page_path,
      coalesce(last_page.uncertain, false) as last_page_uncertain,
      success.first_success_at,
      exists (
        select 1 from private.site_analytics_inquiry_attribution a
        join public.collaboration_requests i on i.id = a.inquiry_id
        where a.session_id = b.session_id and a.visitor_id = b.visitor_id
          and i.created_at >= p_start and i.created_at < p_end
      ) as has_success,
      exists (
        select 1 from private.site_analytics_events error_event
        join private.site_analytics_inquiry_attribution a on a.session_id = error_event.session_id and a.visitor_id = error_event.visitor_id
        join public.collaboration_requests i on i.id = a.inquiry_id
        where error_event.session_id = b.session_id and error_event.event_name = 'form_submit_error'
          and error_event.received_at >= p_start and error_event.received_at < p_end
          and i.created_at >= p_start and i.created_at < p_end and error_event.received_at <= i.created_at
      ) as error_before_success,
      retained_success.first_inquiry_received_at is not null as ever_inquiry_received,
      retained_success.first_inquiry_received_at,
      exists (
        select 1 from private.site_analytics_events e
        where e.session_id = b.session_id and e.event_name = 'page_view'
          and e.received_at >= p_start and e.received_at < p_end and e.page_path = p_page_path
      ) as has_selected_page
    from base b
    left join lateral (
      select case when count(distinct e.page_path) = 1 then min(e.page_path) else null end as path,
        count(distinct e.page_path) > 1 as uncertain
      from private.site_analytics_events e
      where e.session_id = b.session_id and e.event_name = 'page_view'
        and e.received_at = (select min(e2.received_at) from private.site_analytics_events e2 where e2.session_id = b.session_id and e2.event_name = 'page_view' and e2.received_at >= pg_catalog.now() - interval '90 days')
    ) entry_page on true
    left join lateral (
      select case when count(distinct e.page_path) = 1 then min(e.page_path) else null end as path,
        count(distinct e.page_path) > 1 as uncertain
      from private.site_analytics_events e
      where e.session_id = b.session_id and e.event_name = 'page_view'
        and e.received_at = (select max(e2.received_at) from private.site_analytics_events e2 where e2.session_id = b.session_id and e2.event_name = 'page_view' and e2.received_at >= pg_catalog.now() - interval '90 days')
    ) last_page on true
    left join lateral (
      select min(i.created_at) as first_success_at
      from private.site_analytics_inquiry_attribution a
      join public.collaboration_requests i on i.id = a.inquiry_id
      where a.session_id = b.session_id and a.visitor_id = b.visitor_id
        and i.created_at >= p_start and i.created_at < p_end
    ) success on true
    left join lateral (
      select min(i.created_at) as first_inquiry_received_at
      from private.site_analytics_inquiry_attribution a
      join public.collaboration_requests i on i.id = a.inquiry_id
      where a.session_id = b.session_id and a.visitor_id = b.visitor_id
        and i.created_at >= pg_catalog.now() - interval '90 days'
    ) retained_success on true
  )
  select e.session_id, e.visitor_id, e.started_at, e.source, e.medium, e.campaign, e.device,
    e.entry_path, e.entry_path_uncertain, e.last_page_path, e.last_page_uncertain,
    e.page_views, e.distinct_pages, e.event_count, e.has_form_start, e.has_cta_click,
    e.has_submit_error, e.has_success, e.ever_inquiry_received, e.error_before_success, e.first_error_at,
    e.first_success_at, e.first_inquiry_received_at, e.last_event_at,
    (e.event_count > 0 or e.has_success) as in_range,
    ((e.event_count > 0 or e.has_success)
      and (p_visitor_prefix is null or pg_catalog.left(pg_catalog.replace(e.visitor_id::text, '-', ''), pg_catalog.length(p_visitor_prefix)) = p_visitor_prefix)
      and (p_source is null or e.source = p_source)
      and (p_device is null or e.device = p_device)
      and (p_page_path is null or e.has_selected_page)
      and (p_result is null
        or (p_result = 'portfolio_no_form_start' and e.saw_portfolio and not e.has_form_start)
        or (p_result = 'cta_no_form_start' and e.has_cta_click and not e.has_form_start)
        or (p_result = 'submit_error' and e.has_submit_error)
        or (p_result = 'error_then_success' and e.error_before_success))) as matches_filter
  from enriched e;
end;
$$;

create or replace function public.get_site_analytics_sessions(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_device text default null,
  p_page_path text default null,
  p_result text default null,
  p_visitor_prefix text default null,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 25,
  p_visitor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
  v_next jsonb;
begin
  if p_limit not between 1 and 50 or ((p_cursor_at is null) <> (p_cursor_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  with filtered as materialized (
    select * from private.site_analytics_session_rows(p_start, p_end, p_source, p_device, p_page_path, p_result, p_visitor_prefix, p_visitor_id)
  ),
  page as materialized (
    select * from filtered
    where (p_visitor_id is not null or matches_filter)
      and (p_cursor_at is null or (started_at, session_id) < (p_cursor_at, p_cursor_id))
    order by started_at desc, session_id desc
    limit p_limit + 1
  ),
  visible as (
    select * from page order by started_at desc, session_id desc limit p_limit
  )
  select
    (select count(*) from filtered where p_visitor_id is not null or matches_filter),
    coalesce((select jsonb_agg(jsonb_build_object(
      'sessionId', session_id, 'visitorId', visitor_id, 'startedAt', started_at,
      'source', source, 'medium', medium, 'campaign', campaign, 'device', device,
      'entryPath', entry_path, 'entryPathUncertain', entry_path_uncertain,
      'lastPagePath', last_page_path, 'lastPageUncertain', last_page_uncertain,
      'pageViews', page_views, 'distinctPages', distinct_pages, 'eventCount', event_count,
      'formStarted', has_form_start, 'ctaClicked', has_cta_click, 'submitError', has_submit_error,
      'inquiryReceived', has_success, 'everInquiryReceived', ever_inquiry_received, 'errorThenSuccess', error_before_success,
      'errorAt', first_error_at, 'inquiryAt', first_success_at, 'everInquiryAt', first_inquiry_received_at, 'lastEventAt', last_event_at,
      'matchesCurrentFilter', matches_filter
    ) order by started_at desc, session_id desc) from visible), '[]'::jsonb),
    case when (select count(*) from page) > p_limit then (
      select jsonb_build_object('startedAt', started_at, 'sessionId', session_id)
      from visible order by started_at asc, session_id asc limit 1
    ) else null end
  into v_total, v_items, v_next;

  return jsonb_build_object('items', v_items, 'total', v_total, 'nextCursor', v_next);
end;
$$;

create or replace function public.get_site_analytics_session_detail(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session jsonb;
  v_events jsonb;
  v_inquiries jsonb;
  v_total integer;
  v_first_source text;
  v_first_source_uncertain boolean;
  v_visitor_id uuid;
begin
  if p_session_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select jsonb_build_object(
    'sessionId', s.session_id, 'visitorId', s.visitor_id, 'startedAt', s.started_at,
    'lastSeenAt', s.last_seen_at, 'source', s.source, 'medium', s.medium, 'campaign', s.campaign, 'device', s.device,
    'entryPath', entry_page.path, 'entryPathUncertain', coalesce(entry_page.uncertain, false),
    'pageViews', (select count(*) from private.site_analytics_events e where e.session_id = s.session_id and e.event_name = 'page_view' and e.received_at >= pg_catalog.now() - interval '90 days'),
    'lastPagePath', last_page.path, 'lastPageUncertain', coalesce(last_page.uncertain, false)
  ), s.visitor_id
  into v_session, v_visitor_id
  from private.site_analytics_sessions s
  left join lateral (
    select case when count(distinct e.page_path) = 1 then min(e.page_path) else null end as path,
      count(distinct e.page_path) > 1 as uncertain
    from private.site_analytics_events e
    where e.session_id = s.session_id and e.event_name = 'page_view'
      and e.received_at = (select min(e2.received_at) from private.site_analytics_events e2 where e2.session_id = s.session_id and e2.event_name = 'page_view' and e2.received_at >= pg_catalog.now() - interval '90 days')
  ) entry_page on true
  left join lateral (
    select case when count(distinct e.page_path) = 1 then min(e.page_path) else null end as path,
      count(distinct e.page_path) > 1 as uncertain
    from private.site_analytics_events e
    where e.session_id = s.session_id and e.event_name = 'page_view'
      and e.received_at = (select max(e2.received_at) from private.site_analytics_events e2 where e2.session_id = s.session_id and e2.event_name = 'page_view' and e2.received_at >= pg_catalog.now() - interval '90 days')
  ) last_page on true
  where s.session_id = p_session_id and s.last_seen_at >= pg_catalog.now() - interval '90 days';

  if v_session is null then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  select count(*) into v_total
  from private.site_analytics_events e
  where e.session_id = p_session_id and e.received_at >= pg_catalog.now() - interval '90 days';

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', event_id, 'schemaVersion', schema_version, 'eventName', event_name, 'pagePath', page_path,
    'clientAt', client_at, 'receivedAt', received_at, 'pageVisitId', page_visit_id,
    'tabId', tab_id, 'documentId', document_id, 'eventSeq', event_seq, 'tabSeq', tab_seq,
    'formInstanceId', form_instance_id, 'stepId', step_id,
    'placement', placement, 'destination', destination, 'errorCode', error_code,
    'visiblePercent', visible_percent, 'visibleMs', visible_ms
  ) order by received_at asc, event_seq asc nulls last), '[]'::jsonb)
  into v_events
  from (
    select * from private.site_analytics_events e
    where e.session_id = p_session_id and e.received_at >= pg_catalog.now() - interval '90 days'
    order by e.received_at asc
    limit 500
  ) bounded;

  select coalesce(jsonb_agg(jsonb_build_object('receivedAt', i.created_at) order by i.created_at), '[]'::jsonb)
  into v_inquiries
  from private.site_analytics_inquiry_attribution a
  join public.collaboration_requests i on i.id = a.inquiry_id
  where a.session_id = p_session_id and a.visitor_id = v_visitor_id
    and i.created_at >= pg_catalog.now() - interval '90 days';

  select case when count(distinct s.source) = 1 then min(s.source) else null end,
    count(distinct s.source) > 1
  into v_first_source, v_first_source_uncertain
  from private.site_analytics_sessions s
  where s.visitor_id = v_visitor_id and s.last_seen_at >= pg_catalog.now() - interval '90 days'
    and s.started_at = (select min(first_session.started_at) from private.site_analytics_sessions first_session where first_session.visitor_id = v_visitor_id and first_session.last_seen_at >= pg_catalog.now() - interval '90 days');

  return jsonb_build_object(
    'session', v_session,
    'events', v_events,
    'eventCount', v_total,
    'eventsTruncated', v_total > 500,
    'inquiries', v_inquiries,
    'firstMeasuredSource', v_first_source,
    'firstMeasuredSourceUncertain', coalesce(v_first_source_uncertain, false)
  );
end;
$$;

create or replace function public.get_site_analytics_paths(
  p_start timestamptz,
  p_end timestamptz,
  p_page_path text default null,
  p_source text default null,
  p_device text default null,
  p_result text default null,
  p_visitor_prefix text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pages jsonb;
  v_transitions jsonb;
  v_unpaired_clicks bigint;
begin
  if p_start is null or p_end is null or p_start >= p_end
    or p_end > pg_catalog.now() + interval '1 minute'
    or p_start < pg_catalog.now() - interval '90 days'
    or p_limit not between 1 and 100
    or (p_page_path is not null and (p_page_path !~ '^/' or length(p_page_path) > 500 or p_page_path ~ '[?#]')) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  with eligible_sessions as materialized (
    select session_id from private.site_analytics_session_rows(
      p_start, p_end, p_source, p_device, p_page_path, p_result, p_visitor_prefix, null
    ) where matches_filter
  ),
  period_events as materialized (
    select e.* from private.site_analytics_events e
    join eligible_sessions s on s.session_id = e.session_id
    where e.received_at >= p_start and e.received_at < p_end
  ),
  page_totals as (
    select page_path, count(*)::bigint as page_views, count(distinct visitor_id)::bigint as visitors,
      count(distinct session_id)::bigint as sessions
    from period_events where event_name = 'page_view'
    group by page_path
  ),
  cta_pairs as (
    select page_visit_id, placement,
      case when count(distinct page_path) = 1 then min(page_path) else null end as page_path,
      bool_or(event_name = 'cta_view' and visible_percent >= 50 and visible_ms >= 1000) as visible_proof,
      bool_or(event_name = 'inquiry_cta_click') as clicked
    from period_events
    where schema_version = 2 and page_visit_id is not null and placement is not null
      and event_name in ('cta_view', 'inquiry_cta_click')
    group by page_visit_id, placement
  ),
  cta_by_path as (
    select page_path, count(*)::bigint as denominator,
      count(*) filter (where clicked)::bigint as clicks,
      count(*) filter (where visible_proof)::bigint as visible_proof,
      count(*) filter (where clicked and not visible_proof)::bigint as click_supplement,
      count(*) filter (where clicked and not visible_proof)::bigint as click_without_visible_event
    from cta_pairs where page_path is not null
    group by page_path
  ),
  legacy_clicks as (
    select page_path, count(*)::bigint as clicks
    from period_events where event_name = 'inquiry_cta_click' and schema_version = 1
    group by page_path
  ),
  paths as (
    select p.page_path, p.page_views, p.visitors, p.sessions,
      coalesce(c.denominator, 0)::bigint as cta_denominator,
      coalesce(c.clicks, 0)::bigint as cta_clicks,
      coalesce(c.visible_proof, 0)::bigint as visible_proof,
      coalesce(c.click_supplement, 0)::bigint as click_supplement,
      coalesce(c.click_without_visible_event, 0)::bigint as click_without_visible_event,
      coalesce(l.clicks, 0)::bigint as legacy_unpaired_clicks
    from page_totals p
    left join cta_by_path c on c.page_path = p.page_path
    left join legacy_clicks l on l.page_path = p.page_path
    where p_page_path is null or p.page_path = p_page_path
  ),
  raw_page_visits as (
    select e.session_id, e.tab_id, e.tab_seq, e.page_visit_id, e.page_path,
      count(*) over (partition by e.session_id, e.tab_id, e.tab_seq) as sequence_count
    from period_events e
    where e.event_name = 'page_view' and e.schema_version = 2 and e.tab_id is not null
      and e.tab_seq is not null and e.page_visit_id is not null
  ),
  transitions as (
    select a.page_path as from_path, b.page_path as to_path, count(*)::bigint as visits
    from raw_page_visits a
    join raw_page_visits b on b.session_id = a.session_id and b.tab_id = a.tab_id and b.tab_seq = a.tab_seq + 1
    where a.sequence_count = 1 and b.sequence_count = 1
      and (p_page_path is null or a.page_path = p_page_path)
    group by a.page_path, b.page_path
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'path', page_path, 'pageViews', page_views, 'visitors', visitors, 'sessions', sessions,
      'ctaDenominator', cta_denominator, 'ctaClicks', cta_clicks,
      'ctaClickRate', case when cta_denominator > 0 then round((cta_clicks::numeric / cta_denominator) * 100, 1) else null end,
      'visibleProof', visible_proof, 'clickSupplement', click_supplement,
      'clickWithoutVisibleEvent', click_without_visible_event, 'legacyUnpairedClicks', legacy_unpaired_clicks
    ) order by page_views desc, page_path), '[]'::jsonb),
    (select coalesce(jsonb_agg(jsonb_build_object('from', from_path, 'to', to_path, 'visits', visits) order by visits desc, to_path), '[]'::jsonb)
      from (select * from transitions order by visits desc, to_path limit p_limit) selected_transitions),
    (select count(*)::bigint from period_events where event_name = 'inquiry_cta_click' and schema_version = 1)
  into v_pages, v_transitions, v_unpaired_clicks
  from (select * from paths order by page_views desc, page_path limit p_limit) selected_pages;

  return jsonb_build_object(
    'pages', v_pages,
    'transitions', v_transitions,
    'legacyUnpairedClicks', v_unpaired_clicks,
    'transitionBasis', 'same_session_same_tab_consecutive_tab_seq_v2',
    'rangeStart', p_start,
    'rangeEnd', p_end
  );
end;
$$;

create or replace function public.get_site_analytics_form_funnel(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started bigint;
  v_reviewed bigint;
  v_attempted bigint;
  v_completed bigint;
  v_matched_inquiries bigint;
  v_inquiries bigint;
begin
  if p_start is null or p_end is null or p_start >= p_end
    or p_end > pg_catalog.now() + interval '1 minute'
    or p_start < pg_catalog.now() - interval '90 days' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  with starts as (
    select session_id, schema_version, form_instance_id,
      min(coalesce(client_at, received_at)) as start_at
    from private.site_analytics_events
    where event_name = 'form_start' and received_at >= p_start and received_at < p_end
    group by session_id, schema_version, form_instance_id
  ), reviews as (
    select s.session_id, s.schema_version, s.form_instance_id, s.start_at,
      min(coalesce(e.client_at, e.received_at)) as review_at
    from starts s
    join private.site_analytics_events e on e.session_id = s.session_id
      and e.schema_version = s.schema_version and e.event_name = 'form_review'
      and e.received_at >= p_start and e.received_at < p_end
      and (s.schema_version = 1 or e.form_instance_id = s.form_instance_id)
      and coalesce(e.client_at, e.received_at) >= s.start_at
    group by s.session_id, s.schema_version, s.form_instance_id, s.start_at
  ), attempts as (
    select r.session_id, r.schema_version, r.form_instance_id, r.start_at, r.review_at,
      min(coalesce(e.client_at, e.received_at)) as attempt_at
    from reviews r
    join private.site_analytics_events e on e.session_id = r.session_id
      and e.schema_version = r.schema_version and e.event_name = 'form_submit_attempt'
      and e.received_at >= p_start and e.received_at < p_end
      and (r.schema_version = 1 or e.form_instance_id = r.form_instance_id)
      and coalesce(e.client_at, e.received_at) >= r.review_at
    group by r.session_id, r.schema_version, r.form_instance_id, r.start_at, r.review_at
  ), matched as (
    select distinct i.id, i.session_id
    from public.collaboration_requests i
    join private.site_analytics_inquiry_attribution a on a.inquiry_id = i.id
    join private.site_analytics_sessions s on s.session_id = a.session_id and s.visitor_id = a.visitor_id
    join attempts x on x.session_id = a.session_id
      and ((x.schema_version = 1 and a.form_instance_id is null)
        or (x.schema_version = 2 and a.form_instance_id = x.form_instance_id))
    where i.created_at >= p_start and i.created_at < p_end
      and x.start_at <= i.created_at + interval '5 minutes'
      and x.review_at <= i.created_at + interval '5 minutes'
      and x.attempt_at <= i.created_at
      and x.attempt_at >= i.created_at - interval '30 minutes'
  )
  select
    (select count(distinct session_id) from starts),
    (select count(distinct session_id) from reviews),
    (select count(distinct session_id) from attempts),
    (select count(distinct session_id) from matched),
    (select count(distinct id) from matched),
    (select count(*) from public.collaboration_requests where created_at >= p_start and created_at < p_end)
  into v_started, v_reviewed, v_attempted, v_completed, v_matched_inquiries, v_inquiries;

  return pg_catalog.jsonb_build_object(
    'funnel', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('stage', 'form_start', 'sessions', v_started),
      pg_catalog.jsonb_build_object('stage', 'form_review', 'sessions', v_reviewed),
      pg_catalog.jsonb_build_object('stage', 'form_submit_attempt', 'sessions', v_attempted),
      pg_catalog.jsonb_build_object('stage', 'inquiry_created', 'sessions', v_completed)
    ),
    'unpairedInquiries', pg_catalog.greatest(v_inquiries - v_matched_inquiries, 0),
    'matchedInquiries', v_matched_inquiries
  );
end;
$$;

revoke all on function private.site_analytics_session_rows(timestamptz, timestamptz, text, text, text, text, text, uuid) from public, anon, authenticated, service_role;

revoke all on function public.record_site_analytics_events_v2(uuid, uuid, jsonb, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_site_analytics_events_v2(uuid, uuid, jsonb, text, text, text, text) to service_role;

revoke all on function public.record_site_analytics_inquiry_v2(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_site_analytics_inquiry_v2(uuid, uuid, uuid, uuid) to service_role;

revoke all on function public.get_site_analytics_sessions(timestamptz, timestamptz, text, text, text, text, text, timestamptz, uuid, integer, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_site_analytics_sessions(timestamptz, timestamptz, text, text, text, text, text, timestamptz, uuid, integer, uuid) to service_role;

revoke all on function public.get_site_analytics_session_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_site_analytics_session_detail(uuid) to service_role;

revoke all on function public.get_site_analytics_paths(timestamptz, timestamptz, text, text, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.get_site_analytics_paths(timestamptz, timestamptz, text, text, text, text, text, integer) to service_role;

revoke all on function public.get_site_analytics_form_funnel(timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.get_site_analytics_form_funnel(timestamptz, timestamptz) to service_role;

comment on column private.site_analytics_events.page_visit_id is 'A v2 document-page activation; a new ID is created on load, refresh, and back-forward cache restoration.';
comment on column private.site_analytics_events.tab_id is 'A per-tab pseudonymous ID used only to order same-tab page visits within a session.';
comment on column private.site_analytics_events.document_id is 'A per-document ID; event_seq is meaningful only inside this document.';
comment on column private.site_analytics_events.form_instance_id is 'A random form instance ID; never contains form values or contact data.';
comment on column private.site_analytics_inquiry_attribution.form_instance_id is 'Optional client-generated form instance ID attached only after a backend-committed inquiry receipt is verified.';
comment on function public.get_site_analytics_sessions(timestamptz, timestamptz, text, text, text, text, text, timestamptz, uuid, integer, uuid) is 'Bounded, keyset-paginated administrator session list and visitor history. Range membership uses received_at events or backend inquiry created_at.';
comment on function public.get_site_analytics_paths(timestamptz, timestamptz, text, text, text, text, text, integer) is 'Page views and deduplicated CTA exposure/click pairs; transitions require adjacent v2 tab_seq page views in one session and tab.';

notify pgrst, 'reload schema';
commit;
