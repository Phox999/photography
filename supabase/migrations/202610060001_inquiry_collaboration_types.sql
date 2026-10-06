-- Older installations retain the original form's CHECK constraint because
-- CREATE TABLE IF NOT EXISTS does not update an existing table definition.
-- Keep historical values valid while accepting the current inquiry form.
begin;

alter table public.collaboration_requests
  drop constraint if exists collaboration_requests_collaboration_type_check;

alter table public.collaboration_requests
  add constraint collaboration_requests_collaboration_type_check
  check (collaboration_type in (
    '互惠創作', '付費委託', '品牌合作', '其他',
    '輕量體驗(2hr)', '標準方案(3hr)', '主題合作'
  ));

notify pgrst, 'reload schema';
commit;
