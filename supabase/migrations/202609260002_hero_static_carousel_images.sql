-- Preserve the current site images as editable carousel items in the admin.
create or replace function private.valid_hero_image_paths(paths text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    paths is not null
    and cardinality(paths) <= 10
    and (select count(*) = count(distinct path) from unnest(paths) as image_paths(path))
    and not exists (
      select 1 from unnest(paths) as image_paths(path)
      where path is null
        or not (
          path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
          or path = any(array[
            'static:/assets/hero.webp',
            'static:/assets/hero-02.webp',
            'static:/assets/hero-03.webp',
            'static:/assets/hero-04.webp',
            'static:/assets/portfolio/6-20海邊jk_/IMG_9630.webp',
            'static:/assets/portfolio/照片分享/IMG_6114.webp',
            'static:/assets/portfolio/地雷系/LINE_ALBUM_202681_260921_7.webp',
            'static:/assets/portfolio/興華天橋/13.webp',
            'static:/assets/portfolio/maid/01.webp'
          ]::text[])
        )
    ), false
  );
$$;
revoke all on function private.valid_hero_image_paths(text[]) from public, anon, authenticated, service_role;

alter table public.site_content drop constraint if exists site_content_hero_image_paths_valid;
alter table public.site_content add constraint site_content_hero_image_paths_valid
  check (private.valid_hero_image_paths(hero_image_paths));

create or replace function public.admin_update_content(
  p_announcement text,
  p_announcement_enabled boolean,
  p_faqs jsonb,
  p_hero_title text,
  p_hero_copy text,
  p_hero_image_paths text[],
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
    or not private.valid_hero_image_paths(p_hero_image_paths) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  update public.site_content
    set announcement = p_announcement,
        announcement_enabled = p_announcement_enabled,
        faqs = p_faqs,
        hero_title = p_hero_title,
        hero_copy = p_hero_copy,
        hero_image_paths = p_hero_image_paths,
        hero_image_path = case
          when p_hero_image_paths[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
            then p_hero_image_paths[1]
          else null
        end
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
revoke all on function public.admin_update_content(text, boolean, jsonb, text, text, text[], integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_update_content(text, boolean, jsonb, text, text, text[], integer) to authenticated;
