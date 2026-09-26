-- Run as the Supabase project postgres owner. No secrets or passwords belong here.
-- Re-running this transaction preserves inquiry rows, content, and administrator entries.
begin;

create schema if not exists private;
revoke create on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_method text not null,
  contact_account text not null,
  collaboration_type text not null,
  preferred_date text,
  description text,
  consent boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.collaboration_requests
  add column if not exists admin_notes text not null default '',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version integer not null default 1;

alter table public.collaboration_requests
  drop constraint if exists collaboration_requests_admin_notes_limit,
  drop constraint if exists collaboration_requests_version_positive;
alter table public.collaboration_requests
  add constraint collaboration_requests_admin_notes_limit
    check (admin_notes is not null and char_length(admin_notes) <= 4000),
  add constraint collaboration_requests_version_positive
    check (version is not null and version > 0);

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function private.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.site_admins as a
    where a.user_id = auth.uid() and a.active = true
  );
$$;
revoke all on function private.is_site_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_site_admin() to authenticated;

-- CHECK constraints and the RPC use the same JSON shape validation.
create or replace function private.valid_site_faqs(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 12 then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if (item - 'question' - 'answer') <> '{}'::jsonb
      or jsonb_typeof(item -> 'question') is distinct from 'string'
      or jsonb_typeof(item -> 'answer') is distinct from 'string' then return false; end if;
    if char_length(btrim(item ->> 'question')) < 1
      or char_length(item ->> 'question') > 160
      or char_length(btrim(item ->> 'answer')) < 1
      or char_length(item ->> 'answer') > 1200 then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_site_faqs(jsonb) from public, anon, authenticated, service_role;

create table if not exists public.site_content (
  id integer primary key default 1 check (id = 1),
  announcement text not null default '' check (char_length(announcement) <= 500),
  announcement_enabled boolean not null default false,
  faqs jsonb not null default '[]'::jsonb check (private.valid_site_faqs(faqs)),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

-- This is published content, never a draft store. Existing content is preserved.
insert into public.site_content (id, faqs) values (1, $faqs$
[
  {"question":"我不會擺姿勢怎麼辦？","answer":"拍攝過程會協助引導姿勢、表情與動作，不需要事先有模特兒經驗。"},
  {"question":"拍攝需要付費嗎？","answer":"互惠合作本身不收取拍攝費；若有棚租、場地或道具等額外支出，會在拍攝前討論如何分攤。"},
  {"question":"多久可以拿到照片？","answer":"一般會在拍攝後 2–3 週交付，實際時間會依當月拍攝量調整。"},
  {"question":"如果臨時有事要改期？","answer":"請盡早告知，我們會再確認彼此可配合的日期；多次臨時取消可能影響後續合作安排。"},
  {"question":"如何申請合作？","answer":"點擊「填寫合作意向」留下拍攝想法與聯絡方式。我會依主題、檔期與合作方式回覆；送出意向不代表預約成立，時間以雙方確認為準。"}
]
$faqs$::jsonb) on conflict (id) do nothing;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Keep the historical UUID if its auth.users account is later deleted.
  -- NULL denotes an owner maintenance update made outside an Auth session.
  actor_id uuid,
  action text not null check (action in ('inquiry.updated', 'content.updated')),
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists collaboration_requests_created_id_idx
  on public.collaboration_requests (created_at desc, id desc);
create index if not exists collaboration_requests_status_created_idx
  on public.collaboration_requests (status, created_at desc);
create index if not exists audit_logs_created_id_idx
  on public.audit_logs (created_at desc, id desc);

alter table public.site_admins enable row level security;
alter table public.collaboration_requests enable row level security;
alter table public.site_content enable row level security;
alter table public.audit_logs enable row level security;

-- Policies are permissive by default; remove old policies on ONLY these four tables.
-- Remove table AND column grants so an older column-level grant cannot survive.
do $$
declare
  policy_row record;
  column_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('site_admins', 'collaboration_requests', 'site_content', 'audit_logs')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
  for column_row in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and table_name in ('site_admins', 'collaboration_requests', 'site_content', 'audit_logs')
  loop
    execute format('revoke all privileges (%I) on table public.%I from public, anon, authenticated, service_role', column_row.column_name, column_row.table_name);
  end loop;
end;
$$;
revoke all on table public.site_admins, public.collaboration_requests, public.site_content, public.audit_logs
  from public, anon, authenticated, service_role;

grant select on public.site_admins, public.collaboration_requests, public.site_content, public.audit_logs to authenticated;
-- Existing POST /api/inquiries uses a server-only secret key with no SELECT return.
grant insert on public.collaboration_requests to service_role;

create policy site_admins_read_self on public.site_admins
  for select to authenticated using (user_id = (select auth.uid()));
create policy inquiries_read_admin on public.collaboration_requests
  for select to authenticated using ((select private.is_site_admin()));
create policy content_read_admin on public.site_content
  for select to authenticated using (id = 1 and (select private.is_site_admin()));
create policy audit_read_admin on public.audit_logs
  for select to authenticated using ((select private.is_site_admin()));

-- Deliberately no client UPDATE grants/policies. All writes use the narrow RPCs
-- below, with a fresh allowlist check and a required expected version.
create or replace function private.version_editor_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.version_editor_update() from public, anon, authenticated, service_role;

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
  else
    raise exception 'invalid_trigger_target';
  end if;
  insert into public.audit_logs (actor_id, action, target_id, metadata)
    values (auth.uid(), action_name, new.id::text, details);
  return new;
end;
$$;
revoke all on function private.audit_editor_update() from public, anon, authenticated, service_role;

drop trigger if exists editor_version on public.collaboration_requests;
create trigger editor_version before update on public.collaboration_requests
  for each row execute function private.version_editor_update();
drop trigger if exists editor_audit on public.collaboration_requests;
create trigger editor_audit after update on public.collaboration_requests
  for each row execute function private.audit_editor_update();
drop trigger if exists editor_version on public.site_content;
create trigger editor_version before update on public.site_content
  for each row execute function private.version_editor_update();
drop trigger if exists editor_audit on public.site_content;
create trigger editor_audit after update on public.site_content
  for each row execute function private.audit_editor_update();

create or replace function public.admin_update_inquiry(
  p_id uuid,
  p_status text,
  p_admin_notes text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.collaboration_requests;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_id is null or p_version is null or p_version < 1
    or p_status is null or p_status not in ('new', 'reviewing', 'contacted', 'closed')
    or p_admin_notes is null or char_length(p_admin_notes) > 4000 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  -- UPDATE locks the row and rechecks the version after a concurrent writer commits.
  update public.collaboration_requests
    set status = p_status, admin_notes = p_admin_notes
    where id = p_id and version = p_version
    returning * into result_row;
  if not found then
    if not exists (select 1 from public.collaboration_requests where id = p_id) then
      raise exception using errcode = 'P0002', message = 'not_found';
    end if;
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  return to_jsonb(result_row);
end;
$$;
revoke all on function public.admin_update_inquiry(uuid, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_inquiry(uuid, text, text, integer) to authenticated;

create or replace function public.admin_update_content(
  p_announcement text,
  p_announcement_enabled boolean,
  p_faqs jsonb,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.site_content;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_version is null or p_version < 1
    or p_announcement is null or char_length(p_announcement) > 500
    or p_announcement_enabled is null or not private.valid_site_faqs(p_faqs)
    or (p_announcement_enabled and char_length(btrim(p_announcement)) = 0) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  update public.site_content
    set announcement = p_announcement, announcement_enabled = p_announcement_enabled, faqs = p_faqs
    where id = 1 and version = p_version
    returning * into result_row;
  if not found then
    if not exists (select 1 from public.site_content where id = 1) then
      raise exception using errcode = 'P0002', message = 'not_found';
    end if;
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  return to_jsonb(result_row);
end;
$$;
revoke all on function public.admin_update_content(text, boolean, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_content(text, boolean, jsonb, integer) to authenticated;

-- Public reads expose only the published fields, including an empty disabled notice.
create or replace function public.get_public_site_content()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'announcement', case when announcement_enabled then announcement else '' end,
    'faqs', faqs,
    'version', version
  ) from public.site_content where id = 1;
$$;
revoke all on function public.get_public_site_content() from public, anon, authenticated, service_role;
grant execute on function public.get_public_site_content() to anon, authenticated;

-- The login function supplies keyed SHA-256 digests; raw IPs/emails never enter this table.
create table if not exists private.admin_login_attempts (
  key_type text not null check (key_type in ('ip', 'email')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (key_type, key_hash, bucket_start)
);
create index if not exists admin_login_attempts_expiry_idx
  on private.admin_login_attempts (bucket_start);
alter table private.admin_login_attempts enable row level security;
revoke all on private.admin_login_attempts from public, anon, authenticated, service_role;

create or replace function public.consume_admin_login_attempt(p_ip_key text, p_email_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_time_value timestamptz := transaction_timestamp();
  bucket_value timestamptz := to_timestamp(floor(extract(epoch from current_time_value) / 900) * 900);
  retry_seconds integer := greatest(1, least(900, ceil(extract(epoch from (bucket_value + interval '15 minutes' - current_time_value)))::integer));
  consumed integer;
begin
  if p_ip_key is null or p_email_key is null
    or p_ip_key !~ '^[0-9a-f]{64}$' or p_email_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  delete from private.admin_login_attempts
    where bucket_start < current_time_value - interval '1 hour';

  insert into private.admin_login_attempts as limits (key_type, key_hash, bucket_start, attempts)
    values ('ip', p_ip_key, bucket_value, 1)
    on conflict (key_type, key_hash, bucket_start) do update
      set attempts = limits.attempts + 1 where limits.attempts < 30
    returning attempts into consumed;
  if not found then
    return jsonb_build_object('allowed', false, 'retry_after', retry_seconds);
  end if;

  insert into private.admin_login_attempts as limits (key_type, key_hash, bucket_start, attempts)
    values ('email', p_email_key, bucket_value, 1)
    on conflict (key_type, key_hash, bucket_start) do update
      set attempts = limits.attempts + 1 where limits.attempts < 8
    returning attempts into consumed;
  if not found then
    return jsonb_build_object('allowed', false, 'retry_after', retry_seconds);
  end if;
  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;
revoke all on function public.consume_admin_login_attempt(text, text) from public, anon, authenticated, service_role;
grant execute on function public.consume_admin_login_attempt(text, text) to service_role;

comment on table public.site_admins is 'Manual administrator allowlist. Client roles cannot grant or revoke access.';
comment on table public.site_content is 'One CMS row. Only get_public_site_content() exposes published fields; disabled announcement text is withheld.';
comment on table public.audit_logs is 'Atomic editor update records; excludes contact details, request text, notes, and content bodies.';

notify pgrst, 'reload schema';
commit;
