-- Existing photo projects include collections with more than 200 images.
-- Keep database validation aligned with the admin's 500-image management limit.
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
      or jsonb_array_length(collection->'images') not between 1 and 500
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
alter table public.portfolio_content drop constraint if exists portfolio_content_valid;
alter table public.portfolio_content add constraint portfolio_content_valid
  check (private.valid_portfolio_collections(collections));
