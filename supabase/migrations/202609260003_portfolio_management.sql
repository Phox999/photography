-- Store the public portfolio catalogue separately from client proofing galleries.
create table if not exists public.portfolio_content (
  id smallint primary key default 1 check (id = 1),
  collections jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create or replace function private.valid_portfolio_collections(collections jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  collection jsonb;
  image_path text;
  collection_slug text;
  seen_slugs text[] := array[]::text[];
  image_count integer;
  distinct_image_count integer;
begin
  if collections is null or jsonb_typeof(collections) is distinct from 'array' then return false; end if;
  if jsonb_array_length(collections) > 80 then return false; end if;
  for collection in select value from jsonb_array_elements(collections) as entries(value) loop
    if jsonb_typeof(collection) is distinct from 'object' then return false; end if;
    if jsonb_typeof(collection->'slug') is distinct from 'string'
      or jsonb_typeof(collection->'title') is distinct from 'string'
      or jsonb_typeof(collection->'category') is distinct from 'string'
      or jsonb_typeof(collection->'description') is distinct from 'string'
      or jsonb_typeof(collection->'cover') is distinct from 'string'
      or jsonb_typeof(collection->'images') is distinct from 'array'
      or jsonb_typeof(collection->'totalImages') is distinct from 'number' then return false; end if;
    collection_slug := collection->>'slug';
    if char_length(collection_slug) not between 1 and 120
      or position('/' in collection_slug) > 0 or position(chr(92) in collection_slug) > 0
      or position('?' in collection_slug) > 0 or position('#' in collection_slug) > 0
      or collection_slug = any(seen_slugs)
      or char_length(collection->>'title') not between 1 and 120 or collection->>'title' ~ '[<>]'
      or collection->>'category' not in ('外拍', '棚拍')
      or char_length(collection->>'description') > 1000 or collection->>'description' ~ '[<>]'
      or jsonb_array_length(collection->'images') not between 1 and 200
      or (collection->>'totalImages') !~ '^([1-9][0-9]{0,3}|10000)$' then return false; end if;
    seen_slugs := array_append(seen_slugs, collection_slug);
    image_path := collection->>'cover';
    if image_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
      and image_path !~ '^static:/assets/portfolio/[^/]+/[^/]+\.(jpg|png|webp)$' then return false; end if;
    select count(*), count(distinct value)
      into image_count, distinct_image_count
      from jsonb_array_elements_text(collection->'images') as images(value);
    if image_count <> jsonb_array_length(collection->'images') or image_count <> distinct_image_count then return false; end if;
    for image_path in select value from jsonb_array_elements_text(collection->'images') as images(value) loop
      if image_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
        and image_path !~ '^static:/assets/portfolio/[^/]+/[^/]+\.(jpg|png|webp)$' then
        return false;
      end if;
    end loop;
    if (collection->>'totalImages')::integer < jsonb_array_length(collection->'images') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_portfolio_collections(jsonb) from public, anon, authenticated, service_role;
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check
  check (action in ('inquiry.updated', 'content.updated', 'portfolio.updated'));
alter table public.portfolio_content drop constraint if exists portfolio_content_valid;
alter table public.portfolio_content add constraint portfolio_content_valid
  check (private.valid_portfolio_collections(collections));

insert into public.portfolio_content (id, collections) values (1, '[]'::jsonb)
  on conflict (id) do nothing;
alter table public.portfolio_content enable row level security;
revoke all on table public.portfolio_content from public, anon, authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('site-portfolio', 'site-portfolio', true, 8388608, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists site_portfolio_server_only on storage.objects;
create policy site_portfolio_server_only on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'site-portfolio') with check (bucket_id <> 'site-portfolio');

create or replace function private.audit_editor_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_keys text[] := array[]::text[];
  details jsonb;
  action_name text;
begin
  if tg_table_schema <> 'public' then raise exception 'invalid_trigger_target'; end if;
  if tg_table_name = 'collaboration_requests' then
    action_name := 'inquiry.updated';
    if new.status is distinct from old.status then changed_keys := array_append(changed_keys, 'status'); end if;
    if new.admin_notes is distinct from old.admin_notes then changed_keys := array_append(changed_keys, 'admin_notes'); end if;
    details := jsonb_build_object('changed_keys', changed_keys, 'status_from', old.status, 'status_to', new.status, 'version', new.version);
  elsif tg_table_name = 'site_content' then
    action_name := 'content.updated';
    if new.announcement is distinct from old.announcement then changed_keys := array_append(changed_keys, 'announcement'); end if;
    if new.announcement_enabled is distinct from old.announcement_enabled then changed_keys := array_append(changed_keys, 'announcement_enabled'); end if;
    if new.faqs is distinct from old.faqs then changed_keys := array_append(changed_keys, 'faqs'); end if;
    details := jsonb_build_object('changed_keys', changed_keys, 'version', new.version);
  elsif tg_table_name = 'portfolio_content' then
    action_name := 'portfolio.updated';
    changed_keys := array_append(changed_keys, 'collections');
    details := jsonb_build_object('changed_keys', changed_keys, 'collection_count', jsonb_array_length(new.collections), 'version', new.version);
  else
    raise exception 'invalid_trigger_target';
  end if;
  insert into public.audit_logs (actor_id, action, target_id, metadata)
    values (auth.uid(), action_name, new.id::text, details);
  return new;
end;
$$;
revoke all on function private.audit_editor_update() from public, anon, authenticated, service_role;

drop trigger if exists editor_version on public.portfolio_content;
create trigger editor_version before update on public.portfolio_content
  for each row execute function private.version_editor_update();
drop trigger if exists editor_audit on public.portfolio_content;
create trigger editor_audit after update on public.portfolio_content
  for each row execute function private.audit_editor_update();

create or replace function public.get_public_portfolio_content()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('collections', collections, 'version', version)
    from public.portfolio_content where id = 1;
$$;
revoke all on function public.get_public_portfolio_content() from public, anon, authenticated, service_role;
grant execute on function public.get_public_portfolio_content() to anon, authenticated;

create or replace function public.admin_update_portfolio(p_collections jsonb, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result_row public.portfolio_content;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_version is null or p_version < 1 or not private.valid_portfolio_collections(p_collections) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  update public.portfolio_content
    set collections = p_collections
    where id = 1 and version = p_version
    returning * into result_row;
  if not found then
    if not exists (select 1 from public.portfolio_content where id = 1) then
      raise exception using errcode = 'P0002', message = 'not_found';
    end if;
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  return jsonb_build_object('collections', result_row.collections, 'version', result_row.version);
end;
$$;
revoke all on function public.admin_update_portfolio(jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_portfolio(jsonb, integer) to authenticated;
