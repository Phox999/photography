-- Allow a user to look up their own cooperation progress with the high-entropy
-- PHOX receipt reference shown after submission. The reference stays out of URLs.
begin;

create or replace function public.get_cooperation_progress_by_reference(p_reference text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_reference is null or p_reference !~ '^PHOX-[A-F0-9]{20}$' then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  select jsonb_build_object(
    'reference', r.reference,
    'createdAt', r.created_at,
    'status', i.status,
    'summary', jsonb_build_object(
      'name', i.name,
      'collaborationType', i.collaboration_type,
      'preferredDate', i.preferred_date,
      'description', i.description,
      'referenceLinks', i.reference_links
    ),
    'confirmation', private.get_published_shoot_confirmation(i.id)
  )
  into result
  from private.inquiry_receipts r
  join public.collaboration_requests i on i.id = r.inquiry_id
  where r.reference = p_reference
    and r.revoked_at is null;

  return result;
end;
$$;

revoke all on function public.get_cooperation_progress_by_reference(text) from public, anon, authenticated, service_role;
grant execute on function public.get_cooperation_progress_by_reference(text) to service_role;

comment on function public.get_cooperation_progress_by_reference(text)
  is 'Service-only lookup for cooperation progress using the high-entropy PHOX receipt reference.';

notify pgrst, 'reload schema';
commit;
