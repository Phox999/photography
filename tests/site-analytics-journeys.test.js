import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest as analyticsEvents } from '../functions/api/analytics/events.js';
import { onRequest as analyticsSessions } from '../functions/api/admin/analytics/sessions.js';
import { onRequest as analyticsSessionDetail } from '../functions/api/admin/analytics/sessions/[id].js';
import { onRequest as analyticsVisitorSessions } from '../functions/api/admin/analytics/visitors/[id]/sessions.js';
import { onRequest as analyticsPaths } from '../functions/api/admin/analytics/paths.js';
import { onRequest as analyticsObservationCounts } from '../functions/api/admin/analytics/observation-counts.js';
import worker from '../worker.js';
import { HttpError } from '../server/auth.js';
import { analyticsAdminFilters, callAnalyticsJourneyRpc } from '../server/site-analytics-admin.js';
import {
  analyticsIdentityForRequest,
  normalizeAnalyticsBatch,
  normalizeAnalyticsEvent,
  recordAnalyticsEvents,
} from '../server/site-analytics.js';

const secret = 'journey-test-cookie-secret-with-at-least-32-bytes';
const ids = {
  event: '20000000-0000-4000-8000-000000000001',
  visit: '20000000-0000-4000-8000-000000000002',
  tab: '20000000-0000-4000-8000-000000000003',
  document: '20000000-0000-4000-8000-000000000004',
  form: '20000000-0000-4000-8000-000000000005',
};

function v2Event(name, attributes = {}) {
  return normalizeAnalyticsEvent({
    id: ids.event,
    name,
    path: '/portfolio/',
    clientAt: new Date().toISOString(),
    schemaVersion: 2,
    pageVisitId: ids.visit,
    tabId: ids.tab,
    documentId: ids.document,
    eventSeq: 1,
    tabSeq: 1,
    ...attributes,
  });
}

test('v1 事件仍可正規化，v2 必須帶頁面、分頁與事件序號', () => {
  const legacy = normalizeAnalyticsEvent({ id: ids.event, name: 'page_view', path: '/' });
  assert.equal(legacy.schema_version, 1);
  assert.equal(legacy.page_visit_id, null);

  const current = v2Event('page_view');
  assert.equal(current.schema_version, 2);
  assert.equal(current.page_visit_id, ids.visit);
  assert.equal(current.tab_seq, 1);
  assert.throws(() => normalizeAnalyticsEvent({
    id: ids.event, name: 'page_view', path: '/', schemaVersion: 2, pageVisitId: ids.visit,
  }));
  assert.throws(() => normalizeAnalyticsEvent({ id: ids.event, name: 'page_view', path: '/', visitorId: ids.tab }));
});

test('表單 v2 事件綁定 form_instance，步驟代碼與 CTA 可視門檻受限', () => {
  assert.throws(() => v2Event('form_start'));
  assert.equal(v2Event('form_start', { formInstanceId: ids.form }).form_instance_id, ids.form);
  assert.equal(v2Event('form_step_enter', { formInstanceId: ids.form, stepId: 'styles' }).step_id, 'styles');
  assert.throws(() => v2Event('form_step_enter', { formInstanceId: ids.form, stepId: 'contact_account' }));
  assert.equal(v2Event('cta_view', { placement: 'hero', visiblePercent: 50, visibleMs: 1000 }).visible_ms, 1000);
  assert.equal(v2Event('cta_view', { placement: 'hero', visiblePercent: 100, visibleMs: 60000 }).visible_ms, 60000);
  assert.throws(() => v2Event('cta_view', { placement: 'hero', visiblePercent: 49, visibleMs: 999 }));
  assert.throws(() => normalizeAnalyticsEvent({ id: ids.event, name: 'cta_view', path: '/', placement: 'hero' }));
});

test('首次 bootstrap 只設定簽章 Cookie，不呼叫資料庫；停用 Cookie 維持停用狀態', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('bootstrap must not write to the database');
  context.after(() => { globalThis.fetch = originalFetch; });
  const env = { SITE_ANALYTICS_COOKIE_SECRET: secret };
  const request = (body, cookie = '') => new Request('https://phox999.com/api/analytics/events', {
    method: 'POST',
    headers: { origin: 'https://phox999.com', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const first = await analyticsEvents({ request: request({ bootstrap: true }), env });
  assert.equal(first.status, 202);
  assert.equal((await first.json()).ready, true);
  const cookie = first.headers.get('set-cookie').split(';', 1)[0];
  const disabled = await analyticsEvents({ request: request({ preference: 'disabled' }, cookie), env });
  const disabledCookie = disabled.headers.get('set-cookie').split(';', 1)[0];
  const secondBootstrap = await analyticsEvents({ request: request({ bootstrap: true }, disabledCookie), env });
  assert.equal((await secondBootstrap.json()).optedOut, true);
});

test('v2 RPC 缺席時沿用 v1 可辨識事件，並略過 v2 專屬曝光／步驟事件', async (context) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return requests.length === 1
      ? new Response(JSON.stringify({ code: 'PGRST202', message: 'function not found' }), { status: 404 })
      : new Response(JSON.stringify({ accepted: 1, rate_limited: false }), { status: 200 });
  };
  context.after(() => { globalThis.fetch = originalFetch; });
  const events = [
    v2Event('page_view'),
    v2Event('cta_view', { id: '20000000-0000-4000-8000-000000000006', eventSeq: 2, placement: 'hero', visiblePercent: 50, visibleMs: 1000 }),
    v2Event('form_step_enter', { id: '20000000-0000-4000-8000-000000000007', eventSeq: 3, formInstanceId: ids.form, stepId: 'styles' }),
    v2Event('form_submit_error', { id: '20000000-0000-4000-8000-000000000008', eventSeq: 4, formInstanceId: ids.form, errorCode: 'network' }),
    v2Event('inquiry_cta_click', { id: '20000000-0000-4000-8000-000000000009', eventSeq: 5, placement: 'contact-icon', destination: 'google_form' }),
  ];
  const result = await recordAnalyticsEvents({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test_key_123456789' },
    { visitorId: '20000000-0000-4000-8000-000000000010', sessionId: '20000000-0000-4000-8000-000000000011' },
    events, { source: 'direct', medium: null, campaign: null }, 'desktop');
  assert.equal(result.data.accepted, 1);
  assert.match(requests[0].url, /record_site_analytics_events_v2$/);
  assert.match(requests[1].url, /record_site_analytics_events$/);
  assert.deepEqual(requests[1].body.p_events.map((event) => event.event_name), ['page_view', 'form_submit_error', 'inquiry_cta_click']);
  assert.equal(requests[1].body.p_events[1].schema_version, undefined);
  assert.equal(requests[1].body.p_events[1].form_instance_id, undefined);
  assert.equal(requests[1].body.p_events[2].placement, 'other', 'new v2 placements map to a v1 allowlisted value');
});

test('新旅程與現象統計 API 全部要求管理員 session 且回應不快取', async () => {
  const routes = [
    [analyticsSessions, 'https://phox999.com/api/admin/analytics/sessions'],
    [analyticsSessionDetail, 'https://phox999.com/api/admin/analytics/sessions/20000000-0000-4000-8000-000000000001'],
    [analyticsVisitorSessions, 'https://phox999.com/api/admin/analytics/visitors/20000000-0000-4000-8000-000000000001/sessions'],
    [analyticsPaths, 'https://phox999.com/api/admin/analytics/paths'],
    [analyticsObservationCounts, 'https://phox999.com/api/admin/analytics/observation-counts'],
  ];
  for (const [handler, url] of routes) {
    const response = await handler({ request: new Request(url), env: {} , params: { id: '20000000-0000-4000-8000-000000000001' } });
    assert.equal(response.status, 401, url);
    assert.match(response.headers.get('cache-control') || '', /no-store/i, url);
  }
});

test('Worker 明確路由註冊新旅程與現象統計端點，未登入請求均被拒絕', async () => {
  const urls = [
    'https://phox999.com/api/admin/analytics/sessions',
    'https://phox999.com/api/admin/analytics/sessions/20000000-0000-4000-8000-000000000001',
    'https://phox999.com/api/admin/analytics/visitors/20000000-0000-4000-8000-000000000001/sessions',
    'https://phox999.com/api/admin/analytics/paths',
    'https://phox999.com/api/admin/analytics/observation-counts',
  ];
  for (const url of urls) {
    const response = await worker.fetch(new Request(url), {}, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 401, url);
    assert.match(response.headers.get('cache-control') || '', /no-store/i, url);
  }
});

test('管理員篩選驗證拒絕私人路徑、錯誤代碼與不完整游標', () => {
  const valid = analyticsAdminFilters(new URLSearchParams('range=today&source=instagram&device=mobile&result=submit_error&visitor=V-ABC123&limit=25'));
  assert.equal(valid.source, 'instagram');
  assert.equal(valid.visitorPrefix, 'abc123');
  const cursorTime = '2026-10-17T01:02:03.123456+00:00';
  const cursor = analyticsAdminFilters(new URLSearchParams('range=today&cursor_at=' + encodeURIComponent(cursorTime) + '&cursor_id=20000000-0000-4000-8000-000000000001'));
  assert.equal(cursor.cursorAt, cursorTime, 'PostgreSQL cursor precision is preserved');
  assert.throws(() => analyticsAdminFilters(new URLSearchParams('range=today&page=%2Fadmin%2F')));
  assert.throws(() => analyticsAdminFilters(new URLSearchParams('range=today&result=guess')));
  assert.throws(() => analyticsAdminFilters(new URLSearchParams('range=today&cursor_at=2026-10-17T00%3A00%3A00.000Z')));
});

test('頁面流向篩選只允許成對公開路徑', () => {
  const filters = analyticsAdminFilters(new URLSearchParams(
    'range=today&page=%2Fcooperation%2F&transition_from=%2Fportfolio%2F&transition_to=%2Fcooperation%2F',
  ), { allowTransition: true });
  assert.equal(filters.transitionFrom, '/portfolio/');
  assert.equal(filters.transitionTo, '/cooperation/');
  assert.throws(() => analyticsAdminFilters(new URLSearchParams('range=today&transition_from=%2Fportfolio%2F'), { allowTransition: true }));
  assert.throws(() => analyticsAdminFilters(new URLSearchParams('range=today&transition_from=%2Fadmin%2F&transition_to=%2Fcooperation%2F'), { allowTransition: true }));
  assert.throws(() => analyticsAdminFilters(new URLSearchParams('range=today&transition_from=%2Fportfolio%2F&transition_to=%2Fcooperation%2F')));
});

test('造訪流向鑽取將 from/to 路徑傳入管理員 RPC 並回傳 no-store 清單', async (context) => {
  const originalFetch = globalThis.fetch;
  let rpcBody = null;
  const userId = '20000000-0000-4000-8000-000000000099';
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/auth/v1/user') {
      return new Response(JSON.stringify({ id: userId, email: 'admin@example.invalid', email_confirmed_at: '2026-10-18T00:00:00Z' }), { status: 200 });
    }
    if (parsed.pathname === '/rest/v1/site_admins') {
      return new Response(JSON.stringify([{ user_id: userId, active: true }]), { status: 200 });
    }
    if (parsed.pathname === '/rest/v1/rpc/get_site_analytics_sessions') {
      rpcBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ items: [], total: 0, nextCursor: null }), { status: 200 });
    }
    assert.fail('unexpected synthetic upstream request: ' + parsed.pathname);
  };
  context.after(() => { globalThis.fetch = originalFetch; });
  const response = await analyticsSessions({
    request: new Request('https://phox999.com/api/admin/analytics/sessions?range=today&page=%2Fcooperation%2F&transition_from=%2Fportfolio%2F&transition_to=%2Fcooperation%2F', {
      headers: { cookie: '__Host-phox-access=synthetic-admin-session' },
    }),
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test_key',
      SUPABASE_SECRET_KEY: 'sb_secret_synthetic_test_key',
    },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /no-store/i);
  assert.equal(rpcBody.p_transition_from, '/portfolio/');
  assert.equal(rpcBody.p_transition_to, '/cooperation/');
  assert.equal(rpcBody.p_page_path, '/cooperation/');
});

test('現象統計只呼叫一次聚合 RPC，並回傳分段管理員時序', async (context) => {
  const originalFetch = globalThis.fetch;
  let rpcCount = 0;
  let rpcBody = null;
  const userId = '20000000-0000-4000-8000-000000000099';
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/auth/v1/user') {
      return new Response(JSON.stringify({ id: userId, email: 'admin@example.invalid', email_confirmed_at: '2026-10-18T00:00:00Z' }), { status: 200 });
    }
    if (parsed.pathname === '/rest/v1/site_admins') {
      return new Response(JSON.stringify([{ user_id: userId, active: true }]), { status: 200 });
    }
    if (parsed.pathname === '/rest/v1/rpc/get_site_analytics_observation_counts') {
      rpcCount += 1;
      rpcBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        total: 12,
        counts: { portfolio_no_form_start: 5, cta_no_form_start: 3, submit_error: 2, error_then_success: 1 },
      }), { status: 200 });
    }
    assert.fail('unexpected synthetic upstream request: ' + parsed.pathname);
  };
  context.after(() => { globalThis.fetch = originalFetch; });
  const response = await analyticsObservationCounts({
    request: new Request('https://phox999.com/api/admin/analytics/observation-counts?range=today&source=instagram&page=%2Fcooperation%2F&transition_from=%2Fportfolio%2F&transition_to=%2Fcooperation%2F', {
      headers: { cookie: '__Host-phox-access=synthetic-admin-session' },
    }),
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test_key',
      SUPABASE_SECRET_KEY: 'sb_secret_synthetic_test_key',
    },
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(rpcCount, 1);
  assert.equal(rpcBody.p_source, 'instagram');
  assert.equal(rpcBody.p_page_path, '/cooperation/');
  assert.equal(rpcBody.p_transition_from, '/portfolio/');
  assert.equal(rpcBody.p_transition_to, '/cooperation/');
  assert.equal(result.total, 12);
  assert.equal(result.counts.submit_error, 2);
  assert.match(response.headers.get('server-timing') || '', /user_check;dur=/);
  assert.match(response.headers.get('server-timing') || '', /admin_allowlist;dur=/);
  assert.match(response.headers.get('server-timing') || '', /business_rpc;dur=/);
});

test('缺少旅程 RPC 以明確降級錯誤回報，保留舊報表路徑', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'PGRST202', message: 'function not found' }), { status: 404 });
  context.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(
    callAnalyticsJourneyRpc({ url: 'https://project.supabase.co', key: 'sb_secret_test_key_123456789' }, 'get_site_analytics_sessions', {}),
    (error) => error instanceof HttpError && error.code === 'analytics_journeys_unavailable',
  );
});

test('bootstrap 僅接受單一欄位，事件批次不接受瀏覽器指定 visitor/session ID', async () => {
  assert.deepEqual(normalizeAnalyticsBatch({ bootstrap: true }), { bootstrap: true });
  assert.throws(() => normalizeAnalyticsBatch({ bootstrap: true, device: 'mobile' }));
  assert.throws(() => normalizeAnalyticsBatch({
    events: [{ id: ids.event, name: 'page_view', path: '/', visitorId: ids.tab }],
  }));
  const identity = await analyticsIdentityForRequest(new Request('https://phox999.com/'), { SITE_ANALYTICS_COOKIE_SECRET: secret });
  assert.match(identity.identity.visitorId, /^[0-9a-f-]{36}$/i);
});
