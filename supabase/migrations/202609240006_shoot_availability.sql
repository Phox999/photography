-- Single photographer calendar. No illustrative bookings or opening hours are seeded.
begin;

create table if not exists public.shoot_availability (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'held', 'booked', 'closed')),
  inquiry_id uuid references public.collaboration_requests(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shoot_availability_duration check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
  constraint shoot_availability_booked_inquiry check (status <> 'booked' or inquiry_id is not null),
  constraint shoot_availability_linked_state check (inquiry_id is null or status in ('held', 'booked')),
  -- Native range GiST needs no extension. Closed intervals remain records: reopen/edit
  -- those records instead of creating an ambiguous overlapping public schedule.
  constraint shoot_availability_no_overlap exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
);
create index if not exists shoot_availability_starts_idx on public.shoot_availability (starts_at, id);
create index if not exists shoot_availability_inquiry_idx on public.shoot_availability (inquiry_id) where inquiry_id is not null;
alter table public.shoot_availability enable row level security;
revoke all on public.shoot_availability from public, anon, authenticated, service_role;
grant select on public.shoot_availability to authenticated;
drop policy if exists availability_admin_read on public.shoot_availability;
create policy availability_admin_read on public.shoot_availability for select to authenticated using ((select private.is_site_admin()));

drop trigger if exists availability_version on public.shoot_availability;
create trigger availability_version before update on public.shoot_availability
  for each row execute function private.version_editor_update();

create or replace function public.admin_save_availability(p_id uuid, p_version integer, p_starts_at timestamptz, p_ends_at timestamptz, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare slot public.shoot_availability;
begin
  if not private.is_site_admin() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at)
    or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '24 hours'
    or p_status is null or p_status not in ('open', 'held', 'closed') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  if p_id is null then
    if p_version is not null then raise exception using errcode = '22023', message = 'invalid_input'; end if;
    insert into public.shoot_availability(starts_at, ends_at, status) values (p_starts_at, p_ends_at, p_status) returning * into slot;
  else
    if p_version is null or p_version < 1 then raise exception using errcode = '22023', message = 'invalid_input'; end if;
    -- Same lock used by confirmation publication/rescheduling. Never overwrite a
    -- booked or linked held row, including an unmodified timestamp update.
    select * into slot from public.shoot_availability where id = p_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
    if slot.version <> p_version or slot.status = 'booked' or slot.inquiry_id is not null then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
    update public.shoot_availability set starts_at = p_starts_at, ends_at = p_ends_at, status = p_status where id = p_id returning * into slot;
  end if;
  return to_jsonb(slot);
exception when exclusion_violation then
  -- Concurrent overlapping INSERT/UPDATE waits for the competing transaction;
  -- the GiST constraint remains authoritative, regardless of stale UI data.
  raise exception using errcode = 'P0001', message = 'conflict';
end;
$$;
revoke all on function public.admin_save_availability(uuid, integer, timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_save_availability(uuid, integer, timestamptz, timestamptz, text) to authenticated;

create or replace function public.get_public_availability(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from or p_to - p_from > 179 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'startsAt', starts_at, 'endsAt', ends_at,
    'status', case when status = 'open' then 'open' else 'unavailable' end) order by starts_at, id), '[]'::jsonb)
    from public.shoot_availability
    where starts_at < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
      and ends_at > (p_from::timestamp at time zone 'Asia/Taipei'));
end;
$$;
revoke all on function public.get_public_availability(date, date) from public, anon, authenticated, service_role;
grant execute on function public.get_public_availability(date, date) to anon, authenticated;

-- JSON aggregation avoids the PostgREST default row cap silently hiding slots.
create or replace function public.get_admin_availability(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_site_admin() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from or p_to - p_from > 179 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'starts_at', starts_at, 'ends_at', ends_at,
    'status', status, 'inquiry_id', inquiry_id, 'version', version) order by starts_at, id), '[]'::jsonb)
    from public.shoot_availability
    where starts_at < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
      and ends_at > (p_from::timestamp at time zone 'Asia/Taipei'));
end;
$$;
revoke all on function public.get_admin_availability(date, date) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_availability(date, date) to authenticated;

comment on table public.shoot_availability is 'Authoritative single-photographer intervals. Public absence means unknown, never open. Booked or inquiry-bound slots are changed only through confirmation workflow.';
notify pgrst, 'reload schema';
commit;
