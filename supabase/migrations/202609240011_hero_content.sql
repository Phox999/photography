-- Editable homepage hero content. Hero uploads are public site imagery, while
-- all writes go through the authenticated server endpoint using the secret key.
alter table public.site_content
  add column if not exists hero_title text not null default E'第一次互惠拍攝，\n也能安心開始。',
  add column if not exists hero_copy text not null default E'不論你是第一次拍照，還是想累積作品，\n拍攝前都會充分溝通需求與風格，尊重彼此的想法，一起完成自然、有故事的作品。',
  add column if not exists hero_image_path text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'site_content_hero_title_length') then
    alter table public.site_content add constraint site_content_hero_title_length
      check (char_length(btrim(hero_title)) between 1 and 120 and hero_title !~ '[<>]'
        and regexp_replace(hero_title, E'[\\n\\r\\t]', '', 'g') !~ '[[:cntrl:]]');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_content_hero_copy_length') then
    alter table public.site_content add constraint site_content_hero_copy_length
      check (char_length(btrim(hero_copy)) between 1 and 1000 and hero_copy !~ '[<>]'
        and regexp_replace(hero_copy, E'[\\n\\r\\t]', '', 'g') !~ '[[:cntrl:]]');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_content_hero_image_path_format') then
    alter table public.site_content add constraint site_content_hero_image_path_format
      check (hero_image_path is null or hero_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$');
  end if;
end $$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('site-hero', 'site-hero', true, 8388608, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists site_hero_server_only on storage.objects;
create policy site_hero_server_only on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'site-hero') with check (bucket_id <> 'site-hero');

drop function if exists public.admin_update_content(text, boolean, jsonb, integer);
create function public.admin_update_content(
  p_announcement text,
  p_announcement_enabled boolean,
  p_faqs jsonb,
  p_hero_title text,
  p_hero_copy text,
  p_hero_image_path text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result_row public.site_content;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_version is null or p_version < 1
    or p_announcement is null or char_length(p_announcement) > 500
    or p_announcement_enabled is null or not private.valid_site_faqs(p_faqs)
    or (p_announcement_enabled and char_length(btrim(p_announcement)) = 0)
    or p_hero_title is null or char_length(btrim(p_hero_title)) not between 1 and 120 or p_hero_title ~ '[<>]'
    or regexp_replace(p_hero_title, E'[\\n\\r\\t]', '', 'g') ~ '[[:cntrl:]]'
    or p_hero_copy is null or char_length(btrim(p_hero_copy)) not between 1 and 1000 or p_hero_copy ~ '[<>]'
    or regexp_replace(p_hero_copy, E'[\\n\\r\\t]', '', 'g') ~ '[[:cntrl:]]'
    or (p_hero_image_path is not null and p_hero_image_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$') then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  update public.site_content
    set announcement = p_announcement,
        announcement_enabled = p_announcement_enabled,
        faqs = p_faqs,
        hero_title = p_hero_title,
        hero_copy = p_hero_copy,
        hero_image_path = p_hero_image_path
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
revoke all on function public.admin_update_content(text, boolean, jsonb, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_content(text, boolean, jsonb, text, text, text, integer) to authenticated;

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
    'hero_title', hero_title,
    'hero_copy', hero_copy,
    'hero_image_path', hero_image_path,
    'version', version
  ) from public.site_content where id = 1;
$$;
revoke all on function public.get_public_site_content() from public, anon, authenticated, service_role;
grant execute on function public.get_public_site_content() to anon, authenticated;
