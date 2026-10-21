create or replace function public.get_site_analytics_observation_counts(
  p_start timestamptz,
  p_end timestamptz,
  p_source text default null,
  p_device text default null,
  p_page_path text default null,
  p_visitor_prefix text default null,
  p_transition_from text default null,
  p_transition_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_portfolio_no_form_start bigint;
  v_cta_no_form_start bigint;
  v_submit_error bigint;
  v_error_then_success bigint;
begin
  if ((p_transition_from is null) <> (p_transition_to is null))
    or (p_transition_from is not null and (p_transition_from !~ '^/' or pg_catalog.length(p_transition_from) > 500 or p_transition_from ~ '[?#]'))
    or (p_transition_to is not null and (p_transition_to !~ '^/' or pg_catalog.length(p_transition_to) > 500 or p_transition_to ~ '[?#]')) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  with eligible as materialized (
    select r.*
    from private.site_analytics_session_rows(p_start, p_end, p_source, p_device, p_page_path, null, p_visitor_prefix, null) r
    where r.matches_filter
  ), page_visits as materialized (
    select e.session_id, e.tab_id, e.tab_seq, e.page_path,
      count(*) over (partition by e.session_id, e.tab_id, e.tab_seq) as sequence_count
    from private.site_analytics_events e
    join eligible r on r.session_id = e.session_id
    where p_transition_from is not null
      and e.received_at >= p_start and e.received_at < p_end
      and e.event_name = 'page_view' and e.schema_version = 2
      and e.tab_id is not null and e.tab_seq is not null and e.page_visit_id is not null
  ), transition_matches as materialized (
    select distinct a.session_id
    from page_visits a
    join page_visits b on b.session_id = a.session_id and b.tab_id = a.tab_id and b.tab_seq = a.tab_seq + 1
    where a.sequence_count = 1 and b.sequence_count = 1
      and a.page_path = p_transition_from and b.page_path = p_transition_to
  ), filtered as materialized (
    select r.*
    from eligible r
    where p_transition_from is null or exists (
      select 1 from transition_matches t where t.session_id = r.session_id
    )
  ), portfolio_sessions as materialized (
    select distinct e.session_id
    from private.site_analytics_events e
    join filtered r on r.session_id = e.session_id
    where e.received_at >= p_start and e.received_at < p_end
      and e.event_name = 'page_view' and (e.page_path = '/portfolio/' or e.page_path like '/portfolio/%')
  )
  select count(*)::bigint,
    count(*) filter (where p.session_id is not null and not r.has_form_start)::bigint,
    count(*) filter (where r.has_cta_click and not r.has_form_start)::bigint,
    count(*) filter (where r.has_submit_error)::bigint,
    count(*) filter (where r.error_before_success)::bigint
  into v_total, v_portfolio_no_form_start, v_cta_no_form_start, v_submit_error, v_error_then_success
  from filtered r
  left join portfolio_sessions p on p.session_id = r.session_id;

  return pg_catalog.jsonb_build_object(
    'total', coalesce(v_total, 0),
    'counts', pg_catalog.jsonb_build_object(
      'portfolio_no_form_start', coalesce(v_portfolio_no_form_start, 0),
      'cta_no_form_start', coalesce(v_cta_no_form_start, 0),
      'submit_error', coalesce(v_submit_error, 0),
      'error_then_success', coalesce(v_error_then_success, 0)
    )
  );
end;
$$;

revoke all on function public.get_site_analytics_observation_counts(timestamptz, timestamptz, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.get_site_analytics_observation_counts(timestamptz, timestamptz, text, text, text, text, text, text) to service_role;

comment on function public.get_site_analytics_observation_counts(timestamptz, timestamptz, text, text, text, text, text, text) is 'One bounded aggregation for total and overlapping journey observations under identical filters.';
