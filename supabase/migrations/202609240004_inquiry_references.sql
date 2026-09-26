-- Run after 202609240001_admin.sql as the project postgres owner.
-- Idempotent: old inquiries receive empty reference arrays, with no data deletion.
begin;

alter table public.collaboration_requests
  add column if not exists reference_links jsonb not null default '[]'::jsonb,
  add column if not exists reference_images jsonb not null default '[]'::jsonb;

create or replace function private.valid_inquiry_reference_links(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; link text;
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 3 then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'string' then return false; end if;
    link := item #>> '{}';
    if char_length(link) > 2048 or link !~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'
      or link ~ '[[:cntrl:]]' then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.valid_inquiry_reference_images(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; object_path text; extension text;
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 3 then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if (item - 'name' - 'type' - 'size' - 'path') <> '{}'::jsonb
      or jsonb_typeof(item -> 'name') is distinct from 'string'
      or jsonb_typeof(item -> 'type') is distinct from 'string'
      or jsonb_typeof(item -> 'size') is distinct from 'number'
      or jsonb_typeof(item -> 'path') is distinct from 'string' then return false; end if;
    if char_length(item ->> 'name') not between 1 and 120
      or (item ->> 'name') ~ '[[:cntrl:]<>:"|?*/\\]'
      or (item ->> 'type') not in ('image/jpeg', 'image/png', 'image/webp')
      or (item ->> 'size') !~ '^[1-9][0-9]{0,6}$' then return false; end if;
    if (item ->> 'size')::integer > 4194304 then return false; end if;
    object_path := item ->> 'path';
    extension := case item ->> 'type' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
    if object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
      or right(object_path, char_length(extension) + 1) <> '.' || extension then return false; end if;
  end loop;
  if (select count(distinct image ->> 'path') from jsonb_array_elements(value) as image) <> jsonb_array_length(value) then return false; end if;
  return true;
end;
$$;

revoke all on function private.valid_inquiry_reference_links(jsonb), private.valid_inquiry_reference_images(jsonb) from public, anon, authenticated, service_role;
-- Required only for constraints on server-side inserts; no RPCs or table reads.
grant usage on schema private to service_role;
grant execute on function private.valid_inquiry_reference_links(jsonb), private.valid_inquiry_reference_images(jsonb) to service_role;

alter table public.collaboration_requests
  drop constraint if exists collaboration_requests_reference_links_valid,
  drop constraint if exists collaboration_requests_reference_images_valid;
alter table public.collaboration_requests
  add constraint collaboration_requests_reference_links_valid check (private.valid_inquiry_reference_links(reference_links)),
  add constraint collaboration_requests_reference_images_valid check (private.valid_inquiry_reference_images(reference_images));

-- Existing admin SELECT RLS and service-role INSERT grants remain unchanged.
-- In particular, this migration grants no anon table or object access.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('inquiry-references', 'inquiry-references', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive RLS blocks even an older broad permissive storage policy.
-- Service operations bypass RLS; browsers never receive the service key.
drop policy if exists inquiry_references_server_only on storage.objects;
create policy inquiry_references_server_only on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'inquiry-references') with check (bucket_id <> 'inquiry-references');

comment on column public.collaboration_requests.reference_links is 'At most three HTTP(S) URLs; server stores text only and never fetches remote references.';
comment on column public.collaboration_requests.reference_images is 'Private inquiry-references metadata: name, type, size, path. Admin-only endpoint issues five-minute signed URLs.';
commit;
