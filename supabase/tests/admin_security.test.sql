-- Run ONLY against a disposable/local Supabase project after applying the migration.
-- supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users (id, email) values
  ('fe3aa801-346b-4ea7-9001-000000000001', 'admin-security-test@example.invalid'),
  ('fe3aa801-346b-4ea7-9001-000000000002', 'member-security-test@example.invalid');
insert into public.site_admins (user_id) values ('fe3aa801-346b-4ea7-9001-000000000001');
insert into public.collaboration_requests (id, name, contact_method, contact_account, collaboration_type, description, consent)
  values ('fe3aa801-346b-4ea7-9001-000000000003', 'TEST PRIVATE NAME', 'Instagram', 'TEST PRIVATE ACCOUNT', '主題合作', 'TEST PRIVATE BRIEF', true);

select ok(not has_table_privilege('anon', 'public.collaboration_requests', 'select,insert,update,delete'), 'anonymous has no inquiry grants');
select ok(not has_table_privilege('authenticated', 'public.collaboration_requests', 'insert,update,delete'), 'authenticated cannot write inquiry tables directly');
select ok(not has_table_privilege('authenticated', 'public.site_admins', 'insert,update,delete'), 'authenticated cannot assign privileges');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'insert,update,delete'), 'authenticated cannot forge audit rows');
select ok(not has_table_privilege('anon', 'public.site_content', 'select'), 'anonymous cannot read raw CMS');
select ok(has_table_privilege('service_role', 'public.collaboration_requests', 'insert'), 'existing public form may insert');
select ok(not has_table_privilege('service_role', 'public.collaboration_requests', 'select,update,delete'), 'service key receives no management data grant');
select ok(not has_function_privilege('anon', 'public.admin_update_inquiry(uuid,text,text,integer)', 'execute'), 'anonymous cannot invoke admin RPC');
select ok(not has_function_privilege('anon', 'public.admin_update_content(text,boolean,jsonb,text,text,text[],integer)', 'execute'), 'anonymous cannot invoke the current CMS writer');
select ok(not has_function_privilege('anon', 'public.admin_update_portfolio_changes(jsonb,text[],text[],integer)', 'execute'), 'anonymous cannot invoke portfolio change RPC');
select ok(not has_function_privilege('authenticated', 'public.consume_admin_login_attempt(text,text)', 'execute'), 'authenticated cannot consume login limits directly');

set local role anon;
select throws_ok('select * from public.collaboration_requests', '42501', null, 'anonymous inquiry SELECT denied');
select throws_ok('select * from public.site_content', '42501', null, 'anonymous raw CMS SELECT denied');
select throws_ok('select * from public.audit_logs', '42501', null, 'anonymous audit SELECT denied');
select ok(public.get_public_site_content() ?& array['announcement', 'faqs', 'hero_title', 'hero_copy', 'hero_image_path', 'hero_image_paths', 'version'], 'public projection has all seven supported fields');
select is((select count(*)::integer from jsonb_object_keys(public.get_public_site_content())), 7, 'public projection has only the seven supported fields');
select throws_ok('select public.consume_admin_login_attempt(repeat(''a'',64),repeat(''b'',64))', '42501', null, 'anonymous cannot invoke rate counter');
reset role;

select set_config('request.jwt.claims', '{"sub":"fe3aa801-346b-4ea7-9001-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.site_admins), 0, 'ordinary member sees no allowlist entries');
select is((select count(*)::integer from public.collaboration_requests), 0, 'ordinary member sees no inquiries');
select is((select count(*)::integer from public.site_content), 0, 'ordinary member sees no raw CMS');
select is((select count(*)::integer from public.audit_logs), 0, 'ordinary member sees no audit');
select throws_ok($$insert into public.site_admins(user_id) values ('fe3aa801-346b-4ea7-9001-000000000002')$$, '42501', null, 'member cannot self-promote');
select throws_ok($$select public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000003','closed','attack',1)$$, '42501', 'forbidden', 'member cannot call inquiry writer');
select throws_ok($$select public.admin_update_content('attack',true,'[]','測試標題','測試內文',array[]::text[],1)$$, '42501', 'forbidden', 'member cannot call CMS writer');
select throws_ok($$select public.admin_update_portfolio_changes('[]','{}','{}',1)$$, '42501', 'forbidden', 'member cannot call portfolio change RPC');
reset role;

select set_config('request.jwt.claims', '{"sub":"fe3aa801-346b-4ea7-9001-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.site_admins), 1, 'admin sees own allowlist row only');
select is((select count(*)::integer from public.collaboration_requests where id = 'fe3aa801-346b-4ea7-9001-000000000003'), 1, 'admin reads target inquiry');
select throws_ok($$update public.collaboration_requests set status = 'closed' where id = 'fe3aa801-346b-4ea7-9001-000000000003'$$, '42501', null, 'admin cannot bypass version RPC with direct UPDATE');
select throws_ok($$delete from public.collaboration_requests where id = 'fe3aa801-346b-4ea7-9001-000000000003'$$, '42501', null, 'admin cannot delete inquiry');
select throws_ok($$insert into public.audit_logs(action,target_id) values ('inquiry.updated','forged')$$, '42501', null, 'admin cannot manufacture audit');
select throws_ok($$select public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000003','invalid','',1)$$, '22023', 'invalid_input', 'invalid status rejected');
select throws_ok($$select public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000003','new',repeat('x',4001),1)$$, '22023', 'invalid_input', 'oversized notes rejected');
select throws_ok($$select public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000003','new',null,1)$$, '22023', 'invalid_input', 'null notes rejected');
select throws_ok($$select public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000099','new','',1)$$, 'P0002', 'not_found', 'unknown inquiry gives distinct error');
select is((public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000003','reviewing','TEST PRIVATE NOTES',1)->>'version')::integer, 2, 'valid write increments version once');
select throws_ok($$select public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000003','closed','lost update',1)$$, 'P0001', 'conflict', 'stale version rejected');
select is((select status from public.collaboration_requests where id = 'fe3aa801-346b-4ea7-9001-000000000003'), 'reviewing', 'stale request did not overwrite status');
select is((select count(*)::integer from public.audit_logs where target_id = 'fe3aa801-346b-4ea7-9001-000000000003'), 1, 'one audit row for one successful write');
select ok((select metadata ?& array['changed_keys', 'status_from', 'status_to', 'version'] from public.audit_logs where target_id = 'fe3aa801-346b-4ea7-9001-000000000003'), 'audit contains the expected safe metadata');
select ok((select metadata::text not like '%TEST PRIVATE%' from public.audit_logs where target_id = 'fe3aa801-346b-4ea7-9001-000000000003'), 'audit excludes private form text and notes');
select throws_ok($$select public.admin_update_content(repeat('x',501),true,'[]','測試標題','測試內文',array[]::text[],1)$$, '22023', 'invalid_input', 'oversized announcement rejected before version check');
select throws_ok($$select public.admin_update_content(' ',true,'[]','測試標題','測試內文',array[]::text[],1)$$, '22023', 'invalid_input', 'enabled blank announcement rejected');
select throws_ok($$select public.admin_update_content('',false,'[{"question":"q","answer":"a","unsafe":"extra"}]','測試標題','測試內文',array[]::text[],1)$$, '22023', 'invalid_input', 'unknown FAQ keys rejected');
select throws_ok($$select public.admin_update_content('',false,'[{"question":"q","answer":""}]','測試標題','測試內文',array[]::text[],1)$$, '22023', 'invalid_input', 'blank FAQ answer rejected');
select throws_ok($$select public.admin_update_content('',false,'null','測試標題','測試內文',array[]::text[],1)$$, '22023', 'invalid_input', 'non-array FAQ rejected');
select throws_ok($$select public.admin_update_content('',false,(select jsonb_agg(jsonb_build_object('question','q','answer','a')) from generate_series(1,13)),'測試標題','測試內文',array[]::text[],1)$$, '22023', 'invalid_input', 'FAQ count limit enforced');
select lives_ok($$select public.admin_update_content('HIDDEN DISABLED ANNOUNCEMENT',false,'[{"question":"q","answer":"a"}]','測試標題','測試內文',array[]::text[],(select version from public.site_content where id=1))$$, 'admin saves CMS through the current RPC signature');
select is(public.get_public_site_content()->>'announcement', '', 'disabled announcement is absent from public projection');
select throws_ok($$select public.admin_update_content('stale',true,'[]','測試標題','測試內文',array[]::text[],(select version - 1 from public.site_content where id=1))$$, 'P0001', 'conflict', 'CMS stale version rejected');
select is((public.admin_update_portfolio_changes(
  '[{"slug":"first","title":"First","category":"外拍","description":"","cover":"static:/assets/portfolio/test/one.webp","images":["static:/assets/portfolio/test/one.webp"],"totalImages":1}]',
  '{}', array['first'], (select version from public.portfolio_content where id=1))->>'version')::integer, 2, 'portfolio change RPC applies a valid delta in one update');
select throws_ok($$select public.admin_update_portfolio_changes(
  '[{"slug":"first","title":"Overwritten","category":"外拍","description":"","cover":"static:/assets/portfolio/test/one.webp","images":["static:/assets/portfolio/test/one.webp"],"totalImages":1}]',
  '{}', array['missing'], (select version from public.portfolio_content where id=1))$$, '22023', 'invalid_input', 'invalid final portfolio order rejected');
select is((select collections->0->>'title' from public.portfolio_content where id=1), 'First', 'invalid order leaves portfolio unchanged');
select is((public.admin_update_portfolio_changes(
  '[{"slug":"second","title":"Second","category":"棚拍","description":"","cover":"static:/assets/portfolio/test/two.webp","images":["static:/assets/portfolio/test/two.webp"],"totalImages":1}]',
  array['first'], array['second'], (select version from public.portfolio_content where id=1))->'collections'->0->>'slug', 'second', 'portfolio RPC atomically adds, deletes, and orders collections');
select is((select jsonb_array_length(collections) from public.portfolio_content where id=1), 1, 'portfolio delete is reflected in the committed collection');
select throws_ok($$select public.admin_update_portfolio_changes('[]','{}',array['first'],1)$$, 'P0001', 'conflict', 'portfolio stale version rejected');
reset role;

update public.site_admins set active = false where user_id = 'fe3aa801-346b-4ea7-9001-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.collaboration_requests), 0, 'disabled admin immediately loses SELECT with same claims');
select throws_ok($$select public.admin_update_inquiry('fe3aa801-346b-4ea7-9001-000000000003','closed','',2)$$, '42501', 'forbidden', 'disabled admin immediately loses RPC with same claims');
reset role;

select set_config('request.jwt.claims', '{}', true);
set local role service_role;
select lives_ok($$insert into public.collaboration_requests(name,contact_method,contact_account,collaboration_type,description,consent) values ('SERVICE INSERT TEST','Instagram','test','主題合作','test',true)$$, 'existing server form insertion works');
select throws_ok($$select public.consume_admin_login_attempt('raw-ip','raw-email')$$, '22023', 'invalid_input', 'rate limiter rejects unhashed identifiers');
select ok((public.consume_admin_login_attempt(repeat('a',64),repeat('b',64))->>'allowed')::boolean, 'first login attempt allowed');
select lives_ok($$do $body$ begin for i in 1..7 loop perform public.consume_admin_login_attempt(repeat('a',64),repeat('b',64)); end loop; end; $body$$$, 'fill email quota');
select is((public.consume_admin_login_attempt(repeat('a',64),repeat('b',64))->>'allowed')::boolean, false, 'ninth email attempt denied');
select ok((public.consume_admin_login_attempt(repeat('a',64),repeat('b',64))->>'retry_after')::integer between 1 and 900, 'denial gives bounded retry seconds');
select lives_ok($$do $body$ begin for i in 1..30 loop perform public.consume_admin_login_attempt(repeat('c',64),md5('rate-test-' || i::text) || md5('rate-test-' || i::text)); end loop; end; $body$$$, 'fill IP quota with separate email hashes');
select is((public.consume_admin_login_attempt(repeat('c',64),repeat('d',64))->>'allowed')::boolean, false, '31st IP attempt denied');
reset role;
select is((select count(*)::integer from private.admin_login_attempts where key_type='email' and key_hash=repeat('d',64)), 0, 'denied IP did not consume email counter');

select * from finish();
rollback;
