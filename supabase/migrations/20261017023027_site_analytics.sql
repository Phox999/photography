begin;

create table private.site_analytics_sessions (
  session_id uuid primary key,
  visitor_id uuid not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  entry_path text not null,
  source text not null check (source in ('direct', 'instagram', 'threads', 'facebook', 'google', 'other')),
  medium text check (medium is null or medium in ('social', 'story', 'post', 'bio', 'referral', 'organic', 'paid', 'email', 'other')),
  campaign text check (campaign is null or (length(campaign) between 1 and 40 and campaign ~ '^[a-z0-9][a-z0-9_-]*$')),
  device text not null check (device in ('mobile', 'tablet', 'desktop', 'unknown')),
  check (length(entry_path) between 1 and 500 and left(entry_path, 1) = '/' and position('?' in entry_path) = 0 and position('#' in entry_path) = 0)
);

create index site_analytics_sessions_last_seen_idx
  on private.site_analytics_sessions (last_seen_at desc);
create index site_analytics_sessions_visitor_idx
  on private.site_analytics_sessions (visitor_id, started_at desc);
create index site_analytics_sessions_source_idx
  on private.site_analytics_sessions (source, started_at desc);

create table private.site_analytics_events (
  event_id uuid primary key,
  schema_version smallint not null default 1 check (schema_version = 1),
  received_at timestamptz not null default now(),
  client_at timestamptz,
  visitor_id uuid not null,
  session_id uuid not null references private.site_analytics_sessions(session_id) on delete cascade,
  event_name text not null check (event_name in (
    'page_view', 'inquiry_cta_click', 'outbound_contact_click',
    'form_start', 'form_review', 'form_submit_attempt', 'form_submit_error'
  )),
  page_path text not null,
  placement text check (placement is null or placement in (
    'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
    'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board',
    'journal-footer', 'journal-body', 'plans', 'footer', 'other'
  )),
  destination text check (destination is null or destination in (
    'internal', 'google_form', 'instagram', 'threads', 'facebook', 'email', 'other'
  )),
  error_code text check (error_code is null or error_code in ('validation', 'network', 'server', 'rate_limited', 'unknown')),
  check (length(page_path) between 1 and 500 and left(page_path, 1) = '/' and position('?' in page_path) = 0 and position('#' in page_path) = 0)
);

create index site_analytics_events_received_idx
  on private.site_analytics_events (received_at desc);
create index site_analytics_events_visitor_received_idx
  on private.site_analytics_events (visitor_id, received_at desc);
create index site_analytics_events_session_received_idx
  on private.site_analytics_events (session_id, received_at desc);
create index site_analytics_events_path_received_idx
  on private.site_analytics_events (page_path, received_at desc);
create index site_analytics_events_name_received_idx
  on private.site_analytics_events (event_name, received_at desc);
create unique index site_analytics_events_form_start_once_idx
  on private.site_analytics_events (session_id) where event_name = 'form_start';
create unique index site_analytics_events_form_review_once_idx
  on private.site_analytics_events (session_id) where event_name = 'form_review';

create table private.site_analytics_inquiry_attribution (
  inquiry_id uuid primary key references public.collaboration_requests(id) on delete cascade,
  visitor_id uuid not null,
  session_id uuid not null references private.site_analytics_sessions(session_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index site_analytics_inquiry_attribution_session_idx
  on private.site_analytics_inquiry_attribution (session_id, created_at desc);
create index site_analytics_inquiry_attribution_visitor_idx
  on private.site_analytics_inquiry_attribution (visitor_id, created_at desc);

alter table private.site_analytics_sessions enable row level security;
alter table private.site_analytics_events enable row level security;
alter table private.site_analytics_inquiry_attribution enable row level security;

revoke all on table private.site_analytics_sessions, private.site_analytics_events, private.site_analytics_inquiry_attribution from public, anon, authenticated;
grant select, insert, update, delete on table private.site_analytics_sessions, private.site_analytics_events, private.site_analytics_inquiry_attribution to service_role;

create or replace function public.record_site_analytics_events(
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
      or coalesce(value ->> 'event_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(value ->> 'event_name', '') not in (
        'page_view', 'inquiry_cta_click', 'outbound_contact_click',
        'form_start', 'form_review', 'form_submit_attempt', 'form_submit_error'
      )
      or coalesce(value ->> 'page_path', '') !~ '^/'
      or length(value ->> 'page_path') > 500
      or position('?' in coalesce(value ->> 'page_path', '')) > 0
      or position('#' in coalesce(value ->> 'page_path', '')) > 0
      or (value ->> 'event_name' = 'inquiry_cta_click' and (
        coalesce(value ->> 'placement', '') not in (
          'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
          'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board',
          'journal-footer', 'journal-body', 'plans', 'footer', 'other'
        )
        or coalesce(value ->> 'destination', '') not in ('internal', 'google_form', 'instagram', 'threads', 'facebook', 'email', 'other')
      ))
      or (value ->> 'event_name' = 'outbound_contact_click' and
        coalesce(value ->> 'destination', '') not in ('google_form', 'instagram', 'threads', 'facebook', 'email', 'other'))
      or (value ->> 'event_name' = 'form_submit_error' and
        coalesce(value ->> 'error_code', '') not in ('validation', 'network', 'server', 'rate_limited', 'unknown'))
  ) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  if (select count(*) from private.site_analytics_events
      where session_id = p_session_id and received_at >= now() - interval '1 minute') + v_event_count > 120 then
    return jsonb_build_object('accepted', 0, 'rate_limited', true);
  end if;

  select value ->> 'page_path' into v_entry_path
  from jsonb_array_elements(p_events) as item(value)
  where value ->> 'event_name' = 'page_view'
  order by (value ->> 'client_at') nulls last
  limit 1;

  insert into private.site_analytics_sessions (
    session_id, visitor_id, started_at, last_seen_at, entry_path, source, medium, campaign, device
  )
  values (
    p_session_id, p_visitor_id, now(), now(), coalesce(v_entry_path, '/'), p_source, p_medium, p_campaign, p_device
  )
  on conflict (session_id) do update
    set last_seen_at = greatest(private.site_analytics_sessions.last_seen_at, excluded.last_seen_at)
    where private.site_analytics_sessions.visitor_id = excluded.visitor_id;

  if not found then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  insert into private.site_analytics_events (
    event_id, schema_version, received_at, client_at, visitor_id, session_id,
    event_name, page_path, placement, destination, error_code
  )
  select
    (value ->> 'event_id')::uuid,
    1,
    now(),
    case when coalesce(value ->> 'client_at', '') = '' then null else (value ->> 'client_at')::timestamptz end,
    p_visitor_id,
    p_session_id,
    value ->> 'event_name',
    value ->> 'page_path',
    nullif(value ->> 'placement', ''),
    nullif(value ->> 'destination', ''),
    nullif(value ->> 'error_code', '')
  from jsonb_array_elements(p_events) as item(value)
  on conflict do nothing;

  get diagnostics v_written = row_count;
  return jsonb_build_object('accepted', v_written, 'rate_limited', false);
end;
$$;

create or replace function public.record_site_analytics_inquiry(
  p_submission_id uuid,
  p_visitor_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_written integer;
begin
  if p_submission_id is null or p_visitor_id is null or p_session_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select inquiry_id into v_inquiry_id
  from private.inquiry_receipts
  where submission_id = p_submission_id;

  if v_inquiry_id is null then return false; end if;

  insert into private.site_analytics_inquiry_attribution (inquiry_id, visitor_id, session_id)
  select v_inquiry_id, p_visitor_id, p_session_id
  where exists (
    select 1 from private.site_analytics_sessions s
    where s.session_id = p_session_id and s.visitor_id = p_visitor_id
  )
  on conflict (inquiry_id) do nothing;

  get diagnostics v_written = row_count;
  return v_written = 1;
end;
$$;

create or replace function public.get_site_analytics_report(
  p_start timestamptz,
  p_end timestamptz,
  p_hourly boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitors bigint := 0;
  v_sessions bigint := 0;
  v_page_views bigint := 0;
  v_inquiries bigint := 0;
  v_converted_visitors bigint := 0;
  v_unattributed_inquiries bigint := 0;
  v_form_started bigint := 0;
  v_form_reviewed bigint := 0;
  v_form_attempted bigint := 0;
  v_form_completed bigint := 0;
  v_matched_inquiries bigint := 0;
  v_trend jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_clicks jsonb := '[]'::jsonb;
  v_pages jsonb := '[]'::jsonb;
  v_last_event_at timestamptz;
  v_interval interval;
  v_bucket text;
begin
  if p_start is null or p_end is null or p_start >= p_end
    or p_end > now() + interval '1 minute'
    or p_start < now() - interval '90 days' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select count(distinct visitor_id), count(distinct session_id), count(*)
  into v_visitors, v_sessions, v_page_views
  from private.site_analytics_events
  where event_name = 'page_view' and received_at >= p_start and received_at < p_end;

  select count(*) into v_inquiries
  from public.collaboration_requests
  where created_at >= p_start and created_at < p_end;

  select count(distinct a.visitor_id) into v_converted_visitors
  from private.site_analytics_inquiry_attribution a
  join public.collaboration_requests i on i.id = a.inquiry_id
  where i.created_at >= p_start and i.created_at < p_end
    and exists (
      select 1 from private.site_analytics_events e
      where e.event_name = 'page_view' and e.visitor_id = a.visitor_id
        and e.received_at >= p_start and e.received_at < p_end
    );

  select count(*) into v_unattributed_inquiries
  from public.collaboration_requests i
  where i.created_at >= p_start and i.created_at < p_end
    and not exists (
      select 1
      from private.site_analytics_inquiry_attribution a
      where a.inquiry_id = i.id
        and exists (
          select 1 from private.site_analytics_events e
          where e.event_name = 'page_view' and e.visitor_id = a.visitor_id
            and e.received_at >= p_start and e.received_at < p_end
        )
    );

  with starts as (
    select session_id, min(coalesce(client_at, received_at)) as occurred_at
    from private.site_analytics_events
    where event_name = 'form_start' and received_at >= p_start and received_at < p_end
    group by session_id
  ),
  reviews as (
    select s.session_id, min(coalesce(e.client_at, e.received_at)) as occurred_at
    from starts s
    join private.site_analytics_events e on e.session_id = s.session_id and e.event_name = 'form_review'
      and e.received_at >= p_start and e.received_at < p_end
      and coalesce(e.client_at, e.received_at) >= s.occurred_at
    group by s.session_id
  ),
  attempts as (
    select r.session_id
    from reviews r
    join private.site_analytics_events e on e.session_id = r.session_id and e.event_name = 'form_submit_attempt'
      and e.received_at >= p_start and e.received_at < p_end
      and coalesce(e.client_at, e.received_at) >= r.occurred_at
    group by r.session_id
  )
  select (select count(*) from starts), (select count(*) from reviews), (select count(*) from attempts)
  into v_form_started, v_form_reviewed, v_form_attempted;

  with attributed_inquiries as (
    select i.id, i.created_at, a.session_id
    from public.collaboration_requests i
    join private.site_analytics_inquiry_attribution a on a.inquiry_id = i.id
    where i.created_at >= p_start and i.created_at < p_end
  ),
  matched as (
    select distinct i.id, i.session_id
    from attributed_inquiries i
    where exists (
      select 1 from private.site_analytics_events fs
      where fs.session_id = i.session_id and fs.event_name = 'form_start'
        and fs.received_at >= p_start and fs.received_at < p_end
        and coalesce(fs.client_at, fs.received_at) <= i.created_at + interval '5 minutes'
        and exists (
          select 1 from private.site_analytics_events fr
          where fr.session_id = fs.session_id and fr.event_name = 'form_review'
            and fr.received_at >= p_start and fr.received_at < p_end
            and coalesce(fr.client_at, fr.received_at) >= coalesce(fs.client_at, fs.received_at)
            and coalesce(fr.client_at, fr.received_at) <= i.created_at + interval '5 minutes'
            and exists (
              select 1 from private.site_analytics_events sa
              where sa.session_id = fr.session_id and sa.event_name = 'form_submit_attempt'
                and sa.received_at >= p_start and sa.received_at < p_end
                and coalesce(sa.client_at, sa.received_at) >= coalesce(fr.client_at, fr.received_at)
                and coalesce(sa.client_at, sa.received_at) <= i.created_at
                and coalesce(sa.client_at, sa.received_at) >= i.created_at - interval '30 minutes'
            )
        )
    )
  )
  select count(distinct session_id), count(distinct id)
  into v_form_completed, v_matched_inquiries
  from matched;

  v_interval := case when p_hourly then interval '1 hour' else interval '1 day' end;
  v_bucket := case when p_hourly then 'hour' else 'day' end;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bucket', case when p_hourly then to_char(b.bucket_local, 'YYYY-MM-DD HH24:00') else to_char(b.bucket_local, 'YYYY-MM-DD') end,
      'visitors', (
        select count(distinct e.visitor_id) from private.site_analytics_events e
        where e.event_name = 'page_view'
          and e.received_at >= greatest(b.bucket_local at time zone 'Asia/Taipei', p_start)
          and e.received_at < least((b.bucket_local + v_interval) at time zone 'Asia/Taipei', p_end)
      ),
      'sessions', (
        select count(distinct e.session_id) from private.site_analytics_events e
        where e.event_name = 'page_view'
          and e.received_at >= greatest(b.bucket_local at time zone 'Asia/Taipei', p_start)
          and e.received_at < least((b.bucket_local + v_interval) at time zone 'Asia/Taipei', p_end)
      ),
      'pageViews', (
        select count(*) from private.site_analytics_events e
        where e.event_name = 'page_view'
          and e.received_at >= greatest(b.bucket_local at time zone 'Asia/Taipei', p_start)
          and e.received_at < least((b.bucket_local + v_interval) at time zone 'Asia/Taipei', p_end)
      ),
      'inquiries', (
        select count(*) from public.collaboration_requests i
        where i.created_at >= greatest(b.bucket_local at time zone 'Asia/Taipei', p_start)
          and i.created_at < least((b.bucket_local + v_interval) at time zone 'Asia/Taipei', p_end)
      )
    ) order by b.bucket_local
  ), '[]'::jsonb) into v_trend
  from generate_series(
    date_trunc(v_bucket, p_start at time zone 'Asia/Taipei'),
    date_trunc(v_bucket, (p_end - interval '1 microsecond') at time zone 'Asia/Taipei'),
    v_interval
  ) as b(bucket_local);

  select coalesce(jsonb_agg(
    jsonb_build_object('source', source, 'medium', medium, 'campaign', campaign, 'sessions', sessions, 'inquiries', inquiries)
    order by sessions desc, source, medium, campaign
  ), '[]'::jsonb) into v_sources
  from (
    select s.source, s.medium, s.campaign,
      count(distinct s.session_id) as sessions,
      count(distinct i.id) as inquiries
    from private.site_analytics_sessions s
    left join private.site_analytics_inquiry_attribution a on a.session_id = s.session_id
    left join public.collaboration_requests i on i.id = a.inquiry_id and i.created_at >= p_start and i.created_at < p_end
    where exists (
      select 1 from private.site_analytics_events e
      where e.session_id = s.session_id and e.event_name = 'page_view'
        and e.received_at >= p_start and e.received_at < p_end
    )
    group by s.source, s.medium, s.campaign
  ) source_rows;

  select coalesce(jsonb_agg(
    jsonb_build_object('event', event_name, 'placement', placement, 'destination', destination, 'events', events)
    order by events desc, event_name, placement, destination
  ), '[]'::jsonb) into v_clicks
  from (
    select event_name, placement, destination, count(*) as events
    from private.site_analytics_events
    where event_name in ('inquiry_cta_click', 'outbound_contact_click')
      and received_at >= p_start and received_at < p_end
    group by event_name, placement, destination
    order by events desc, event_name, placement, destination
    limit 12
  ) click_rows;

  select coalesce(jsonb_agg(
    jsonb_build_object('path', page_path, 'pageViews', page_views, 'visitors', visitors)
    order by page_views desc, page_path
  ), '[]'::jsonb) into v_pages
  from (
    select page_path, count(*) as page_views, count(distinct visitor_id) as visitors
    from private.site_analytics_events
    where event_name = 'page_view' and received_at >= p_start and received_at < p_end
    group by page_path
    order by page_views desc, page_path
    limit 10
  ) page_rows;

  select max(received_at) into v_last_event_at from private.site_analytics_events;

  return jsonb_build_object(
    'totals', jsonb_build_object(
      'visitors', v_visitors,
      'sessions', v_sessions,
      'pageViews', v_page_views,
      'inquiries', v_inquiries,
      'convertedVisitors', v_converted_visitors,
      'conversionRate', case when v_visitors = 0 then null else round(100.0 * v_converted_visitors / v_visitors, 2) end,
      'unattributedInquiries', v_unattributed_inquiries
    ),
    'trend', v_trend,
    'sources', v_sources,
    'clicks', v_clicks,
    'pages', v_pages,
    'funnel', jsonb_build_array(
      jsonb_build_object('stage', 'form_start', 'sessions', v_form_started),
      jsonb_build_object('stage', 'form_review', 'sessions', v_form_reviewed),
      jsonb_build_object('stage', 'form_submit_attempt', 'sessions', v_form_attempted),
      jsonb_build_object('stage', 'inquiry_created', 'sessions', v_form_completed)
    ),
    'unpairedInquiries', greatest(v_inquiries - v_matched_inquiries, 0),
    'lastEventAt', v_last_event_at
  );
end;
$$;

create or replace function public.purge_site_analytics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_current_deleted integer;
begin
  delete from private.site_analytics_events
  where received_at < now() - interval '90 days';
  get diagnostics v_current_deleted = row_count;
  v_deleted := v_deleted + v_current_deleted;

  delete from private.site_analytics_inquiry_attribution
  where created_at < now() - interval '90 days';
  get diagnostics v_current_deleted = row_count;
  v_deleted := v_deleted + v_current_deleted;

  delete from private.site_analytics_sessions
  where last_seen_at < now() - interval '90 days';
  get diagnostics v_current_deleted = row_count;
  v_deleted := v_deleted + v_current_deleted;
  return v_deleted;
end;
$$;

revoke all on function public.record_site_analytics_events(uuid, uuid, jsonb, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_site_analytics_events(uuid, uuid, jsonb, text, text, text, text) to service_role;

revoke all on function public.record_site_analytics_inquiry(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_site_analytics_inquiry(uuid, uuid, uuid) to service_role;

revoke all on function public.get_site_analytics_report(timestamptz, timestamptz, boolean) from public, anon, authenticated, service_role;
grant execute on function public.get_site_analytics_report(timestamptz, timestamptz, boolean) to service_role;

revoke all on function public.purge_site_analytics() from public, anon, authenticated, service_role;
grant execute on function public.purge_site_analytics() to service_role;

comment on table private.site_analytics_events is 'Allowlisted public-page events and random pseudonymous IDs only; no form contents, full URLs, IP addresses, or raw user agents.';
comment on table private.site_analytics_sessions is 'Short-lived pseudonymous sessions used for first-party traffic aggregation.';
comment on table private.site_analytics_inquiry_attribution is 'Optional server-verified anonymous attribution keyed to committed inquiry IDs; retained with analytics session data.';
notify pgrst, 'reload schema';
commit;
