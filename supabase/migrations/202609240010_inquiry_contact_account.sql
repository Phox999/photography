-- Repair databases that had a legacy collaboration_requests table before the
-- admin workflow migration. Preserve its existing Instagram/email contact data.
begin;

alter table public.collaboration_requests
  add column if not exists contact_account text not null default '';

do $$
declare
  has_instagram boolean;
  has_email boolean;
  account_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collaboration_requests'
      and column_name = 'instagram'
  ) into has_instagram;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collaboration_requests'
      and column_name = 'email'
  ) into has_email;

  if has_instagram and has_email then
    account_expr := $expr$
      case when lower(btrim(contact_method)) in ('email', 'e-mail')
        then coalesce(nullif(btrim(email), ''), nullif(btrim(instagram), ''), '')
        else coalesce(nullif(btrim(instagram), ''), nullif(btrim(email), ''), '')
      end
    $expr$;
  elsif has_instagram then
    account_expr := 'coalesce(nullif(btrim(instagram), ''''), '''')';
  elsif has_email then
    account_expr := 'coalesce(nullif(btrim(email), ''''), '''')';
  end if;

  if account_expr is not null then
    execute format($update$
      update public.collaboration_requests
      set contact_account = %1$s
      where nullif(btrim(contact_account), '') is null
        and nullif(btrim((%1$s)), '') is not null
    $update$, account_expr);
  end if;
end;
$$;

comment on column public.collaboration_requests.contact_account is
  'Contact handle or link supplied with the cooperation inquiry.';

commit;
