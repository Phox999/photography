begin;
create table public.client_gallery_uploads (
  id uuid primary key,
  gallery_id uuid not null references public.client_galleries(id) on delete cascade,
  photo_id uuid not null references public.client_gallery_photos(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.client_gallery_uploads enable row level security;
revoke all on public.client_gallery_uploads from public, anon, authenticated, service_role;

create or replace function public.admin_attach_gallery_upload(
  p_upload_id uuid, p_gallery_id uuid, p_kind text, p_photo_id uuid,
  p_title text, p_path text, p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare prior public.client_gallery_uploads; photo public.client_gallery_photos;
begin
  if not private.is_site_admin() then raise exception using errcode='42501', message='forbidden'; end if;
  if p_upload_id is null or p_gallery_id is null or p_kind is null or p_kind not in ('preview','delivery')
    or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_title is null or length(btrim(p_title)) not between 1 and 160
    or p_path is null or p_path !~ ('^' || p_gallery_id::text || '/' || p_upload_id::text || '-[0-9a-f]{64}\.(jpg|png|webp)$')
    or (p_kind='delivery' and p_photo_id is null) or (p_kind='preview' and p_photo_id is not null)
    then raise exception using errcode='22023', message='invalid_input'; end if;
  perform 1 from public.client_galleries where id=p_gallery_id for update;
  if not found then raise exception using errcode='P0002', message='not_found'; end if;
  select * into prior from public.client_gallery_uploads where id=p_upload_id;
  if found then
    if prior.gallery_id<>p_gallery_id or prior.fingerprint<>p_fingerprint then
      raise exception using errcode='P0001', message='conflict'; end if;
    select * into photo from public.client_gallery_photos where id=prior.photo_id;
    return to_jsonb(photo);
  end if;
  if not exists(select 1 from storage.objects where bucket_id='client-galleries' and name=p_path) then
    raise exception using errcode='22023', message='storage_object_missing'; end if;
  if p_kind='preview' then
    if (select count(*) from public.client_gallery_photos where gallery_id=p_gallery_id)>=500 then
      raise exception using errcode='22023', message='photo_limit'; end if;
    insert into public.client_gallery_photos(id,gallery_id,title,preview_path,approved)
      values(p_upload_id,p_gallery_id,p_title,p_path,false) returning * into photo;
  else
    update public.client_gallery_photos set delivery_path=p_path
      where id=p_photo_id and gallery_id=p_gallery_id returning * into photo;
    if not found then raise exception using errcode='P0002', message='not_found'; end if;
  end if;
  insert into public.client_gallery_uploads(id,gallery_id,photo_id,fingerprint)
    values(p_upload_id,p_gallery_id,photo.id,p_fingerprint);
  insert into public.client_gallery_events(actor_id,gallery_id,action)
    values(auth.uid(),p_gallery_id,'admin.upload.'||p_kind);
  return to_jsonb(photo);
exception when unique_violation then raise exception using errcode='P0001', message='conflict';
end;
$$;
revoke all on function public.admin_attach_gallery_upload(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_attach_gallery_upload(uuid,uuid,text,uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
