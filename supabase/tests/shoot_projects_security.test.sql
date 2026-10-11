-- Run only against a disposable/local Supabase project after the shoot-project migration.
-- Writer assertions insert only inside this transaction; final ROLLBACK removes
-- every inquiry and receipt row. Never run against production.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select ok(has_column('public', 'collaboration_requests', 'shoot_project_id', 'project id column exists'), 'project id column exists');
select ok(has_column('public', 'collaboration_requests', 'shoot_project_snapshot', 'project snapshot column exists'), 'project snapshot column exists');
select ok(not has_table_privilege('anon', 'public.collaboration_requests', 'select'), 'anonymous still cannot read inquiry rows');
select ok(not has_function_privilege('anon', 'public.submit_workflow_inquiry(uuid,text,text,jsonb)', 'execute'), 'anonymous cannot invoke the inquiry writer');
select ok(has_function_privilege('service_role', 'public.submit_workflow_inquiry(uuid,text,text,jsonb)', 'execute'), 'server retains the workflow writer grant');

select ok(private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"一般主題合作","consent":true,"reference_links":[],"reference_images":[]}'::jsonb
), 'legacy workflow payload without project fields remains valid');

select ok(private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"申請企劃：測試企劃","consent":true,"reference_links":[],"reference_images":[],"shoot_project_id":"test-project","shoot_project_revision":1,"shoot_project_snapshot":{"id":"test-project","revision":1,"slug":"test-project","title":"測試企劃","summary":"測試摘要","concept":"測試方向","area":"台北","dateNote":"日期另行討論","deadlineAt":null,"costNote":"費用已確認","deliveryNote":"交付已確認","publicationNote":"公開方式已確認"}}'::jsonb
), 'server snapshot and project identity pass the payload allowlist');

with snapshot as (
  select jsonb_build_object('id','test-project','revision',1,'slug','test-project','title','測試企劃',
    'summary','測試摘要','concept','第一段 第二段','area','台北','dateNote','日期另行討論','deadlineAt',null,
    'costNote','費用已確認','deliveryNote','交付已確認','publicationNote','公開方式已確認') as value
)
select ok(private.valid_shoot_project_snapshot(jsonb_set(value, '{concept}', to_jsonb(E'第一段\n第二段'::text)), 'test-project'), 'snapshot accepts LF paragraph breaks') from snapshot;

with snapshot as (
  select jsonb_build_object('id','test-project','revision',1,'slug','test-project','title','測試企劃',
    'summary','測試摘要','concept','第一段 第二段','area','台北','dateNote','日期另行討論','deadlineAt',null,
    'costNote','費用已確認','deliveryNote','交付已確認','publicationNote','公開方式已確認') as value
)
select ok(private.valid_shoot_project_snapshot(jsonb_set(value, '{concept}', to_jsonb(E'第一段\r\n第二段'::text)), 'test-project'), 'snapshot accepts CRLF paragraph breaks') from snapshot;

with snapshot as (
  select jsonb_build_object('id','test-project','revision',1,'slug','test-project','title','測試企劃',
    'summary','測試摘要','concept','企劃說明','area','台北','dateNote','日期另行討論','deadlineAt',null,
    'costNote','費用已確認','deliveryNote','交付已確認','publicationNote','公開方式已確認') as value
)
select ok(private.valid_shoot_project_snapshot(jsonb_set(value, '{concept}', to_jsonb(E'企劃\t說明'::text)), 'test-project'), 'snapshot accepts TAB') from snapshot;

with snapshot as (
  select jsonb_build_object('id','test-project','revision',1,'slug','test-project','title','測試企劃',
    'summary','測試摘要','concept','企劃說明','area','台北','dateNote','日期另行討論','deadlineAt',null,
    'costNote','費用已確認','deliveryNote','交付已確認','publicationNote','公開方式已確認') as value
)
select ok(not private.valid_shoot_project_snapshot(jsonb_set(value, '{concept}', to_jsonb('企劃' || chr(1) || '說明')), 'test-project'), 'snapshot rejects unsupported control characters') from snapshot;

with snapshot as (
  select jsonb_build_object('id','test-project','revision',1,'slug','test-project','title','測試企劃',
    'summary',repeat('摘',400),'concept',repeat('文',2000),'area',repeat('地',160),'dateNote',repeat('日',1000),'deadlineAt',null,
    'costNote',repeat('費',1000),'deliveryNote',repeat('交',1000),'publicationNote',repeat('公',1000)) as value
)
select ok(not private.valid_shoot_project_snapshot(value, 'test-project'), 'snapshot enforces the 12,000-byte serialized size cap') from snapshot;

select ok(not private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"申請企劃：測試企劃","consent":true,"reference_links":[],"reference_images":[],"shoot_project_id":"test-project","shoot_project_revision":1}'::jsonb
), 'project identity without a server snapshot is rejected');

select ok(not private.valid_workflow_inquiry_payload(
  '{"name":"Test","contact_method":"Instagram","contact_account":"@test","collaboration_type":"主題合作","preferred_date":null,"description":"申請企劃：測試企劃","consent":true,"reference_links":[],"reference_images":[],"shoot_project_id":"test-project","shoot_project_revision":1,"shoot_project_snapshot":{"id":"test-project","revision":1,"slug":"test-project","title":"測試企劃","summary":"測試摘要","concept":"測試方向","area":"台北","dateNote":"日期另行討論","deadlineAt":null,"costNote":"費用已確認","deliveryNote":"交付已確認","publicationNote":"公開方式已確認","admin_notes":"不得通過"}}'::jsonb
), 'snapshot payload rejects fields outside the whitelist');

select ok((public.submit_workflow_inquiry(
  '10000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), repeat('b',64),
  jsonb_build_object('name','Test','contact_method','Instagram','contact_account','@general-test',
    'collaboration_type','主題合作','preferred_date',null,'description','一般合作測試','consent',true,
    'reference_links','[]'::jsonb,'reference_images','[]'::jsonb)
)->>'created')::boolean, 'writer inserts a general cooperation inquiry');

select ok(not (public.submit_workflow_inquiry(
  '10000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), repeat('b',64),
  jsonb_build_object('name','Test','contact_method','Instagram','contact_account','@general-test',
    'collaboration_type','主題合作','preferred_date',null,'description','一般合作測試','consent',true,
    'reference_links','[]'::jsonb,'reference_images','[]'::jsonb)
)->>'created')::boolean, 'same general payload retry returns its existing receipt');

select ok((public.submit_workflow_inquiry(
  '20000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), repeat('d',64),
  jsonb_build_object('name','Test','contact_method','Instagram','contact_account','@project-test',
    'collaboration_type','主題合作','preferred_date',null,'description','企劃申請測試','consent',true,
    'reference_links','[]'::jsonb,'reference_images','[]'::jsonb,
    'shoot_project_id','test-project','shoot_project_revision',1,
    'shoot_project_snapshot',jsonb_build_object('id','test-project','revision',1,'slug','test-project',
      'title','測試企劃','summary','測試摘要','concept',E'第一段\n第二段','area','台北',
      'dateNote','日期另行討論','deadlineAt',null,'costNote','費用已確認',
      'deliveryNote','交付已確認','publicationNote','公開方式已確認'))
)->>'created')::boolean, 'writer inserts a project request with its snapshot');

select ok((select i.shoot_project_id = 'test-project'
    and i.shoot_project_snapshot ->> 'concept' = E'第一段\n第二段'
  from public.collaboration_requests i
  join private.inquiry_receipts r on r.inquiry_id = i.id
  where r.submission_id = '20000000-0000-4000-8000-000000000002'::uuid), 'project id and immutable snapshot are saved with the inquiry');

select ok((public.submit_workflow_inquiry(
  '20000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), repeat('d',64),
  jsonb_build_object('name','Test','contact_method','Instagram','contact_account','@project-test',
    'collaboration_type','主題合作','preferred_date',null,'description','企劃申請測試','consent',true,
    'reference_links','[]'::jsonb,'reference_images','[]'::jsonb,
    'shoot_project_id','test-project','shoot_project_revision',1,
    'shoot_project_snapshot',jsonb_build_object('id','test-project','revision',1,'slug','test-project',
      'title','測試企劃','summary','測試摘要','concept',E'第一段\n第二段','area','台北',
      'dateNote','日期另行討論','deadlineAt',null,'costNote','費用已確認',
      'deliveryNote','交付已確認','publicationNote','公開方式已確認'))
)->>'created' = 'false', 'same project payload retry returns its original receipt');

select throws_ok($$select public.submit_workflow_inquiry(
  '20000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), repeat('e',64),
  jsonb_build_object('name','Test','contact_method','Instagram','contact_account','@project-test',
    'collaboration_type','主題合作','preferred_date',null,'description','不同企劃申請','consent',true,
    'reference_links','[]'::jsonb,'reference_images','[]'::jsonb,
    'shoot_project_id','test-project','shoot_project_revision',1,
    'shoot_project_snapshot',jsonb_build_object('id','test-project','revision',1,'slug','test-project',
      'title','測試企劃','summary','測試摘要','concept','另一個方向','area','台北',
      'dateNote','日期另行討論','deadlineAt',null,'costNote','費用已確認',
      'deliveryNote','交付已確認','publicationNote','公開方式已確認'))
)$$, 'P0001', 'conflict', 'different payload under an existing submission identity conflicts');

select ok(public.get_cooperation_progress(repeat('c',64)) -> 'shootProject' ->> 'id' = 'test-project', 'private receipt lookup returns the saved project snapshot');

select * from finish();
rollback;
