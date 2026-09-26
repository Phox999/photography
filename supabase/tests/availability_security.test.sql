-- Run only against disposable/local Supabase after migrations. All fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(id,email) values
  ('a6060000-0000-4000-8000-000000000001','availability-admin@example.invalid'),
  ('a6060000-0000-4000-8000-000000000002','availability-member@example.invalid');
insert into public.site_admins(user_id) values ('a6060000-0000-4000-8000-000000000001');
insert into public.collaboration_requests(id,name,contact_method,contact_account,collaboration_type,consent)
  values ('a6060000-0000-4000-8000-000000000003','ROLLBACK FIXTURE','Instagram','PRIVATE ACCOUNT','主題合作',true);
insert into public.shoot_availability(id,starts_at,ends_at,status) values
  ('a6060000-0000-4000-8000-000000000004','2098-01-02T14:00:00+08:00','2098-01-02T16:00:00+08:00','open'),
  ('a6060000-0000-4000-8000-000000000005','2098-01-03T14:00:00+08:00','2098-01-03T16:00:00+08:00','closed');
insert into public.shoot_availability(id,starts_at,ends_at,status,inquiry_id) values
  ('a6060000-0000-4000-8000-000000000006','2098-01-04T14:00:00+08:00','2098-01-04T16:00:00+08:00','booked','a6060000-0000-4000-8000-000000000003'),
  ('a6060000-0000-4000-8000-000000000007','2098-01-05T14:00:00+08:00','2098-01-05T16:00:00+08:00','held','a6060000-0000-4000-8000-000000000003');

select ok(not has_table_privilege('anon','public.shoot_availability','select,insert,update,delete'),'anon has no raw calendar grants');
select ok(not has_table_privilege('authenticated','public.shoot_availability','insert,update,delete'),'authenticated cannot bypass mutation RPC');
select ok(not has_function_privilege('anon','public.admin_save_availability(uuid,integer,timestamptz,timestamptz,text)','execute'),'anon cannot write slots');
select ok(not has_function_privilege('anon','public.get_admin_availability(date,date)','execute'),'anon cannot read private projection');

set local role anon;
select is(jsonb_array_length(public.get_public_availability('2098-01-02','2098-01-05')),4,'public lists published intervals');
select is(public.get_public_availability('2098-01-02','2098-01-02')->0->>'status','open','open projection');
select is(public.get_public_availability('2098-01-03','2098-01-03')->0->>'status','unavailable','closed projection');
select is(public.get_public_availability('2098-01-04','2098-01-04')->0->>'status','unavailable','booked details remain private');
select is(public.get_public_availability('2098-01-05','2098-01-05')->0->>'status','unavailable','held details remain private');
select is((select count(*)::integer from jsonb_object_keys(public.get_public_availability('2098-01-04','2098-01-04')->0)),4,'public slot contains only four fields');
select ok(not ((public.get_public_availability('2098-01-04','2098-01-04')->0) ?| array['inquiry_id','inquiryId','version','notes']),'public projection excludes linkage/version/notes');
select is(public.get_public_availability('2098-01-06','2098-01-06'),'[]'::jsonb,'unpublished dates stay empty');
select throws_ok($$select public.get_public_availability('2098-01-01','2098-07-01')$$,'22023','invalid_input','oversized window rejected in DB too');
select throws_ok('select * from public.shoot_availability','42501',null,'raw public SELECT forbidden');
reset role;

select set_config('request.jwt.claims','{"sub":"a6060000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.shoot_availability),0,'non-admin RLS hides rows');
select throws_ok($$select public.get_admin_availability('2098-01-01','2098-01-05')$$,'42501','forbidden','non-admin private projection denied');
select throws_ok($$select public.admin_save_availability(null,null,'2098-02-01T14:00:00+08:00','2098-02-01T16:00:00+08:00','open')$$,'42501','forbidden','non-admin write denied');
reset role;

select set_config('request.jwt.claims','{"sub":"a6060000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.admin_save_availability(null,null,'2098-01-02T15:00:00+08:00','2098-01-02T17:00:00+08:00','open')$$,'P0001','conflict','overlap cannot be created');
select throws_ok($$select public.admin_save_availability(null,null,'2098-01-03T15:00:00+08:00','2098-01-03T17:00:00+08:00','open')$$,'P0001','conflict','closed interval cannot be overlapped');
select lives_ok($$select public.admin_save_availability(null,null,'2098-01-02T16:00:00+08:00','2098-01-02T17:00:00+08:00','open')$$,'adjacent intervals are allowed');
select is((public.admin_save_availability('a6060000-0000-4000-8000-000000000004',1,'2098-01-02T14:00:00+08:00','2098-01-02T16:00:00+08:00','held')->>'version')::integer,2,'save advances version exactly once');
select throws_ok($$select public.admin_save_availability('a6060000-0000-4000-8000-000000000004',1,'2098-01-02T14:00:00+08:00','2098-01-02T16:00:00+08:00','open')$$,'P0001','conflict','stale version cannot overwrite');
select is((select status from public.shoot_availability where id='a6060000-0000-4000-8000-000000000004'),'held','stale edit leaves row unchanged');
select throws_ok($$select public.admin_save_availability('a6060000-0000-4000-8000-000000000006',1,'2098-01-04T14:00:00+08:00','2098-01-04T16:00:00+08:00','closed')$$,'P0001','conflict','booked slot protected');
select throws_ok($$select public.admin_save_availability('a6060000-0000-4000-8000-000000000007',1,'2098-01-05T14:00:00+08:00','2098-01-05T16:00:00+08:00','open')$$,'P0001','conflict','inquiry-bound hold protected');
select throws_ok($$select public.admin_save_availability(null,null,'2098-03-01T14:00:00+08:00','2098-03-01T16:00:00+08:00','booked')$$,'22023','invalid_input','booking must go through confirmation');
select throws_ok($$delete from public.shoot_availability where id='a6060000-0000-4000-8000-000000000004'$$,'42501',null,'no client deletion');
select throws_ok($$update public.shoot_availability set status='open' where id='a6060000-0000-4000-8000-000000000006'$$,'42501',null,'no direct client booking edits');
reset role;

select * from finish();
rollback;
