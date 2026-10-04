begin;
-- Credentials, notification destinations and customer preparation stay private.
create table if not exists private.cooperation_centers (
 inquiry_id uuid primary key references public.collaboration_requests(id) on delete cascade,
 version integer not null default 0 check(version >= 0), checklist jsonb not null default '{}',
 cancelled_at timestamptz, hold_started_at timestamptz, change_request text, change_requested_at timestamptz,
 gallery_id uuid references public.client_galleries(id) on delete set null,
 email text, email_verified boolean not null default false,
 email_verify_hash text, email_verify_expires timestamptz, email_attempts integer not null default 0,
 email_requested_at timestamptz,
 line_user_id text, line_link_hash text, line_link_expires timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists private.cooperation_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 inquiry_id uuid not null references public.collaboration_requests(id) on delete cascade,
 expires_at timestamptz not null
);
create table if not exists private.cooperation_holds (
 slot_id uuid primary key references public.shoot_availability(id) on delete cascade,
 inquiry_id uuid not null unique references public.collaboration_requests(id) on delete cascade,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table if not exists private.cooperation_gallery_invites (
 inquiry_id uuid primary key references public.collaboration_requests(id) on delete cascade,
 invite_id uuid not null unique references public.client_gallery_invites(id) on delete cascade
);
create table if not exists private.cooperation_gallery_sessions (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 invite_id uuid not null references public.client_gallery_invites(id) on delete cascade,
 expires_at timestamptz not null
);
create table if not exists private.notification_outbox (
 id uuid primary key default gen_random_uuid(), inquiry_id uuid not null references public.collaboration_requests(id) on delete cascade,
 channel text not null check(channel in ('email','line')), destination text not null,
 kind text not null, body text not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, created_at timestamptz not null default now(), sent_at timestamptz,
 last_error text
);
create index if not exists notification_pending on private.notification_outbox(available_at) where state in ('pending','sending');
do $$ declare t text; begin
 foreach t in array array['cooperation_centers','cooperation_sessions','cooperation_holds','cooperation_gallery_invites','cooperation_gallery_sessions','notification_outbox'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create or replace function private.cooperation_identity(p_token_hash text) returns uuid
language sql stable security definer set search_path='' as $$
 select r.inquiry_id from private.inquiry_receipts r where r.revoked_at is null and
 (r.token_hash=p_token_hash or exists(select 1 from private.cooperation_sessions s
 where s.inquiry_id=r.inquiry_id and s.token_hash=p_token_hash and s.expires_at>now())) limit 1;
$$;

create or replace function private.enqueue_cooperation_notice(p_id uuid,p_kind text,p_text text) returns void
language plpgsql security definer set search_path='' as $$
declare c private.cooperation_centers; ref text; msg text;
begin
 select * into c from private.cooperation_centers where inquiry_id=p_id;
 select reference into ref from private.inquiry_receipts where inquiry_id=p_id and revoked_at is null;
 if ref is null then return; end if;
 msg:=p_text||E'\n收件編號：'||ref||E'\n請開啟你保存的私人預約中心，查看最新內容。';
 if c.email_verified then insert into private.notification_outbox(inquiry_id,channel,destination,kind,body) values(p_id,'email',c.email,p_kind,msg); end if;
 if c.line_user_id is not null then insert into private.notification_outbox(inquiry_id,channel,destination,kind,body) values(p_id,'line',c.line_user_id,p_kind,msg); end if;
end $$;

create or replace function private.cooperation_center_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.get_cooperation_progress_by_reference(r.reference) || jsonb_build_object(
 'center',jsonb_build_object('version',coalesce(c.version,0),'cancelledAt',c.cancelled_at,
 'changeRequest',c.change_request,'changeRequestedAt',c.change_requested_at,
 'checklist',coalesce(c.checklist,'{}'::jsonb),
 'hold',(select jsonb_build_object('slotId',h.slot_id,'startsAt',a.starts_at,'endsAt',a.ends_at,'expiresAt',h.expires_at)
 from private.cooperation_holds h join public.shoot_availability a on a.id=h.slot_id
 where h.inquiry_id=p_id and h.expires_at>now() and exists(select 1 from private.inquiry_receipts hr where hr.inquiry_id=h.inquiry_id and hr.revoked_at is null) and a.status='open'),
 'gallery',(select jsonb_build_object('title',g.title,'status',g.status,
 'selectedCount',(select coalesce(cardinality(s.photo_ids),0) from public.client_gallery_selections s
 join private.cooperation_gallery_invites v on v.invite_id=s.invite_id where v.inquiry_id=p_id))
 from public.client_galleries g where g.id=c.gallery_id and g.status in ('proofing','delivered') and c.cancelled_at is null),
 'notifications',jsonb_build_object('email',coalesce(c.email_verified,false),'emailPending',c.email is not null and not c.email_verified and c.email_verify_expires>now() and c.email_attempts<5,
 'line',c.line_user_id is not null)),
 'favorites',i.portfolio_favorites)
 from private.inquiry_receipts r join public.collaboration_requests i on i.id=r.inquiry_id
 left join private.cooperation_centers c on c.inquiry_id=i.id where i.id=p_id and r.revoked_at is null;
$$;

create or replace function public.open_cooperation_center(p_reference text,p_token_hash text,p_session_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_inquiry_id uuid;
begin
 if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='invalid_input'; end if;
 if p_reference is not null then
 if p_reference !~ '^PHOX-[A-F0-9]{20}$' then raise exception using errcode='22023',message='invalid_input'; end if;
 select inquiry_id into v_inquiry_id from private.inquiry_receipts where reference=p_reference and revoked_at is null;
 else v_inquiry_id:=private.cooperation_identity(p_token_hash); end if;
 if v_inquiry_id is null then raise exception using errcode='42501',message='forbidden'; end if;
 insert into private.cooperation_sessions(token_hash,inquiry_id,expires_at) values(p_session_hash,v_inquiry_id,now()+interval '1 hour');
 delete from private.cooperation_sessions where expires_at<now()-interval '1 day';
 delete from private.cooperation_gallery_sessions where expires_at<now()-interval '1 day';
 return private.cooperation_center_json(v_inquiry_id);
end $$;

create or replace function public.mutate_cooperation_center(p_token_hash text,p_action text,p_version integer,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_inquiry_id uuid; c private.cooperation_centers; i public.collaboration_requests;
 slot public.shoot_availability; confirm public.shoot_confirmations; v public.client_gallery_invites; k text;
begin
 v_inquiry_id:=private.cooperation_identity(p_token_hash);
 if v_inquiry_id is null then raise exception using errcode='42501',message='forbidden'; end if;
 select * into i from public.collaboration_requests where collaboration_requests.id=v_inquiry_id for update;
 if p_action='read' then return private.cooperation_center_json(v_inquiry_id); end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception using errcode='22023',message='invalid_input'; end if;
 insert into private.cooperation_centers(inquiry_id) values(v_inquiry_id) on conflict do nothing;
 select * into c from private.cooperation_centers where inquiry_id=v_inquiry_id for update;
 if p_version is null or p_version<>c.version then raise exception using errcode='P0001',message='conflict'; end if;
 select * into confirm from public.shoot_confirmations where inquiry_id=v_inquiry_id;
 if c.cancelled_at is not null and p_action not in ('stopNotifications') then raise exception using errcode='P0001',message='cancelled'; end if;
 if i.status='closed' and p_action in ('hold','change') then raise exception using errcode='P0001',message='closed'; end if;
 if p_action='checklist' then
 if jsonb_typeof(p_input->'checklist') is distinct from 'object' or (p_input-'checklist')<>'{}'::jsonb then raise exception using errcode='22023',message='invalid_input'; end if;
 for k in select jsonb_object_keys(p_input->'checklist') loop
 if k not in ('wardrobe','route','props','weather','rest','publication') or jsonb_typeof(p_input->'checklist'->k)<>'boolean' then raise exception using errcode='22023',message='invalid_input'; end if; end loop;
 update private.cooperation_centers set checklist=p_input->'checklist' where inquiry_id=v_inquiry_id;
 elsif p_action='hold' then
 if confirm.slot_id is not null or (p_input-'slotId')<>'{}'::jsonb then raise exception using errcode='P0001',message='conflict'; end if;
 -- Inquiry then slots in UUID order: same order as admin confirmation/moves.
 perform 1 from public.shoot_availability where shoot_availability.id=(p_input->>'slotId')::uuid or shoot_availability.id in
 (select slot_id from private.cooperation_holds where inquiry_id=v_inquiry_id) order by shoot_availability.id for update;
 select * into slot from public.shoot_availability where shoot_availability.id=(p_input->>'slotId')::uuid;
 if not found or slot.status<>'open' or slot.starts_at<=now() then raise exception using errcode='P0001',message='conflict'; end if;
 if exists(select 1 from private.cooperation_holds h where h.slot_id=slot.id and h.expires_at>now() and exists(select 1 from private.inquiry_receipts hr where hr.inquiry_id=h.inquiry_id and hr.revoked_at is null) and h.inquiry_id<>v_inquiry_id) then raise exception using errcode='P0001',message='conflict'; end if;
 -- Repeated requests do not extend the 24h expiry; one current hold per inquiry.
 if not exists(select 1 from private.cooperation_holds where inquiry_id=v_inquiry_id and slot_id=slot.id and expires_at>now()) then
 if c.hold_started_at>now()-interval '24 hours' then raise exception using errcode='P0001',message='hold_change_wait'; end if;
 delete from private.cooperation_holds where inquiry_id=v_inquiry_id or slot_id=slot.id;
 insert into private.cooperation_holds(slot_id,inquiry_id,expires_at) values(slot.id,v_inquiry_id,least(now()+interval '24 hours',slot.starts_at));
 update private.cooperation_centers set hold_started_at=now() where inquiry_id=v_inquiry_id;
 perform private.enqueue_cooperation_notice(v_inquiry_id,'hold','你選擇的時段已暫留，請在預約中心確認到期時間。'); end if;
 elsif p_action='releaseHold' then
 perform 1 from public.shoot_availability where shoot_availability.id in(select slot_id from private.cooperation_holds where inquiry_id=v_inquiry_id) order by shoot_availability.id for update;
 delete from private.cooperation_holds where inquiry_id=v_inquiry_id;
 elsif p_action='change' then
 if (p_input-array['preferredDate','description'])<>'{}'::jsonb or jsonb_typeof(p_input->'preferredDate')<>'string' or jsonb_typeof(p_input->'description')<>'string'
 or char_length(p_input->>'preferredDate')>200 or char_length(p_input->>'description') not between 1 and 2000 then raise exception using errcode='22023',message='invalid_input'; end if;
 if confirm.slot_id is null then
 update public.collaboration_requests set preferred_date=nullif(btrim(p_input->>'preferredDate'),''),description=btrim(p_input->>'description') where collaboration_requests.id=v_inquiry_id;
 else
 if confirm.starts_at<=now() then raise exception using errcode='P0001',message='shoot_started'; end if;
 update private.cooperation_centers set change_request='希望日期：'||(p_input->>'preferredDate')||E'\n拍攝想法：'||(p_input->>'description'),change_requested_at=now() where inquiry_id=v_inquiry_id;
 end if;
 elsif p_action='cancel' then
 if p_input<>jsonb_build_object('confirm',true) then raise exception using errcode='22023',message='invalid_input'; end if;
 if confirm.starts_at<=now() then raise exception using errcode='P0001',message='shoot_started'; end if;
 perform 1 from public.shoot_availability where inquiry_id=v_inquiry_id order by shoot_availability.id for update;
 update public.shoot_availability set status='open',inquiry_id=null where inquiry_id=v_inquiry_id;
 delete from private.cooperation_holds where inquiry_id=v_inquiry_id;
 delete from public.shoot_confirmations where inquiry_id=v_inquiry_id;
 update private.cooperation_centers set cancelled_at=now(),change_request=null,change_requested_at=null where inquiry_id=v_inquiry_id;
 update public.collaboration_requests set status='closed' where collaboration_requests.id=v_inquiry_id;
 update public.client_gallery_invites set revoked_at=now() where client_gallery_invites.id in(select invite_id from private.cooperation_gallery_invites where inquiry_id=v_inquiry_id);
 perform private.enqueue_cooperation_notice(v_inquiry_id,'cancel','本次預約已取消。');
 elsif p_action='email' then
 if p_input->>'email' is null or char_length(p_input->>'email')>254 or p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or coalesce(p_input->>'hash','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'code','') !~ '^[0-9]{6}$' then raise exception using errcode='22023',message='invalid_input'; end if;
 if c.email_requested_at>now()-interval '5 minutes' then raise exception using errcode='P0001',message='verify_wait'; end if;
 update private.notification_outbox set state='cancelled' where inquiry_id=v_inquiry_id and channel='email' and state in ('pending','sending');
 update private.cooperation_centers set email=p_input->>'email',email_verified=false,email_verify_hash=p_input->>'hash',email_verify_expires=now()+interval '20 minutes',email_attempts=0,email_requested_at=now() where inquiry_id=v_inquiry_id;
 insert into private.notification_outbox(inquiry_id,channel,destination,kind,body) values(v_inquiry_id,'email',p_input->>'email','verify','Phox999 通知驗證碼：'||(p_input->>'code')||E'\n請在原預約中心輸入。20 分鐘內有效。若未申請，請忽略此信。');
 elsif p_action='verifyEmail' then
 if c.email_verify_expires>now() and c.email_attempts<5 and p_input->>'hash'=c.email_verify_hash then
 update private.cooperation_centers set email_verified=true,email_verify_hash=null where inquiry_id=v_inquiry_id;
 perform private.enqueue_cooperation_notice(v_inquiry_id,'subscribed','已啟用預約狀態通知。');
 else update private.cooperation_centers set email_attempts=email_attempts+1 where inquiry_id=v_inquiry_id; end if;
 elsif p_action='lineLink' then
 if coalesce(p_input->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='invalid_input'; end if;
 update private.cooperation_centers set line_link_hash=p_input->>'hash',line_link_expires=now()+interval '20 minutes' where inquiry_id=v_inquiry_id;
 elsif p_action='stopNotifications' then
 update private.cooperation_centers set email=null,email_verified=false,email_verify_hash=null,line_user_id=null,line_link_hash=null where inquiry_id=v_inquiry_id;
 update private.notification_outbox set state='cancelled' where inquiry_id=v_inquiry_id and state in ('pending','sending');
 elsif p_action='gallery' then
 if c.gallery_id is null or not exists(select 1 from public.client_galleries where client_galleries.id=c.gallery_id and status in ('proofing','delivered')) or coalesce(p_input->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception using errcode='42501',message='forbidden'; end if;
 -- A stable invitation preserves the existing draft and final locked selection.
 select gi.* into v from public.client_gallery_invites gi join private.cooperation_gallery_invites cv on cv.invite_id=gi.id where cv.inquiry_id=v_inquiry_id for update of gi;
 if found then update public.client_gallery_invites set expires_at=now()+interval '1 hour',revoked_at=null where client_gallery_invites.id=v.id;
 else insert into public.client_gallery_invites(gallery_id,token_hash,expires_at) values(c.gallery_id,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),now()+interval '1 hour') returning * into v;
 insert into private.cooperation_gallery_invites(inquiry_id,invite_id) values(v_inquiry_id,v.id); end if;
 insert into private.cooperation_gallery_sessions(token_hash,invite_id,expires_at) values(p_input->>'hash',v.id,now()+interval '1 hour');
 else raise exception using errcode='22023',message='invalid_input'; end if;
 update private.cooperation_centers set version=version+1,updated_at=now() where inquiry_id=v_inquiry_id;
 return private.cooperation_center_json(v_inquiry_id);
end $$;

create or replace function private.cooperation_admin_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.cooperation_center_json(p_id)||jsonb_build_object('galleryId',(select gallery_id from private.cooperation_centers where inquiry_id=p_id),
 'notificationCounts',(select jsonb_build_object('pending',count(*) filter(where state in ('pending','sending')),'failed',count(*) filter(where state='failed'),'sent',count(*) filter(where state='sent')) from private.notification_outbox where inquiry_id=p_id));
$$;

create or replace function public.admin_cooperation_center(p_inquiry_id uuid,p_action text,p_version integer,p_gallery_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.cooperation_centers;
begin
 if not private.is_site_admin() then raise exception using errcode='42501',message='forbidden'; end if;
 perform 1 from public.collaboration_requests where id=p_inquiry_id for update;
 if not found then raise exception using errcode='P0002',message='not_found'; end if;
 if p_action='read' then return private.cooperation_admin_json(p_inquiry_id); end if;
 insert into private.cooperation_centers(inquiry_id) values(p_inquiry_id) on conflict do nothing;
 select * into c from private.cooperation_centers where inquiry_id=p_inquiry_id for update;
 if p_version is null or p_version<>c.version then raise exception using errcode='P0001',message='conflict'; end if;
 if c.cancelled_at is not null then raise exception using errcode='P0001',message='cancelled'; end if;
 if p_action='gallery' then
 if p_gallery_id is not distinct from c.gallery_id then return private.cooperation_admin_json(p_inquiry_id); end if;
 if p_gallery_id is not null and not exists(select 1 from public.client_galleries where id=p_gallery_id) then raise exception using errcode='22023',message='invalid_input'; end if;
 update public.client_gallery_invites set revoked_at=now() where id in(select invite_id from private.cooperation_gallery_invites where inquiry_id=p_inquiry_id);
 delete from private.cooperation_gallery_invites where inquiry_id=p_inquiry_id;
 update private.cooperation_centers set gallery_id=p_gallery_id where inquiry_id=p_inquiry_id;
 perform private.enqueue_cooperation_notice(p_inquiry_id,'gallery','你的預約中心相簿安排已更新。');
 elsif p_action='resolveChange' then
 update private.cooperation_centers set change_request=null,change_requested_at=null where inquiry_id=p_inquiry_id;
 perform private.enqueue_cooperation_notice(p_inquiry_id,'change','你的調整請求已處理，請查看確認單或與攝影師確認。');
 else raise exception using errcode='22023',message='invalid_input'; end if;
 update private.cooperation_centers set version=version+1,updated_at=now() where inquiry_id=p_inquiry_id;
 return private.cooperation_admin_json(p_inquiry_id);
end $$;

-- Notify on the committed transitions, never on a failed HTTP request.
create or replace function private.cooperation_transition_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_inquiry_id uuid;
begin
 if tg_table_name='collaboration_requests' then
 if new.status is distinct from old.status then perform private.enqueue_cooperation_notice(new.id,'status','你的合作處理進度已更新。'); end if;
 elsif tg_table_name='shoot_confirmations' then
 if new.status='confirmed' then perform private.enqueue_cooperation_notice(new.inquiry_id,'confirmation','你的拍攝確認單已更新。'); end if;
 elsif tg_table_name='client_galleries' and new.status is distinct from old.status then
 for v_inquiry_id in select inquiry_id from private.cooperation_centers where gallery_id=new.id loop perform private.enqueue_cooperation_notice(v_inquiry_id,'delivery','你的相簿／交件進度已更新。'); end loop;
 end if;
 if tg_table_name='collaboration_requests' then update private.cooperation_centers set version=version+1,updated_at=now() where inquiry_id=new.id;
 elsif tg_table_name='shoot_confirmations' then update private.cooperation_centers set version=version+1,updated_at=now() where inquiry_id=new.inquiry_id; end if;
 return new;
end $$;
drop trigger if exists cooperation_status_notice on public.collaboration_requests;
create trigger cooperation_status_notice after update on public.collaboration_requests for each row execute function private.cooperation_transition_notice();
drop trigger if exists cooperation_confirmation_notice on public.shoot_confirmations;
create trigger cooperation_confirmation_notice after insert or update on public.shoot_confirmations for each row execute function private.cooperation_transition_notice();
drop trigger if exists cooperation_gallery_notice on public.client_galleries;
create trigger cooperation_gallery_notice after update on public.client_galleries for each row execute function private.cooperation_transition_notice();

create or replace function public.bind_cooperation_line(p_link_hash text,p_user_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_inquiry_id uuid;
begin
 if p_link_hash is null or p_link_hash !~ '^[a-f0-9]{64}$' or p_user_id is null or p_user_id !~ '^U[a-f0-9]{32}$' then return false; end if;
 select inquiry_id into v_inquiry_id from private.cooperation_centers where line_link_hash=p_link_hash and line_link_expires>now() and cancelled_at is null;
 if v_inquiry_id is null then return false; end if;
 perform 1 from public.collaboration_requests where collaboration_requests.id=v_inquiry_id for update;
 update private.cooperation_centers set line_user_id=p_user_id,line_link_hash=null,line_link_expires=null,version=version+1,updated_at=now()
 where inquiry_id=v_inquiry_id and line_link_hash=p_link_hash and line_link_expires>now();
 if not found then return false; end if;
 perform private.enqueue_cooperation_notice(v_inquiry_id,'subscribed','已啟用 LINE 預約通知。'); return true;
end $$;

create or replace function private.expire_cooperation_holds() returns void
language plpgsql security definer set search_path='' as $$
declare v_inquiry_id uuid;
begin
 for v_inquiry_id in select i.id from public.collaboration_requests i where exists(select 1 from private.cooperation_holds h where h.inquiry_id=i.id and h.expires_at<=now()) order by i.id for update of i skip locked loop
 perform 1 from public.shoot_availability where id in(select slot_id from private.cooperation_holds where inquiry_id=v_inquiry_id) order by id for update;
 delete from private.cooperation_holds where inquiry_id=v_inquiry_id and expires_at<=now();
 if found then
 update private.cooperation_centers set version=version+1,updated_at=now() where inquiry_id=v_inquiry_id;
 perform private.enqueue_cooperation_notice(v_inquiry_id,'holdExpired','暫留時段已到期並釋放，仍想拍攝時請重新確認檔期。');
 end if;
 end loop;
end $$;

create or replace function public.claim_cooperation_notifications(p_channels text[],p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_lease_id is null then raise exception using errcode='22023',message='invalid_input'; end if;
 perform private.expire_cooperation_holds();
 with jobs as(select id from private.notification_outbox where channel=any(p_channels) and available_at<=now()
 and (state='pending' or state='sending' and lease_until<now()) and attempts<6
 and created_at>now()-interval '23 hours' order by available_at limit 10 for update skip locked),
 claimed as(update private.notification_outbox n set state='sending',attempts=attempts+1,lease_id=p_lease_id,lease_until=now()+interval '5 minutes'
 from jobs where n.id=jobs.id returning n.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'channel',channel,'destination',destination,'kind',kind,'body',body)),'[]') into result from claimed;
 update private.notification_outbox set state='failed',last_error='expired_or_retry_limit' where state in ('pending','sending') and (created_at<=now()-interval '23 hours' or attempts>=6 and lease_until<now());
 delete from private.cooperation_sessions where expires_at<now()-interval '1 day';
 delete from private.cooperation_gallery_sessions where expires_at<now()-interval '1 day';
 delete from private.notification_outbox where created_at<now()-interval '30 days';
 return result;
end $$;
create or replace function public.complete_cooperation_notification(p_id uuid,p_lease_id uuid,p_success boolean,p_error text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.notification_outbox set state=case when p_success then 'sent' when attempts>=6 then 'failed' else 'pending' end,
 sent_at=case when p_success then now() else null end,last_error=left(p_error,80),
 available_at=now()+least(interval '1 hour',interval '1 minute'*power(2,attempts)),lease_until=null
 where id=p_id and lease_id=p_lease_id and state='sending';
end $$;

-- Default privileges must never turn these owner-executed functions into a public API.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,n.nspname as schema_name,p.proname as function_name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('cooperation_identity','enqueue_cooperation_notice','cooperation_center_json','cooperation_transition_notice','cooperation_admin_json','expire_cooperation_holds'))
 or (n.nspname='public' and p.proname in ('open_cooperation_center','mutate_cooperation_center','admin_cooperation_center','bind_cooperation_line','claim_cooperation_notifications','complete_cooperation_notification')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.schema_name='public' and f.function_name='admin_cooperation_center' then execute format('grant execute on function %s to authenticated',f.signature);
 elsif f.schema_name='public' then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end $$;
create or replace function public.admin_update_shoot_confirmation(
  p_inquiry_id uuid,
  p_version integer,
  p_status text,
  p_slot_id uuid,
  p_location text,
  p_map_url text,
  p_wardrobe text,
  p_bring text,
  p_rain_plan text,
  p_delivery_note text,
  p_publication_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_row public.shoot_confirmations;
  result_row public.shoot_confirmations;
  slot_row public.shoot_availability;
  previous_slot public.shoot_availability;
  has_previous boolean;
  reservation_status text;
begin
  if not private.is_site_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_inquiry_id is null or p_version is null or p_version < 0 or p_version > 2147483646
    or p_status is null or p_status not in ('draft', 'confirmed')
    or p_location is null or p_map_url is null or p_wardrobe is null
    or p_bring is null or p_rain_plan is null or p_delivery_note is null
    or p_publication_note is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  p_location := btrim(p_location, E' \t\n\r');
  p_map_url := btrim(p_map_url, E' \t\n\r');
  p_wardrobe := btrim(p_wardrobe, E' \t\n\r');
  p_bring := btrim(p_bring, E' \t\n\r');
  p_rain_plan := btrim(p_rain_plan, E' \t\n\r');
  p_delivery_note := btrim(p_delivery_note, E' \t\n\r');
  p_publication_note := btrim(p_publication_note, E' \t\n\r');
  if char_length(p_location) > 300 or char_length(p_map_url) > 2048
    or char_length(p_wardrobe) > 2000 or char_length(p_bring) > 2000
    or char_length(p_rain_plan) > 2000 or char_length(p_delivery_note) > 2000
    or char_length(p_publication_note) > 2000
    -- Free-form text permits tabs/newlines but no other control characters.
    or regexp_replace(p_location || p_map_url || p_wardrobe || p_bring || p_rain_plan || p_delivery_note || p_publication_note,
      E'[\\t\\n\\r]', '', 'g') ~ '[[:cntrl:]]'
    -- The authority must be present and cannot contain credentials.
    or (p_map_url <> '' and p_map_url !~* '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$')
    or (p_status = 'confirmed' and (p_slot_id is null or p_location = '')) then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;

  -- Serialize first saves as well as edits without changing the inquiry version.
  perform 1 from public.collaboration_requests where id = p_inquiry_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if exists(select 1 from private.cooperation_centers where inquiry_id=p_inquiry_id and cancelled_at is not null) then
    raise exception using errcode='P0001',message='cancelled';
  end if;
  select * into previous_row from public.shoot_confirmations
    where inquiry_id = p_inquiry_id for update;
  has_previous := found;
  if (has_previous and previous_row.version <> p_version)
    or (not has_previous and p_version <> 0) then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;

  -- Lock both sides of a move in UUID order. Competing reservations therefore
  -- cannot double-book, and opposite reschedules do not deadlock on slot rows.
  perform 1 from public.shoot_availability
    where id = p_slot_id or id = previous_row.slot_id or id in (select slot_id from private.cooperation_holds where inquiry_id=p_inquiry_id)
    order by id for update;
  if previous_row.slot_id is not null then
    select * into previous_slot from public.shoot_availability where id = previous_row.slot_id;
    if not found or previous_slot.inquiry_id is distinct from p_inquiry_id
      or previous_slot.status not in ('held', 'booked') then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
  end if;
  if p_slot_id is not null then
    select * into slot_row from public.shoot_availability where id = p_slot_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'not_found';
    end if;
    if not ((slot_row.status in ('open', 'held') and slot_row.inquiry_id is null)
      or (slot_row.status in ('held', 'booked') and slot_row.inquiry_id is not distinct from p_inquiry_id)) then
      raise exception using errcode = 'P0001', message = 'conflict';
    end if;
    if exists(select 1 from private.cooperation_holds h where h.slot_id=p_slot_id and h.expires_at>now() and exists(select 1 from private.inquiry_receipts hr where hr.inquiry_id=h.inquiry_id and hr.revoked_at is null) and h.inquiry_id<>p_inquiry_id) then
      raise exception using errcode='P0001',message='conflict';
    end if;
    -- Existing appointments remain editable after their start time; a new
    -- reservation cannot claim a slot that has already begun.
    if slot_row.starts_at <= clock_timestamp()
      and previous_row.slot_id is distinct from p_slot_id then
      raise exception using errcode = '22023', message = 'slot_in_past';
    end if;
  end if;

  if previous_row.slot_id is not null and previous_row.slot_id is distinct from p_slot_id then
    update public.shoot_availability set status = 'open', inquiry_id = null
      where id = previous_row.slot_id;
  end if;
  if p_slot_id is not null then
    -- A draft holds its selected slot. Withdrawing a confirmation retains that
    -- hold, so revising public details does not accidentally lose the appointment.
    -- Clearing/changing the slot explicitly releases its former reservation.
    reservation_status := case when p_status = 'confirmed' then 'booked' else 'held' end;
    update public.shoot_availability set status = reservation_status, inquiry_id = p_inquiry_id
      where id = p_slot_id
        and (status is distinct from reservation_status or inquiry_id is distinct from p_inquiry_id);
    -- 006's version trigger owns the slot's version and updated_at changes.
  end if;

  delete from private.cooperation_holds where inquiry_id=p_inquiry_id;
  if has_previous then
    update public.shoot_confirmations set
      status = p_status, slot_id = p_slot_id,
      starts_at = slot_row.starts_at, ends_at = slot_row.ends_at,
      location = p_location, map_url = p_map_url, wardrobe = p_wardrobe,
      bring = p_bring, rain_plan = p_rain_plan, delivery_note = p_delivery_note,
      publication_note = p_publication_note
      where inquiry_id = p_inquiry_id and version = p_version
      returning * into result_row;
  else
    insert into public.shoot_confirmations (
      inquiry_id, status, slot_id, starts_at, ends_at, location, map_url,
      wardrobe, bring, rain_plan, delivery_note, publication_note
    ) values (
      p_inquiry_id, p_status, p_slot_id, slot_row.starts_at, slot_row.ends_at,
      p_location, p_map_url, p_wardrobe, p_bring, p_rain_plan,
      p_delivery_note, p_publication_note
    ) returning * into result_row;
  end if;
  return private.shoot_confirmation_json(result_row);
end;
$$;

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
    if slot.version <> p_version or slot.status = 'booked' or slot.inquiry_id is not null or exists(select 1 from private.cooperation_holds h where h.slot_id=p_id and h.expires_at>now() and exists(select 1 from private.inquiry_receipts hr where hr.inquiry_id=h.inquiry_id and hr.revoked_at is null)) then
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

create or replace function public.get_public_availability(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from or p_to - p_from > 179 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'startsAt', starts_at, 'endsAt', ends_at,
    'status', case when status = 'open' and not exists(select 1 from private.cooperation_holds h where h.slot_id=shoot_availability.id and h.expires_at>now() and exists(select 1 from private.inquiry_receipts hr where hr.inquiry_id=h.inquiry_id and hr.revoked_at is null)) then 'open' else 'unavailable' end) order by starts_at, id), '[]'::jsonb)
    from public.shoot_availability
    where starts_at < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
      and ends_at > (p_from::timestamp at time zone 'Asia/Taipei'));
end;
$$;

create or replace function public.get_admin_availability(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_site_admin() then raise exception using errcode = '42501', message = 'forbidden'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from or p_to - p_from > 179 then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'starts_at', starts_at, 'ends_at', ends_at,
    'status', case when status='open' and exists(select 1 from private.cooperation_holds h where h.slot_id=shoot_availability.id and h.expires_at>now() and exists(select 1 from private.inquiry_receipts hr where hr.inquiry_id=h.inquiry_id and hr.revoked_at is null)) then 'held' else status end, 'inquiry_id', coalesce(inquiry_id,(select h.inquiry_id from private.cooperation_holds h where h.slot_id=shoot_availability.id and h.expires_at>now() and exists(select 1 from private.inquiry_receipts hr where hr.inquiry_id=h.inquiry_id and hr.revoked_at is null))), 'version', version) order by starts_at, id), '[]'::jsonb)
    from public.shoot_availability
    where starts_at < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
      and ends_at > (p_from::timestamp at time zone 'Asia/Taipei'));
end;
$$;

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
    where (i.token_hash = p_token_hash or exists(select 1 from private.cooperation_gallery_sessions gs where gs.invite_id=i.id and gs.token_hash=p_token_hash and gs.expires_at>clock_timestamp())) and i.revoked_at is null and i.expires_at > clock_timestamp()
      and g.status in ('proofing', 'delivered')
      and not exists(select 1 from private.cooperation_gallery_invites cv
       join private.cooperation_centers cc on cc.inquiry_id=cv.inquiry_id
       where cv.invite_id=i.id and (cc.cancelled_at is not null or cc.gallery_id is distinct from i.gallery_id
       or not exists(select 1 from private.inquiry_receipts rr where rr.inquiry_id=cv.inquiry_id and rr.revoked_at is null)));
  if not found then raise exception using errcode = '42501', message = 'invalid_invitation'; end if;
  return invite_row;
end;
$$;

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
  if p_status<>'closed' and exists(select 1 from private.cooperation_centers where inquiry_id=p_id and cancelled_at is not null) then
    raise exception using errcode='P0001',message='cancelled';
  end if;
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

notify pgrst,'reload schema';
commit;
