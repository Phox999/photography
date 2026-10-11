-- Keep the already-applied snapshot validator, but accept ordinary paragraph
-- layout characters that the JavaScript catalog and request flow allow.
-- The compact JSON byte check matches JSON.stringify(snapshot) in the app.
begin;

create or replace function private.valid_shoot_project_snapshot(value jsonb, project_id text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare revision_text text; field_name text;
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
  foreach field_name in array array['title','summary','concept','area','dateNote','costNote','deliveryNote','publicationNote'] loop
    if jsonb_typeof(value -> field_name) is distinct from 'string'
      or char_length(btrim(value ->> field_name, ' ' || pg_catalog.chr(9) || pg_catalog.chr(10) || pg_catalog.chr(13))) < 1
      or (field_name = 'title' and char_length(value ->> field_name) > 120)
      or (field_name = 'summary' and char_length(value ->> field_name) > 400)
      or (field_name = 'concept' and char_length(value ->> field_name) > 2000)
      or (field_name = 'area' and char_length(value ->> field_name) > 160)
      or (field_name in ('dateNote', 'costNote', 'deliveryNote', 'publicationNote') and char_length(value ->> field_name) > 1000)
      or translate(value ->> field_name, pg_catalog.chr(9) || pg_catalog.chr(10) || pg_catalog.chr(13), '') ~ '[[:cntrl:]]' then return false; end if;
  end loop;
  if not (value ? 'deadlineAt') then return false; end if;
  if value -> 'deadlineAt' <> 'null'::jsonb then
    if jsonb_typeof(value -> 'deadlineAt') is distinct from 'string'
      or char_length(value ->> 'deadlineAt') > 40
      or (value ->> 'deadlineAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then return false; end if;
  end if;
  -- The allowlist above requires a flat object with exactly 12 members. jsonb::text
  -- adds one space after each of its 12 colons and 11 commas; remove those 23
  -- formatting bytes before comparing with JSON.stringify(snapshot) in JavaScript.
  return octet_length(value::text) - 23 <= 12000;
end;
$$;

revoke all on function private.valid_shoot_project_snapshot(jsonb, text) from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant execute on function private.valid_shoot_project_snapshot(jsonb, text) to service_role;

commit;
