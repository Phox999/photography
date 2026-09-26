-- Apply after 002. All client mutations acquire gallery -> invite -> draft locks.
begin;
alter table public.client_gallery_selections add column if not exists photo_notes jsonb not null default '{}'::jsonb;
create table if not exists public.client_gallery_drafts (
  invite_id uuid primary key,
  gallery_id uuid not null references public.client_galleries(id) on delete cascade,
  photo_ids uuid[] not null default '{}'::uuid[] check (cardinality(photo_ids) <= 200 and array_position(photo_ids, null) is null),
  photo_notes jsonb not null default '{}'::jsonb check (jsonb_typeof(photo_notes) = 'object'),
  note text not null default '' check (char_length(note) <= 2000),
  version bigint not null check (version between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  foreign key (invite_id, gallery_id) references public.client_gallery_invites(id, gallery_id) on delete cascade
);
alter table public.client_gallery_drafts enable row level security;
revoke all on public.client_gallery_drafts from public, anon, authenticated, service_role;

create or replace function private.validate_gallery_selection(p_gallery_id uuid, p_limit integer, p_photo_ids uuid[], p_photo_notes jsonb, p_note text, p_allow_empty boolean)
returns void language plpgsql set search_path = '' as $$
begin
  if p_photo_ids is null or cardinality(p_photo_ids) < (case when p_allow_empty then 0 else 1 end)
    or cardinality(p_photo_ids) > p_limit or coalesce(array_ndims(p_photo_ids), 1) <> 1
    or array_position(p_photo_ids, null) is not null
    or cardinality(p_photo_ids) <> (select count(distinct id) from unnest(p_photo_ids) id)
    or p_note is null or char_length(p_note) > 2000
    or p_photo_notes is null or jsonb_typeof(p_photo_notes) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_selection';
  end if;
  if (select count(*) from public.client_gallery_photos where gallery_id = p_gallery_id and approved and id = any(p_photo_ids)) <> cardinality(p_photo_ids) then
    raise exception using errcode = '22023', message = 'invalid_photo';
  end if;
  if exists(select 1 from jsonb_each(p_photo_notes) n where not (n.key = any(p_photo_ids::text[])) or jsonb_typeof(n.value) <> 'string' or char_length(n.value #>> '{}') > 500) then
    raise exception using errcode = '22023', message = 'invalid_photo_note';
  end if;
end;
$$;
revoke all on function private.validate_gallery_selection(uuid, integer, uuid[], jsonb, text, boolean) from public, anon, authenticated, service_role;

create or replace function public.client_save_draft(p_token_hash text, p_photo_ids uuid[], p_photo_notes jsonb, p_note text, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites; gallery_row public.client_galleries; draft_row public.client_gallery_drafts; current_version bigint;
begin
  invite_row := private.client_invite(p_token_hash);
  select * into gallery_row from public.client_galleries where id = invite_row.gallery_id for update;
  perform 1 from public.client_gallery_invites where id = invite_row.id for update;
  invite_row := private.client_invite(p_token_hash);
  if gallery_row.status <> 'proofing' then raise exception using errcode = '42501', message = 'selection_closed'; end if;
  if exists(select 1 from public.client_gallery_selections where invite_id = invite_row.id) then raise exception using errcode = 'P0001', message = 'conflict'; end if;
  perform private.validate_gallery_selection(gallery_row.id, gallery_row.selection_limit, p_photo_ids, p_photo_notes, p_note, true);
  if p_expected_version is null or p_expected_version < 0 or p_expected_version >= 9007199254740991 then raise exception using errcode = '22023', message = 'invalid_version'; end if;
  select * into draft_row from public.client_gallery_drafts where invite_id = invite_row.id for update;
  current_version := coalesce(draft_row.version, 0);
  -- A lost response can retry the exact same request once or manually without bumping the version.
  if p_expected_version = current_version - 1 and draft_row.photo_ids = p_photo_ids and draft_row.photo_notes = p_photo_notes and draft_row.note = p_note then return to_jsonb(draft_row); end if;
  if p_expected_version <> current_version then return jsonb_build_object('conflict', true, 'draft', case when current_version = 0 then null else to_jsonb(draft_row) end); end if;
  insert into public.client_gallery_drafts(invite_id, gallery_id, photo_ids, photo_notes, note, version)
    values(invite_row.id, gallery_row.id, p_photo_ids, p_photo_notes, p_note, current_version + 1)
    on conflict (invite_id) do update set photo_ids = excluded.photo_ids, photo_notes = excluded.photo_notes, note = excluded.note, version = excluded.version, updated_at = clock_timestamp()
    returning * into draft_row;
  return to_jsonb(draft_row);
end;
$$;
revoke all on function public.client_save_draft(text, uuid[], jsonb, text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.client_save_draft(text, uuid[], jsonb, text, bigint) to service_role;

-- Remove the legacy overload: it must not bypass draft-version checks via REST.
drop function if exists public.client_confirm_selection(text, uuid[], text);
create or replace function public.client_confirm_selection(p_token_hash text, p_photo_ids uuid[], p_note text, p_photo_notes jsonb, p_draft_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites; gallery_row public.client_galleries; draft_row public.client_gallery_drafts; result public.client_gallery_selections;
begin
  invite_row := private.client_invite(p_token_hash);
  select * into gallery_row from public.client_galleries where id = invite_row.gallery_id for update;
  perform 1 from public.client_gallery_invites where id = invite_row.id for update;
  invite_row := private.client_invite(p_token_hash);
  if gallery_row.status <> 'proofing' then raise exception using errcode = '42501', message = 'selection_closed'; end if;
  if exists(select 1 from public.client_gallery_selections where invite_id = invite_row.id) then raise exception using errcode = 'P0001', message = 'conflict'; end if;
  perform private.validate_gallery_selection(gallery_row.id, gallery_row.selection_limit, p_photo_ids, p_photo_notes, p_note, false);
  if p_draft_version is null or p_draft_version < 0 or p_draft_version > 9007199254740991 then raise exception using errcode = '22023', message = 'invalid_version'; end if;
  select * into draft_row from public.client_gallery_drafts where invite_id = invite_row.id for update;
  if p_draft_version <> coalesce(draft_row.version, 0) then return jsonb_build_object('conflict', true, 'draft', case when draft_row.invite_id is null then null else to_jsonb(draft_row) end); end if;
  insert into public.client_gallery_selections(invite_id, gallery_id, photo_ids, photo_notes, note)
    values(invite_row.id, gallery_row.id, p_photo_ids, p_photo_notes, p_note) returning * into result;
  delete from public.client_gallery_drafts where invite_id = invite_row.id;
  insert into public.client_gallery_events(gallery_id, action) values(gallery_row.id, 'selection.confirmed');
  return to_jsonb(result);
end;
$$;
revoke all on function public.client_confirm_selection(text, uuid[], text, jsonb, bigint) from public, anon, authenticated, service_role;
grant execute on function public.client_confirm_selection(text, uuid[], text, jsonb, bigint) to service_role;

create or replace function public.client_read_gallery(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites; result jsonb;
begin
  invite_row := private.client_invite(p_token_hash);
  -- Shared gallery lock serializes with publication, draft and confirmation updates.
  perform 1 from public.client_galleries where id = invite_row.gallery_id for share;
  perform 1 from public.client_gallery_invites where id = invite_row.id for share;
  invite_row := private.client_invite(p_token_hash);
  select jsonb_build_object('gallery', to_jsonb(g), 'expiresAt', invite_row.expires_at,
    'photos', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at, p.id) from public.client_gallery_photos p where p.gallery_id = g.id and p.approved), '[]'::jsonb),
    'selection', (select to_jsonb(s) from public.client_gallery_selections s where s.invite_id = invite_row.id),
    'draft', (select to_jsonb(d) from public.client_gallery_drafts d where d.invite_id = invite_row.id)
  ) into result from public.client_galleries g where g.id = invite_row.gallery_id;
  return result;
end;
$$;
revoke all on function public.client_read_gallery(text) from public, anon, authenticated, service_role;
grant execute on function public.client_read_gallery(text) to service_role;

create or replace function public.client_download_archive(p_token_hash text, p_photo_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite_row public.client_gallery_invites; gallery_row public.client_galleries; photos jsonb;
begin
  invite_row := private.client_invite(p_token_hash);
  select * into gallery_row from public.client_galleries where id = invite_row.gallery_id for share;
  perform 1 from public.client_gallery_invites where id = invite_row.id for share;
  invite_row := private.client_invite(p_token_hash);
  if gallery_row.status <> 'delivered' or not gallery_row.allow_downloads then raise exception using errcode = '42501', message = 'download_unavailable'; end if;
  if p_photo_ids is null or cardinality(p_photo_ids) not between 1 and 20 or array_ndims(p_photo_ids) <> 1 or array_position(p_photo_ids, null) is not null or cardinality(p_photo_ids) <> (select count(distinct id) from unnest(p_photo_ids) id) then raise exception using errcode = '22023', message = 'invalid_selection'; end if;
  select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.delivery_path, 'filename', p.id::text || '.' || split_part(p.delivery_path, '.', 2)) order by p.id)
    into photos from public.client_gallery_photos p where p.gallery_id = gallery_row.id and p.approved and p.delivery_path is not null and p.id = any(p_photo_ids);
  if coalesce(jsonb_array_length(photos), 0) <> cardinality(p_photo_ids) then raise exception using errcode = '42501', message = 'download_unavailable'; end if;
  return jsonb_build_object('galleryId', gallery_row.id, 'expiresAt', invite_row.expires_at, 'photos', photos);
end;
$$;
revoke all on function public.client_download_archive(text, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.client_download_archive(text, uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;
