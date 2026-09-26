-- Run after 004. Private bearer credentials never enter public inquiry rows.
begin;

create table if not exists private.inquiry_receipts (
  submission_id uuid primary key,
  inquiry_id uuid not null unique references public.collaboration_requests(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  reference text not null unique check (reference ~ '^PHOX-[A-F0-9]{20}$'),
  created_at timestamptz not null,
  revoked_at timestamptz
);
alter table private.inquiry_receipts enable row level security;
revoke all on private.inquiry_receipts from public, anon, authenticated, service_role;

create or replace function private.valid_workflow_inquiry_payload(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare field_name text;
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or (value - 'name' - 'contact_method' - 'contact_account' - 'collaboration_type' - 'preferred_date' - 'description' - 'consent' - 'reference_links' - 'reference_images') <> '{}'::jsonb then return false; end if;
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
    and private.valid_inquiry_reference_images(coalesce(value -> 'reference_images', '[]'::jsonb));
end;
$$;
revoke all on function private.valid_workflow_inquiry_payload(jsonb) from public, anon, authenticated, service_role;

create or replace function public.find_inquiry_receipt(p_submission_id uuid, p_token_hash text, p_request_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare receipt private.inquiry_receipts;
begin
  if p_submission_id is null or p_submission_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into receipt from private.inquiry_receipts where submission_id = p_submission_id;
  if found then
    if receipt.token_hash <> p_token_hash or receipt.request_hash <> p_request_hash then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
    return jsonb_build_object('reference', receipt.reference, 'createdAt', receipt.created_at, 'created', false);
  end if;
  if exists (select 1 from private.inquiry_receipts where token_hash = p_token_hash) then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  return null;
end;
$$;
revoke all on function public.find_inquiry_receipt(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.find_inquiry_receipt(uuid, text, text) to service_role;

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
    preferred_date, description, consent, reference_links, reference_images)
  values (p_payload ->> 'name', p_payload ->> 'contact_method', p_payload ->> 'contact_account',
    p_payload ->> 'collaboration_type', p_payload ->> 'preferred_date', p_payload ->> 'description', true,
    coalesce(p_payload -> 'reference_links', '[]'::jsonb), coalesce(p_payload -> 'reference_images', '[]'::jsonb))
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

-- 008 replaces this helper with a confirmed-only projection. Reapplying 005
-- must not replace the implemented helper with its bootstrap null response.
do $bootstrap$
begin
  if to_regprocedure('private.get_published_shoot_confirmation(uuid)') is null then
    execute $definition$
      create function private.get_published_shoot_confirmation(p_inquiry_id uuid)
      returns jsonb language sql stable security invoker set search_path = ''
      as $body$ select null::jsonb $body$
    $definition$;
  end if;
end;
$bootstrap$;
revoke all on function private.get_published_shoot_confirmation(uuid) from public, anon, authenticated, service_role;

create or replace function public.get_cooperation_progress(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select jsonb_build_object('reference', r.reference, 'createdAt', r.created_at, 'status', i.status,
    'summary', jsonb_build_object('name', i.name, 'collaborationType', i.collaboration_type,
      'preferredDate', i.preferred_date, 'description', i.description, 'referenceLinks', i.reference_links),
    'confirmation', private.get_published_shoot_confirmation(i.id)) into result
  from private.inquiry_receipts r join public.collaboration_requests i on i.id = r.inquiry_id
  where r.token_hash = p_token_hash and r.revoked_at is null;
  return result;
end;
$$;
revoke all on function public.get_cooperation_progress(text) from public, anon, authenticated, service_role;
grant execute on function public.get_cooperation_progress(text) to service_role;

comment on table private.inquiry_receipts is 'Server-only SHA-256 bearer hashes and idempotency records; no raw tokens, public grants, or browser access. Owner may set revoked_at to revoke a receipt.';
comment on function public.submit_workflow_inquiry(uuid, text, text, jsonb) is 'Atomic inquiry/receipt write. Identical normalized payload and file-content hashes replay; changed payload or token reuse conflicts.';
notify pgrst, 'reload schema';
commit;
