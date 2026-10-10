-- Add immutable public-project snapshots to the existing inquiry workflow.
-- Existing general inquiries remain NULL and keep their current receipt identity.
begin;

alter table public.collaboration_requests
  add column if not exists shoot_project_id text,
  add column if not exists shoot_project_snapshot jsonb;

create or replace function private.valid_shoot_project_snapshot(value jsonb, project_id text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare revision_text text;
begin
  if value is null or project_id is null or project_id !~ '^[a-z0-9][a-z0-9-]{1,63}$'
    or jsonb_typeof(value) <> 'object'
    or (value - 'id' - 'revision' - 'slug' - 'title' - 'summary' - 'concept' - 'area' - 'dateNote' - 'deadlineAt' - 'costNote' - 'deliveryNote' - 'publicationNote') <> '{}'::jsonb then return false; end if;
  if jsonb_typeof(value -> 'id') is distinct from 'string' or value ->> 'id' <> project_id
    or jsonb_typeof(value -> 'revision') is distinct from 'number'
    or jsonb_typeof(value -> 'slug') is distinct from 'string'
    or (value ->> 'slug') !~ '^[a-z0-9][a-z0-9-]{1,95}$' then return false; end if;
  revision_text := value ->> 'revision';
  if revision_text !~ '^[1-9][0-9]{0,6}$' or revision_text::integer > 1000000 then return false; end if;
  foreach revision_text in array array['title','summary','concept','area','dateNote','costNote','deliveryNote','publicationNote'] loop
    if jsonb_typeof(value -> revision_text) is distinct from 'string'
      or char_length(btrim(value ->> revision_text)) < 1
      or (revision_text = 'title' and char_length(value ->> revision_text) > 120)
      or (revision_text = 'summary' and char_length(value ->> revision_text) > 400)
      or (revision_text = 'concept' and char_length(value ->> revision_text) > 2000)
      or (revision_text = 'area' and char_length(value ->> revision_text) > 160)
      or (revision_text in ('dateNote', 'costNote', 'deliveryNote', 'publicationNote') and char_length(value ->> revision_text) > 1000)
      or (value ->> revision_text) ~ '[[:cntrl:]]' then return false; end if;
  end loop;
  if not (value ? 'deadlineAt') then return false; end if;
  if value -> 'deadlineAt' <> 'null'::jsonb then
    if jsonb_typeof(value -> 'deadlineAt') is distinct from 'string'
      or char_length(value ->> 'deadlineAt') > 40
      or (value ->> 'deadlineAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
  end if;
  return octet_length(value::text) <= 12000;
end;
$$;
revoke all on function private.valid_shoot_project_snapshot(jsonb, text) from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.valid_shoot_project_snapshot(jsonb, text) to service_role;

alter table public.collaboration_requests
  drop constraint if exists collaboration_requests_shoot_project_pair_valid;
alter table public.collaboration_requests
  add constraint collaboration_requests_shoot_project_pair_valid check (
    (shoot_project_id is null and shoot_project_snapshot is null)
    or (shoot_project_id is not null and shoot_project_snapshot is not null
      and shoot_project_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'
      and private.valid_shoot_project_snapshot(shoot_project_snapshot, shoot_project_id))
  );

create or replace function private.valid_workflow_inquiry_payload(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare field_name text; revision_text text;
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or (value - 'name' - 'contact_method' - 'contact_account' - 'collaboration_type' - 'preferred_date' - 'description' - 'consent' - 'reference_links' - 'reference_images' - 'shoot_project_id' - 'shoot_project_revision' - 'shoot_project_snapshot') <> '{}'::jsonb then return false; end if;
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
  if value ? 'shoot_project_id' or value ? 'shoot_project_revision' or value ? 'shoot_project_snapshot' then
    if not (value ? 'shoot_project_id' and value ? 'shoot_project_revision' and value ? 'shoot_project_snapshot')
      or value ->> 'collaboration_type' <> '主題合作'
      or jsonb_typeof(value -> 'shoot_project_id') is distinct from 'string'
      or jsonb_typeof(value -> 'shoot_project_revision') is distinct from 'number' then return false; end if;
    revision_text := value ->> 'shoot_project_revision';
    if revision_text !~ '^[1-9][0-9]{0,6}$' or revision_text::integer > 1000000
      or not private.valid_shoot_project_snapshot(value -> 'shoot_project_snapshot', value ->> 'shoot_project_id')
      or (value #>> '{shoot_project_snapshot,revision}') <> revision_text then return false; end if;
  end if;
  return private.valid_inquiry_reference_links(coalesce(value -> 'reference_links', '[]'::jsonb))
    and private.valid_inquiry_reference_images(coalesce(value -> 'reference_images', '[]'::jsonb));
end;
$$;
revoke all on function private.valid_workflow_inquiry_payload(jsonb) from public, anon, authenticated, service_role;

create or replace function public.submit_workflow_inquiry(p_submission_id uuid, p_token_hash text, p_request_hash text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing jsonb; saved public.collaboration_requests; reference_value text;
begin
  existing := public.find_inquiry_receipt(p_submission_id, p_token_hash, p_request_hash);
  if existing is not null then return existing; end if;
  if not private.valid_workflow_inquiry_payload(p_payload) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_id::text, 0));
  existing := public.find_inquiry_receipt(p_submission_id, p_token_hash, p_request_hash);
  if existing is not null then return existing; end if;
  insert into public.collaboration_requests(name, contact_method, contact_account, collaboration_type,
    preferred_date, description, consent, reference_links, reference_images, shoot_project_id, shoot_project_snapshot)
  values (p_payload ->> 'name', p_payload ->> 'contact_method', p_payload ->> 'contact_account',
    p_payload ->> 'collaboration_type', p_payload ->> 'preferred_date', p_payload ->> 'description', true,
    coalesce(p_payload -> 'reference_links', '[]'::jsonb), coalesce(p_payload -> 'reference_images', '[]'::jsonb),
    p_payload ->> 'shoot_project_id', p_payload -> 'shoot_project_snapshot')
  returning * into saved;
  reference_value := 'PHOX-' || upper(left(replace(saved.id::text, '-', ''), 20));
  insert into private.inquiry_receipts(submission_id, inquiry_id, token_hash, request_hash, reference, created_at)
    values (p_submission_id, saved.id, p_token_hash, p_request_hash, reference_value, saved.created_at);
  return jsonb_build_object('reference', reference_value, 'createdAt', saved.created_at, 'created', true);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'conflict';
end;
$$;
revoke all on function public.submit_workflow_inquiry(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.submit_workflow_inquiry(uuid, text, text, jsonb) to service_role;

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
    'shootProject', case when i.shoot_project_id is null then null else jsonb_build_object(
      'id', i.shoot_project_id,
      'revision', (i.shoot_project_snapshot ->> 'revision')::integer,
      'title', i.shoot_project_snapshot ->> 'title',
      'summary', i.shoot_project_snapshot ->> 'summary',
      'area', i.shoot_project_snapshot ->> 'area',
      'dateNote', i.shoot_project_snapshot ->> 'dateNote',
      'costNote', i.shoot_project_snapshot ->> 'costNote',
      'deliveryNote', i.shoot_project_snapshot ->> 'deliveryNote',
      'publicationNote', i.shoot_project_snapshot ->> 'publicationNote') end,
    'confirmation', private.get_published_shoot_confirmation(i.id)) into result
  from private.inquiry_receipts r join public.collaboration_requests i on i.id = r.inquiry_id
  where r.token_hash = p_token_hash and r.revoked_at is null;
  return result;
end;
$$;
revoke all on function public.get_cooperation_progress(text) from public, anon, authenticated, service_role;
grant execute on function public.get_cooperation_progress(text) to service_role;

comment on column public.collaboration_requests.shoot_project_id is 'Stable identifier of the public shoot project selected when this inquiry was submitted; null for general inquiries.';
comment on column public.collaboration_requests.shoot_project_snapshot is 'Server-created immutable public project terms at receipt time; excludes applicant information and private admin notes.';
comment on function public.submit_workflow_inquiry(uuid, text, text, jsonb) is 'Atomic inquiry/receipt write. Project identity and revision participate in retry hashing; server-created project snapshots are validated and persisted with the inquiry.';
notify pgrst, 'reload schema';
commit;
