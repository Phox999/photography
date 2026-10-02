-- Apply portfolio changes as one version-checked database transaction.
create or replace function public.admin_update_portfolio_changes(
  p_upserts jsonb,
  p_deleted_slugs text[],
  p_order text[],
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.portfolio_content;
  item jsonb;
  item_slug text;
  item_key_count integer;
  seen_upsert_slugs text[] := array[]::text[];
  result_by_slug jsonb := '{}'::jsonb;
  ordered_collections jsonb := '[]'::jsonb;
  result_count integer;
  distinct_count integer;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_version is null or p_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select * into current_row
    from public.portfolio_content
    where id = 1
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if current_row.version <> p_version then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;

  if p_upserts is null or jsonb_typeof(p_upserts) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_deleted_slugs is null or p_order is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if jsonb_array_length(p_upserts) > 80
    or cardinality(p_deleted_slugs) > 80 or cardinality(p_order) > 80 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if array_position(p_deleted_slugs, null) is not null
    or array_position(p_order, null) is not null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  for item in select value from jsonb_array_elements(p_upserts) as entries(value) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    select count(*) into item_key_count from jsonb_object_keys(item) as keys(value);
    if item_key_count <> 7
      or item - array['slug', 'title', 'category', 'description', 'cover', 'images', 'totalImages'] <> '{}'::jsonb
      or not private.valid_portfolio_collections(jsonb_build_array(item)) then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    item_slug := item->>'slug';
    if item_slug = any(p_deleted_slugs) or item_slug = any(seen_upsert_slugs) then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    seen_upsert_slugs := array_append(seen_upsert_slugs, item_slug);
  end loop;

  select count(*), count(distinct slug)
    into result_count, distinct_count
    from unnest(p_deleted_slugs) as requested(slug);
  if result_count <> distinct_count then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  foreach item_slug in array p_deleted_slugs loop
    if char_length(item_slug) not between 1 and 120
      or item_slug ~ '[/?#]' or position(chr(92) in item_slug) > 0
      or not exists (
        select 1 from jsonb_array_elements(current_row.collections) as entries(value)
        where value->>'slug' = item_slug
      ) then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
  end loop;

  foreach item_slug in array p_order loop
    if char_length(item_slug) not between 1 and 120
      or item_slug ~ '[/?#]' or position(chr(92) in item_slug) > 0 then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
  end loop;
  select count(*), count(distinct slug)
    into result_count, distinct_count
    from unnest(p_order) as requested(slug);
  if result_count <> distinct_count then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  for item in select value from jsonb_array_elements(current_row.collections) as entries(value) loop
    item_slug := item->>'slug';
    if not (item_slug = any(p_deleted_slugs)) then
      result_by_slug := result_by_slug || jsonb_build_object(item_slug, item);
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_upserts) as entries(value) loop
    result_by_slug := result_by_slug || jsonb_build_object(item->>'slug', item);
  end loop;

  select count(*) into result_count from jsonb_object_keys(result_by_slug) as keys(value);
  if result_count < 1 or result_count <> cardinality(p_order) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  foreach item_slug in array p_order loop
    if not (result_by_slug ? item_slug) then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    ordered_collections := ordered_collections || jsonb_build_array(result_by_slug->item_slug);
  end loop;
  if not private.valid_portfolio_collections(ordered_collections) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  update public.portfolio_content
    set collections = ordered_collections
    where id = 1 and version = p_version
    returning * into current_row;
  if not found then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  return jsonb_build_object('collections', current_row.collections, 'version', current_row.version);
end;
$$;
revoke all on function public.admin_update_portfolio_changes(jsonb, text[], text[], integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_portfolio_changes(jsonb, text[], text[], integer) to authenticated;
