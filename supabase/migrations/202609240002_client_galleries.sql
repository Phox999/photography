-- Run after 202609240001_admin.sql as the Supabase project database owner.
-- Client invitation secrets are hashed by the server; this migration has no keys.
begin;

create table if not exists public.client_galleries (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'proofing', 'delivered')),
  selection_limit integer not null default 20 check (selection_limit between 1 and 200),
  allow_downloads boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.client_gallery_photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.client_galleries(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  preview_path text not null,
  delivery_path text,
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gallery_id, preview_path),
  check (char_length(preview_path) <= 240 and preview_path ~ ('^' || gallery_id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|avif)$')),
  check (delivery_path is null or (char_length(delivery_path) <= 240 and delivery_path ~ ('^' || gallery_id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|avif)$'))),
  check (delivery_path is null or delivery_path <> preview_path)
);
create table if not exists public.client_gallery_invites (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.client_galleries(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, gallery_id)
);
create table if not exists public.client_gallery_selections (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique,
  gallery_id uuid not null references public.client_galleries(id) on delete cascade,
  photo_ids uuid[] not null check (cardinality(photo_ids) between 1 and 200 and array_position(photo_ids, null) is null),
  note text not null default '' check (char_length(note) <= 2000),
  submitted_at timestamptz not null default now(),
  foreign key (invite_id, gallery_id) references public.client_gallery_invites(id, gallery_id) on delete cascade
);
create table if not exists public.client_gallery_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  gallery_id uuid not null references public.client_galleries(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists client_gallery_photos_gallery_idx on public.client_gallery_photos(gallery_id, created_at);
create index if not exists client_gallery_invites_gallery_idx on public.client_gallery_invites(gallery_id, created_at);
create index if not exists client_gallery_selections_gallery_idx on public.client_gallery_selections(gallery_id, submitted_at);

alter table public.client_galleries enable row level security;
alter table public.client_gallery_photos enable row level security;
alter table public.client_gallery_invites enable row level security;
alter table public.client_gallery_selections enable row level security;
alter table public.client_gallery_events enable row level security;
revoke all on public.client_galleries, public.client_gallery_photos, public.client_gallery_invites,
  public.client_gallery_selections, public.client_gallery_events from public, anon, authenticated, service_role;
grant select on public.client_galleries, public.client_gallery_photos, public.client_gallery_selections to authenticated;
-- Even administrators reading the REST table cannot retrieve invitation hashes.
grant select(id, gallery_id, expires_at, revoked_at, created_at) on public.client_gallery_invites to authenticated;
drop policy if exists client_galleries_admin_read on public.client_galleries;
create policy client_galleries_admin_read on public.client_galleries for select to authenticated using ((select private.is_site_admin()));
drop policy if exists client_photos_admin_read on public.client_gallery_photos;
create policy client_photos_admin_read on public.client_gallery_photos for select to authenticated using ((select private.is_site_admin()));
drop policy if exists client_invites_admin_read on public.client_gallery_invites;
create policy client_invites_admin_read on public.client_gallery_invites for select to authenticated using ((select private.is_site_admin()));
drop policy if exists client_selections_admin_read on public.client_gallery_selections;
create policy client_selections_admin_read on public.client_gallery_selections for select to authenticated using ((select private.is_site_admin()));

-- Dedicated private bucket. Never add a public URL or client upload policy for it.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('client-galleries', 'client-galleries', false, 52428800, array['image/jpeg','image/png','image/webp','image/avif'])
  on conflict (id) do update set public = false;
-- A restrictive policy also blocks any older permissive policy on storage.objects.
-- The Supabase dashboard's service operation and server signing bypass RLS.
drop policy if exists client_gallery_server_only on storage.objects;
create policy client_gallery_server_only on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'client-galleries') with check (bucket_id <> 'client-galleries');

create or replace function private.client_invite(p_token_hash text)
returns public.client_gallery_invites
language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '42501', message = 'invalid_invitation';
  end if;
  select i.* into invite_row from public.client_gallery_invites i
    join public.client_galleries g on g.id = i.gallery_id
    where i.token_hash = p_token_hash and i.revoked_at is null and i.expires_at > clock_timestamp()
      and g.status in ('proofing', 'delivered');
  if not found then raise exception using errcode = '42501', message = 'invalid_invitation'; end if;
  return invite_row;
end;
$$;
revoke all on function private.client_invite(text) from public, anon, authenticated, service_role;

create or replace function public.client_read_gallery(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites; result jsonb;
begin
  invite_row := private.client_invite(p_token_hash);
  select jsonb_build_object(
    'gallery', to_jsonb(g), 'expiresAt', invite_row.expires_at,
    'photos', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
      from public.client_gallery_photos p where p.gallery_id = g.id and p.approved), '[]'::jsonb),
    'selection', (select to_jsonb(s) from public.client_gallery_selections s where s.invite_id = invite_row.id)
  ) into result from public.client_galleries g where g.id = invite_row.gallery_id;
  return result;
end;
$$;
revoke all on function public.client_read_gallery(text) from public, anon, authenticated, service_role;
grant execute on function public.client_read_gallery(text) to service_role;

create or replace function public.client_confirm_selection(p_token_hash text, p_photo_ids uuid[], p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites; gallery_row public.client_galleries; result public.client_gallery_selections;
begin
  invite_row := private.client_invite(p_token_hash);
  -- All mutations lock gallery then invite. Recheck expiry/revocation after locks.
  select * into gallery_row from public.client_galleries where id = invite_row.gallery_id for update;
  perform 1 from public.client_gallery_invites where id = invite_row.id for update;
  invite_row := private.client_invite(p_token_hash);
  if gallery_row.status <> 'proofing' then raise exception using errcode = '42501', message = 'selection_closed'; end if;
  if exists(select 1 from public.client_gallery_selections where invite_id = invite_row.id) then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if p_photo_ids is null or cardinality(p_photo_ids) < 1 or cardinality(p_photo_ids) > gallery_row.selection_limit
    or array_ndims(p_photo_ids) <> 1 or array_position(p_photo_ids, null) is not null
    or cardinality(p_photo_ids) <> (select count(distinct id) from unnest(p_photo_ids) id)
    or p_note is null or char_length(p_note) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_selection';
  end if;
  if (select count(*) from public.client_gallery_photos
      where gallery_id = gallery_row.id and approved and id = any(p_photo_ids)) <> cardinality(p_photo_ids) then
    raise exception using errcode = '22023', message = 'invalid_photo';
  end if;
  insert into public.client_gallery_selections(invite_id, gallery_id, photo_ids, note)
    values (invite_row.id, gallery_row.id, p_photo_ids, p_note) returning * into result;
  insert into public.client_gallery_events(gallery_id, action) values(gallery_row.id, 'selection.confirmed');
  return to_jsonb(result);
end;
$$;
revoke all on function public.client_confirm_selection(text, uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.client_confirm_selection(text, uuid[], text) to service_role;

create or replace function public.client_download_photo(p_token_hash text, p_photo_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites; path_value text;
begin
  invite_row := private.client_invite(p_token_hash);
  select p.delivery_path into path_value from public.client_gallery_photos p
    join public.client_galleries g on g.id = p.gallery_id
    where p.id = p_photo_id and p.gallery_id = invite_row.gallery_id and p.approved
      and g.status = 'delivered' and g.allow_downloads and p.delivery_path is not null;
  if not found then raise exception using errcode = '42501', message = 'download_unavailable'; end if;
  return jsonb_build_object('path', path_value, 'expiresAt', invite_row.expires_at,
    'filename', p_photo_id::text || '.' || split_part(path_value, '.', 2));
end;
$$;
revoke all on function public.client_download_photo(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.client_download_photo(text, uuid) to service_role;

create or replace function public.admin_manage_client_gallery(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare gallery_row public.client_galleries; photo_row public.client_gallery_photos;
  invite_row public.client_gallery_invites; result jsonb; target_id uuid;
begin
  if not private.is_site_admin() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  if p_action = 'create' then
    if coalesce(btrim(p_input->>'title'), '') = '' or (p_input->>'selection_limit') is null then
      raise exception using errcode = '22023', message = 'invalid_input';
    end if;
    insert into public.client_galleries(title, selection_limit)
      values(p_input->>'title', (p_input->>'selection_limit')::integer) returning * into gallery_row;
    target_id := gallery_row.id;
    result := to_jsonb(gallery_row);
  else
    target_id := (p_input->>'id')::uuid;
    select * into gallery_row from public.client_galleries where id = target_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
    if p_action = 'update' then
      if p_input ? 'selection_limit' and (p_input->>'selection_limit')::integer <
          coalesce((select max(cardinality(photo_ids)) from public.client_gallery_selections where gallery_id = target_id), 0) then
        raise exception using errcode = '22023', message = 'selection_limit_too_small';
      end if;
      update public.client_galleries set
        title = coalesce(p_input->>'title', title), status = coalesce(p_input->>'status', status),
        selection_limit = coalesce((p_input->>'selection_limit')::integer, selection_limit),
        allow_downloads = coalesce((p_input->>'allow_downloads')::boolean, allow_downloads), updated_at = now()
        where id = target_id returning to_jsonb(client_galleries.*) into result;
    elsif p_action in ('addPhoto', 'updatePhoto') then
      if p_action = 'addPhoto' then
        if (select count(*) from public.client_gallery_photos where gallery_id = target_id) >= 500 then
          raise exception using errcode = '22023', message = 'photo_limit';
        end if;
        insert into public.client_gallery_photos(id, gallery_id, title, preview_path, delivery_path, approved)
          values(coalesce((p_input->>'photo_id')::uuid, gen_random_uuid()), target_id, p_input->>'title',
            p_input->>'preview_path', p_input->>'delivery_path', coalesce((p_input->>'approved')::boolean, true))
          returning * into photo_row;
      else
        update public.client_gallery_photos set
          title = coalesce(p_input->>'title', title), preview_path = coalesce(p_input->>'preview_path', preview_path),
          delivery_path = case when p_input ? 'delivery_path' then p_input->>'delivery_path' else delivery_path end,
          approved = coalesce((p_input->>'approved')::boolean, approved)
          where id = (p_input->>'photo_id')::uuid and gallery_id = target_id returning * into photo_row;
        if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
      end if;
      -- A typo must not publish a broken image; owners upload private files first.
      if not exists(select 1 from storage.objects where bucket_id = 'client-galleries' and name = photo_row.preview_path)
        or (photo_row.delivery_path is not null and not exists(select 1 from storage.objects where bucket_id = 'client-galleries' and name = photo_row.delivery_path)) then
        raise exception using errcode = '22023', message = 'storage_object_missing';
      end if;
      result := to_jsonb(photo_row);
    elsif p_action = 'issueInvite' then
      if (p_input->>'expires_at')::timestamptz <= now() or (p_input->>'expires_at')::timestamptz > now() + interval '91 days' then
        raise exception using errcode = '22023', message = 'invalid_expiry';
      end if;
      if (select count(*) from public.client_gallery_invites where gallery_id = target_id) >= 100 then
        raise exception using errcode = '22023', message = 'invitation_limit';
      end if;
      insert into public.client_gallery_invites(gallery_id, token_hash, expires_at)
        values(target_id, p_input->>'token_hash', (p_input->>'expires_at')::timestamptz) returning * into invite_row;
      result := to_jsonb(invite_row) - 'token_hash';
    elsif p_action = 'revokeInvite' then
      update public.client_gallery_invites set revoked_at = coalesce(revoked_at, now())
        where id = (p_input->>'invite_id')::uuid and gallery_id = target_id returning * into invite_row;
      if not found then raise exception using errcode = 'P0002', message = 'not_found'; end if;
      result := to_jsonb(invite_row) - 'token_hash';
    else raise exception using errcode = '22023', message = 'invalid_action';
    end if;
  end if;
  insert into public.client_gallery_events(actor_id, gallery_id, action) values(auth.uid(), target_id, 'admin.' || p_action);
  return result;
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation or unique_violation then
    raise exception using errcode = '22023', message = 'invalid_input';
end;
$$;
revoke all on function public.admin_manage_client_gallery(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_manage_client_gallery(text, jsonb) to authenticated;

comment on table public.client_gallery_invites is 'Bearer invitation access: SHA-256 only; possession grants access, not identity verification. Never publish or log the raw token.';
comment on table public.client_gallery_selections is 'Final immutable selection per invite; server RPC checks gallery membership and count atomically.';
notify pgrst, 'reload schema';
commit;
