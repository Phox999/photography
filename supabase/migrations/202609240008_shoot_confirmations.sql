-- Requires 001, 005 (progress receipts), and 006 (shoot availability).
-- Confirmation writes and slot reservations commit or roll back together.
begin;

create table if not exists public.shoot_confirmations (
  inquiry_id uuid primary key references public.collaboration_requests(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  slot_id uuid references public.shoot_availability(id) on delete restrict,
  -- Snapshot the selected slot; ordinary availability editing cannot move it.
  starts_at timestamptz,
  ends_at timestamptz,
  location text not null default '' check (char_length(location) <= 300),
  map_url text not null default '' check (char_length(map_url) <= 2048),
  wardrobe text not null default '' check (char_length(wardrobe) <= 2000),
  bring text not null default '' check (char_length(bring) <= 2000),
  rain_plan text not null default '' check (char_length(rain_plan) <= 2000),
  delivery_note text not null default '' check (char_length(delivery_note) <= 2000),
  publication_note text not null default '' check (char_length(publication_note) <= 2000),
  updated_at timestamptz not null default now(),
  constraint shoot_confirmation_slot_snapshot check (
    (slot_id is null and starts_at is null and ends_at is null)
    or (slot_id is not null and starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  constraint shoot_confirmation_publishable check (
    status <> 'confirmed' or (slot_id is not null and char_length(btrim(location)) > 0)
  )
);

-- Keep every saved version privately; no draft/history reaches the receipt RPC.
create table if not exists private.shoot_confirmation_history (
  inquiry_id uuid not null references public.collaboration_requests(id) on delete cascade,
  version integer not null check (version > 0),
  actor_id uuid,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (inquiry_id, version)
);

alter table public.shoot_confirmations enable row level security;
alter table private.shoot_confirmation_history enable row level security;

-- Remove stale table/column grants and policies if this migration is rerun.
do $$
declare
  policy_row record;
  column_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname from pg_policies
    where (schemaname = 'public' and tablename = 'shoot_confirmations')
       or (schemaname = 'private' and tablename = 'shoot_confirmation_history')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
  for column_row in
    select table_schema, table_name, column_name from information_schema.columns
    where (table_schema = 'public' and table_name = 'shoot_confirmations')
       or (table_schema = 'private' and table_name = 'shoot_confirmation_history')
  loop
    execute format('revoke all privileges (%I) on table %I.%I from public, anon, authenticated, service_role',
      column_row.column_name, column_row.table_schema, column_row.table_name);
  end loop;
end;
$$;

revoke all on public.shoot_confirmations, private.shoot_confirmation_history
  from public, anon, authenticated, service_role;
grant select on public.shoot_confirmations to authenticated;
create policy shoot_confirmations_read_admin on public.shoot_confirmations
  for select to authenticated using ((select private.is_site_admin()));

create or replace function private.shoot_confirmation_json(p_confirmation public.shoot_confirmations)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'inquiryId', (p_confirmation).inquiry_id,
    'version', (p_confirmation).version,
    'status', (p_confirmation).status,
    'slotId', (p_confirmation).slot_id,
    'startsAt', (p_confirmation).starts_at,
    'endsAt', (p_confirmation).ends_at,
    'location', (p_confirmation).location,
    'mapUrl', (p_confirmation).map_url,
    'wardrobe', (p_confirmation).wardrobe,
    'bring', (p_confirmation).bring,
    'rainPlan', (p_confirmation).rain_plan,
    'deliveryNote', (p_confirmation).delivery_note,
    'publicationNote', (p_confirmation).publication_note,
    'updatedAt', (p_confirmation).updated_at
  );
$$;
revoke all on function private.shoot_confirmation_json(public.shoot_confirmations)
  from public, anon, authenticated, service_role;

create or replace function private.record_shoot_confirmation_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.shoot_confirmation_history (inquiry_id, version, actor_id, snapshot)
    values (new.inquiry_id, new.version, auth.uid(), private.shoot_confirmation_json(new));
  return new;
end;
$$;
revoke all on function private.record_shoot_confirmation_history()
  from public, anon, authenticated, service_role;

drop trigger if exists confirmation_version on public.shoot_confirmations;
create trigger confirmation_version before update on public.shoot_confirmations
  for each row execute function private.version_editor_update();
drop trigger if exists confirmation_history on public.shoot_confirmations;
create trigger confirmation_history after insert or update on public.shoot_confirmations
  for each row execute function private.record_shoot_confirmation_history();

-- 005 defines a null-returning stub so receipts work before confirmations ship.
-- This helper is private and is invoked only by the owner-executed receipt RPC.
create or replace function private.get_published_shoot_confirmation(p_inquiry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.shoot_confirmation_json(c) - 'inquiryId'
    from public.shoot_confirmations as c
    where c.inquiry_id = p_inquiry_id and c.status = 'confirmed';
$$;
revoke all on function private.get_published_shoot_confirmation(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_get_shoot_confirmation(p_inquiry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_inquiry_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if not exists (select 1 from public.collaboration_requests where id = p_inquiry_id) then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  select private.shoot_confirmation_json(c) into result
    from public.shoot_confirmations as c where c.inquiry_id = p_inquiry_id;
  return result;
end;
$$;
revoke all on function public.admin_get_shoot_confirmation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_get_shoot_confirmation(uuid) to authenticated;

create or replace function public.admin_update_shoot_confirmation(
  p_inquiry_id uuid,
  p_version integer,
  p_status text,
  p_slot_id uuid,
  p_location text,
  p_map_url text,
  p_wardrobe text,
  p_bring text,
  p_rain_plan text,
  p_delivery_note text,
  p_publication_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_row public.shoot_confirmations;
  result_row public.shoot_confirmations;
  slot_row public.shoot_availability;
  previous_slot public.shoot_availability;
  has_previous boolean;
  reservation_status text;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_inquiry_id is null or p_version is null or p_version < 0 or p_version > 2147483646
    or p_status is null or p_status not in ('draft', 'confirmed')
    or p_location is null or p_map_url is null or p_wardrobe is null
    or p_bring is null or p_rain_plan is null or p_delivery_note is null
    or p_publication_note is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  p_location := btrim(p_location, E' \t\n\r');
  p_map_url := btrim(p_map_url, E' \t\n\r');
  p_wardrobe := btrim(p_wardrobe, E' \t\n\r');
  p_bring := btrim(p_bring, E' \t\n\r');
  p_rain_plan := btrim(p_rain_plan, E' \t\n\r');
  p_delivery_note := btrim(p_delivery_note, E' \t\n\r');
  p_publication_note := btrim(p_publication_note, E' \t\n\r');
  if char_length(p_location) > 300 or char_length(p_map_url) > 2048
    or char_length(p_wardrobe) > 2000 or char_length(p_bring) > 2000
    or char_length(p_rain_plan) > 2000 or char_length(p_delivery_note) > 2000
    or char_length(p_publication_note) > 2000
    -- Free-form text permits tabs/newlines but no other control characters.
    or regexp_replace(p_location || p_map_url || p_wardrobe || p_bring || p_rain_plan || p_delivery_note || p_publication_note,
      E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]'
    -- The authority must be present and cannot contain credentials.
    or (p_map_url <> '' and p_map_url !~* '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$')
    or (p_status = 'confirmed' and (p_slot_id is null or p_location = '')) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  -- Serialize first saves as well as edits without changing the inquiry version.
  perform 1 from public.collaboration_requests where id = p_inquiry_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  select * into previous_row from public.shoot_confirmations
    where inquiry_id = p_inquiry_id for update;
  has_previous := found;
  if (has_previous and previous_row.version <> p_version)
    or (not has_previous and p_version <> 0) then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;

  -- Lock both sides of a move in UUID order. Competing reservations therefore
  -- cannot double-book, and opposite reschedules do not deadlock on slot rows.
  perform 1 from public.shoot_availability
    where id = p_slot_id or id = previous_row.slot_id
    order by id for update;
  if previous_row.slot_id is not null then
    select * into previous_slot from public.shoot_availability where id = previous_row.slot_id;
    if not found or previous_slot.inquiry_id is distinct from p_inquiry_id
      or previous_slot.status not in ('held', 'booked') then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
  end if;
  if p_slot_id is not null then
    select * into slot_row from public.shoot_availability where id = p_slot_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'not_found';
    end if;
    if not ((slot_row.status in ('open', 'held') and slot_row.inquiry_id is null)
      or (slot_row.status in ('held', 'booked') and slot_row.inquiry_id is not distinct from p_inquiry_id)) then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
    -- Existing appointments remain editable after their start time; a new
    -- reservation cannot claim a slot that has already begun.
    if slot_row.starts_at <= clock_timestamp()
      and previous_row.slot_id is distinct from p_slot_id then
      raise exception using errcode = '22023', message = 'slot_in_past';
    end if;
  end if;

  if previous_row.slot_id is not null and previous_row.slot_id is distinct from p_slot_id then
    update public.shoot_availability set status = 'open', inquiry_id = null
      where id = previous_row.slot_id;
  end if;
  if p_slot_id is not null then
    -- A draft holds its selected slot. Withdrawing a confirmation retains that
    -- hold, so revising public details does not accidentally lose the appointment.
    -- Clearing/changing the slot explicitly releases its former reservation.
    reservation_status := case when p_status = 'confirmed' then 'booked' else 'held' end;
    update public.shoot_availability set status = reservation_status, inquiry_id = p_inquiry_id
      where id = p_slot_id
        and (status is distinct from reservation_status or inquiry_id is distinct from p_inquiry_id);
    -- 006's version trigger owns the slot's version and updated_at changes.
  end if;

  if has_previous then
    update public.shoot_confirmations set
      status = p_status, slot_id = p_slot_id,
      starts_at = slot_row.starts_at, ends_at = slot_row.ends_at,
      location = p_location, map_url = p_map_url, wardrobe = p_wardrobe,
      bring = p_bring, rain_plan = p_rain_plan, delivery_note = p_delivery_note,
      publication_note = p_publication_note
      where inquiry_id = p_inquiry_id and version = p_version
      returning * into result_row;
  else
    insert into public.shoot_confirmations (
      inquiry_id, status, slot_id, starts_at, ends_at, location, map_url,
      wardrobe, bring, rain_plan, delivery_note, publication_note
    ) values (
      p_inquiry_id, p_status, p_slot_id, slot_row.starts_at, slot_row.ends_at,
      p_location, p_map_url, p_wardrobe, p_bring, p_rain_plan,
      p_delivery_note, p_publication_note
    ) returning * into result_row;
  end if;
  return private.shoot_confirmation_json(result_row);
end;
$$;
revoke all on function public.admin_update_shoot_confirmation(uuid, integer, text, uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_shoot_confirmation(uuid, integer, text, uuid, text, text, text, text, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
