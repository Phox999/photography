-- Run only against a disposable/local Supabase project after the shoot-project migration.
-- No inquiry rows or receipt rows are inserted by this validation file.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select ok(has_column('public', 'collaboration_requests', 'shoot_project_id'), 'project id column exists');
select ok(has_column('public', 'collaboration_requests', 'shoot_project_snapshot'), 'project snapshot column exists');
select ok(not has_table_privilege('anon', 'public.collaboration_requests', 'select'), 'anonymous still cannot read inquiry rows');
select ok(not has_function_privilege('anon', 'public.submit_workflow_inquiry(uuid,text,text,jsonb)', 'execute'), 'anonymous cannot invoke the inquiry writer');
select ok(has_function_privilege('service_role', 'public.submit_workflow_inquiry(uuid,text,text,jsonb)', 'execute'), 'server retains the workflow writer grant');

select ok(private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"一般主題合作","consent":true,"reference_links":[],"reference_images":[]}'::jsonb
), 'legacy workflow payload without project fields remains valid');

select ok(private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"申請企劃：測試企劃","consent":true,"reference_links":[],"reference_images":[],"shoot_project_id":"test-project","shoot_project_revision":1,"shoot_project_snapshot":{"id":"test-project","revision":1,"slug":"test-project","title":"測試企劃","summary":"測試摘要","concept":"測試方向","area":"台北","dateNote":"日期另行討論","deadlineAt":null,"costNote":"費用已確認","deliveryNote":"交付已確認","publicationNote":"公開方式已確認"}}'::jsonb
), 'server snapshot and project identity pass the payload allowlist');

select ok(not private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"申請企劃：測試企劃","consent":true,"reference_links":[],"reference_images":[],"shoot_project_id":"test-project","shoot_project_revision":1}'::jsonb
), 'project identity without a server snapshot is rejected');

select ok(not private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"申請企劃：測試企劃","consent":true,"reference_links":[],"reference_images":[],"shoot_project_id":"test-project","shoot_project_revision":1,"shoot_project_snapshot":{"id":"test-project","revision":1,"slug":"test-project","title":"測試企劃","summary":"測試摘要","concept":"測試方向","area":"台北","dateNote":"日期另行討論","deadlineAt":null,"costNote":"費用已確認","deliveryNote":"交付已確認","publicationNote":"公開方式已確認","admin_notes":"不得通過"}}'::jsonb
), 'snapshot payload rejects fields outside the whitelist');

select * from finish();
rollback;
