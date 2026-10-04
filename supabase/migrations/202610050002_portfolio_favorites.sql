-- Run after existing inquiry workflow migrations. Compatible with old clients;
-- does not replace get_cooperation_progress or PR #5's reference-code RPC.
begin;
alter table public.collaboration_requests
  add column if not exists portfolio_favorites jsonb not null default '[]'::jsonb;

create or replace function private.valid_portfolio_favorites(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; seen text[] := array[]::text[]; item_key text;
begin
  if value is null or jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 12 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object'
      or (item - 'slug' - 'title' - 'image' - 'number') <> '{}'::jsonb
      or jsonb_typeof(item -> 'slug') is distinct from 'string'
      or jsonb_typeof(item -> 'title') is distinct from 'string'
      or jsonb_typeof(item -> 'image') is distinct from 'string'
      or jsonb_typeof(item -> 'number') is distinct from 'number' then return false; end if;
    if char_length(btrim(item ->> 'slug')) < 1 or char_length(item ->> 'slug') > 120
      or (item ->> 'slug') in ('.', '..') or (item ->> 'slug') ~ '[\\/?#[:cntrl:]]'
      or char_length(btrim(item ->> 'title')) < 1 or char_length(item ->> 'title') > 120
      or (item ->> 'title') ~ '[[:cntrl:]]'
      or char_length(item ->> 'image') > 512 or (item ->> 'image') ~ '[[:cntrl:]]'
      or (item ->> 'number') !~ '^[0-9]+$' then return false; end if;
    if (item ->> 'number')::numeric < 1 or (item ->> 'number')::numeric > 500 then return false; end if;
    if (item ->> 'image') !~ '^/assets/portfolio/[^/]+/[^/]+\.(jpg|jpeg|png|webp)$'
      and (item ->> 'image') !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/site-portfolio/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$' then return false; end if;
    if (item ->> 'image') ~ '[\\?#]' or (item ->> 'image') ~ '/\.\.?/' then return false; end if;
    item_key := jsonb_build_array(item ->> 'slug', item ->> 'image')::text;
    if item_key = any(seen) then return false; end if;
    seen := array_append(seen, item_key);
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_portfolio_favorites(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.valid_portfolio_favorites(jsonb) to service_role;
alter table public.collaboration_requests drop constraint if exists collaboration_requests_portfolio_favorites_valid;
alter table public.collaboration_requests add constraint collaboration_requests_portfolio_favorites_valid
  check (private.valid_portfolio_favorites(portfolio_favorites));

create or replace function private.valid_workflow_inquiry_payload(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare field_name text;
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or (value - 'name' - 'contact_method' - 'contact_account' - 'collaboration_type' - 'preferred_date' - 'description' - 'consent' - 'reference_links' - 'reference_images' - 'portfolio_favorites') <> '{}'::jsonb then return false; end if;
  foreach field_name in array array['name','contact_method','contact_account','collaboration_type','description'] loop
    if jsonb_typeof(value -> field_name) is distinct from 'string'
      or char_length(btrim(value ->> field_name)) < 1 then return false; end if;
  end loop;
  if char_length(value ->> 'name') > 80 or char_length(value ->> 'contact_method') > 50
    or char_length(value ->> 'contact_account') > 120 or char_length(value ->> 'collaboration_type') > 50
    or char_length(value ->> 'description') > 2000
    or (value ->> 'contact_method') not in ('Instagram','Line','Facebook','Threads','手機','其他')
    or (value ->> 'collaboration_type') not in ('輕量體驗(2hr)','標準方案(3hr)','主題合作')
    or (value -> 'consent') is distinct from 'true'::jsonb then return false; end if;
  if value ? 'preferred_date' and value -> 'preferred_date' <> 'null'::jsonb then
    if jsonb_typeof(value -> 'preferred_date') <> 'string' or char_length(value ->> 'preferred_date') > 200 then return false; end if;
  end if;
  return private.valid_inquiry_reference_links(coalesce(value -> 'reference_links', '[]'::jsonb))
    and private.valid_inquiry_reference_images(coalesce(value -> 'reference_images', '[]'::jsonb))
    and private.valid_portfolio_favorites(coalesce(value -> 'portfolio_favorites', '[]'::jsonb));
end;
$$;
revoke all on function private.valid_workflow_inquiry_payload(jsonb) from public, anon, authenticated, service_role;

create or replace function public.submit_workflow_inquiry(p_submission_id uuid, p_token_hash text, p_request_hash text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing jsonb; saved public.collaboration_requests; reference_value text;
begin
  -- The service-only lookup validates the credential shapes as well.
  existing := public.find_inquiry_receipt(p_submission_id, p_token_hash, p_request_hash);
  if existing is not null then return existing; end if;
  if not private.valid_workflow_inquiry_payload(p_payload) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  -- Same-submission concurrent requests serialize before INSERT. A second check
  -- under this transaction lock sees a committed winner and returns its receipt.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_id::text, 0));
  existing := public.find_inquiry_receipt(p_submission_id, p_token_hash, p_request_hash);
  if existing is not null then return existing; end if;
  insert into public.collaboration_requests(name, contact_method, contact_account, collaboration_type,
    preferred_date, description, consent, reference_links, reference_images, portfolio_favorites)
  values (p_payload ->> 'name', p_payload ->> 'contact_method', p_payload ->> 'contact_account',
    p_payload ->> 'collaboration_type', p_payload ->> 'preferred_date', p_payload ->> 'description', true,
    coalesce(p_payload -> 'reference_links', '[]'::jsonb), coalesce(p_payload -> 'reference_images', '[]'::jsonb), coalesce(p_payload -> 'portfolio_favorites', '[]'::jsonb))
  returning * into saved;
  reference_value := 'PHOX-' || upper(left(replace(saved.id::text, '-', ''), 20));
  insert into private.inquiry_receipts(submission_id, inquiry_id, token_hash, request_hash, reference, created_at)
    values (p_submission_id, saved.id, p_token_hash, p_request_hash, reference_value, saved.created_at);
  return jsonb_build_object('reference', reference_value, 'createdAt', saved.created_at, 'created', true);
exception when unique_violation then
  -- E.g. the same bearer token raced under two different submission UUIDs.
  -- This exception block rolls back the inquiry INSERT too: no duplicate rows.
  raise exception using errcode = 'P0001', message = 'conflict';
end;
$$;
revoke all on function public.submit_workflow_inquiry(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_workflow_inquiry(uuid, text, text, jsonb) to service_role;

comment on column public.collaboration_requests.portfolio_favorites is 'Up to 12 published portfolio photo references, with title and photo number snapshots. Server verifies against the published portfolio before writing.';
notify pgrst, 'reload schema';
commit;
