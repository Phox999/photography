import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/inquiries.js';
import { parseShootProjectRequest, projectForNewRequest } from '../server/shoot-projects.js';
import { inquiryQuery, INQUIRY_FIELDS } from '../server/admin-validation.js';
import { prepareSubmission } from '../server/inquiry-workflow.js';
import { publicProgress } from '../server/inquiry-workflow.js';

const secretEnv = { SUPABASE_URL: 'https://test-project.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test-key' };
const common = {
  name: 'Test', contact_method: 'Instagram', contact_account: '@test', collaboration_type: '主題合作',
  preferred_date: '', description: '', reference_links: [], consent: true,
  shoot_project_id: 'city-night-portrait', shoot_project_revision: 1,
  submission_id: '00000000-0000-4000-8000-000000000001', receipt_token: 'a'.repeat(64),
};

function requestFor(body) {
  return new Request('https://phox999.com/api/inquiries', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://phox999.com' }, body: JSON.stringify(body),
  });
}

test('企劃 ID 與 revision 必須成對提供且使用主題合作類型', () => {
  assert.deepEqual(parseShootProjectRequest(common), { id: 'city-night-portrait', revision: 1 });
  assert.equal(parseShootProjectRequest({ collaboration_type: '標準方案(3hr)' }), null);
  assert.throws(() => parseShootProjectRequest({ ...common, shoot_project_revision: undefined }), /格式不正確/);
  assert.throws(() => parseShootProjectRequest({ ...common, collaboration_type: '標準方案(3hr)' }), /主題合作/);
  assert.throws(() => projectForNewRequest({ id: 'city-night-portrait', revision: 1 }), /目前未開放/);
});

test('企劃 ID 或 revision 改變時 request hash 也改變；一般 request hash 保持原欄位形狀', async () => {
  const payload = { name: 'Test', contact_method: 'Instagram', contact_account: '@test', collaboration_type: '主題合作', preferred_date: null, description: null, consent: true, reference_links: [] };
  const legacyBody = { submission_id: common.submission_id, receipt_token: common.receipt_token };
  const legacy = await prepareSubmission(legacyBody, payload, []);
  const projectA = await prepareSubmission({ ...legacyBody, shoot_project_id: 'city-night-portrait', shoot_project_revision: 1 }, payload, []);
  const projectB = await prepareSubmission({ ...legacyBody, shoot_project_id: 'uniform-portrait', shoot_project_revision: 1 }, payload, []);
  const revised = await prepareSubmission({ ...legacyBody, shoot_project_id: 'city-night-portrait', shoot_project_revision: 2 }, payload, []);
  assert.notEqual(projectA.requestHash, legacy.requestHash);
  assert.notEqual(projectA.requestHash, projectB.requestHash);
  assert.notEqual(projectA.requestHash, revised.requestHash);
  assert.equal((await prepareSubmission(legacyBody, payload, [])).requestHash, legacy.requestHash);
});

test('已收件的企劃重試會在檢查草稿／關閉狀態前回傳原回條', async () => {
  const previousFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched += 1;
    return new Response(JSON.stringify({ reference: 'PHOX-0123456789ABCDEF0123', createdAt: '2026-10-10T00:00:00Z', created: false }), { status: 200 });
  };
  try {
    const response = await onRequest({ request: requestFor(common), env: secretEnv });
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.receipt.reference, 'PHOX-0123456789ABCDEF0123');
    assert.equal(fetched, 1);
  } finally { globalThis.fetch = previousFetch; }
});

test('沒有既有回條的新企劃申請依目前草稿狀態拒絕，且不執行寫入', async () => {
  const previousFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched += 1; return new Response('null', { status: 200 }); };
  try {
    const response = await onRequest({ request: requestFor(common), env: secretEnv });
    const result = await response.json();
    assert.equal(response.status, 409);
    assert.match(result.message, /未開放申請/);
    assert.equal(fetched, 1);
  } finally { globalThis.fetch = previousFetch; }
});

test('提交 API 拒絕使用者偽造企劃標題／條件，admin filter 套用精確 project id', async () => {
  const forged = { ...common, shoot_project_title: '偽造標題' };
  const response = await onRequest({ request: requestFor(forged), env: {} });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /不支援的欄位/);

  const { params } = inquiryQuery(new URL('https://phox999.com/api/admin/inquiries?status=new&page=2&project=city-night-portrait'));
  assert.equal(params.get('status'), 'eq.new');
  assert.equal(params.get('shoot_project_id'), 'eq.city-night-portrait');
  assert.match(INQUIRY_FIELDS, /shoot_project_snapshot/);
  const general = inquiryQuery(new URL('https://phox999.com/api/admin/inquiries?project=general'));
  assert.equal(general.params.get('shoot_project_id'), 'is.null');
});

test('公開回條只回傳企劃快照白名單，並相容沒有企劃欄位的舊回條', () => {
  const base = {
    reference: 'PHOX-0123456789ABCDEF0123', createdAt: '2026-10-10T00:00:00Z', status: 'new',
    summary: { name: 'Test', collaborationType: '主題合作', preferredDate: null, description: '測試', referenceLinks: [] },
    confirmation: null,
  };
  const legacy = publicProgress(base);
  assert.equal(legacy.shootProject, null);
  const project = publicProgress({ ...base, shootProject: {
    id: 'test-project', revision: 1, title: '測試企劃', summary: '摘要', area: '台北', dateNote: '另行討論',
    costNote: '已確認', deliveryNote: '已確認', publicationNote: '已確認', admin_notes: '不得外洩',
  } });
  assert.equal(project.shootProject.title, '測試企劃');
  assert.equal(Object.hasOwn(project.shootProject, 'admin_notes'), false);
});
