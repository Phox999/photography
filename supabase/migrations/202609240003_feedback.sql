-- Run after 202609240001_admin.sql. Submission is private until consent + review.
begin;
create table if not exists public.collaboration_feedback (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  contact text not null check (char_length(btrim(contact)) between 1 and 160),
  experience text not null check (char_length(btrim(experience)) between 1 and 2000),
  improvement text not null default '' check (char_length(improvement) <= 1000),
  consent boolean not null check (consent = true),
  allow_publication boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  check (status <> 'approved' or allow_publication = true)
);
create index if not exists feedback_status_created_idx on public.collaboration_feedback(status, created_at desc, id desc);
alter table public.collaboration_feedback enable row level security;
revoke all on public.collaboration_feedback from public, anon, authenticated;
grant select on public.collaboration_feedback to authenticated;
grant select, insert on public.collaboration_feedback to service_role;
drop policy if exists feedback_admin_read on public.collaboration_feedback;
create policy feedback_admin_read on public.collaboration_feedback for select to authenticated using (private.is_site_admin());

create or replace function public.admin_review_feedback(p_id uuid, p_status text, p_version integer)
returns setof public.collaboration_feedback
language plpgsql security definer set search_path = ''
as $$
declare current_row public.collaboration_feedback;
begin
  if not private.is_site_admin() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_status is null or p_status not in ('pending', 'approved', 'declined') or p_version is null or p_version < 1 or p_version >= 2147483647 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  select * into current_row from public.collaboration_feedback where id = p_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
  if current_row.version <> p_version then raise exception using errcode = 'P0001', message = 'conflict'; end if;
  if p_status = 'approved' and not current_row.allow_publication then raise exception using errcode = '22023', message = 'publication_not_consented'; end if;
  return query update public.collaboration_feedback set status = p_status, version = version + 1, updated_at = now() where id = p_id returning *;
end;
$$;
revoke all on function public.admin_review_feedback(uuid,text,integer) from public, anon, service_role;
grant execute on function public.admin_review_feedback(uuid,text,integer) to authenticated;
commit;
