import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyticsIdentityForRequest,
  existingAnalyticsIdentity,
  normalizeAnalyticsBatch,
  normalizeAnalyticsEvent,
  normalizePublicAnalyticsPath,
  resolveAnalyticsRange,
} from '../server/site-analytics.js';
import { onRequest as collectAnalyticsEvents } from '../functions/api/analytics/events.js';
import { onRequest as analyticsReport } from '../functions/api/admin/analytics.js';
import { onRequest as submitInquiry } from '../functions/api/inquiries.js';

const secret = 'test-only-secret-that-is-long-enough-32-bytes';
const eventId = '10000000-0000-4000-8000-000000000001';
const testEnv = {
  SITE_ANALYTICS_COOKIE_SECRET: secret,
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_123456789',
};
const eventBody = { events: [{ id: eventId, name: 'page_view', path: '/' }] };
const analyticsRequest = (body, headers = {}) => new Request('https://phox999.com/api/analytics/events', {
  method: 'POST', headers: { origin: 'https://phox999.com', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('公開路徑只允許白名單頁面，並拒絕私密、query 和編碼繞過路徑', () => {
  assert.equal(normalizePublicAnalyticsPath('/portfolio/portrait-set'), '/portfolio/portrait-set/');
  assert.equal(normalizePublicAnalyticsPath('/projects/preview'), null);
  assert.equal(normalizePublicAnalyticsPath('/cooperation-status/#token=secret'), null);
  assert.equal(normalizePublicAnalyticsPath('/portfolio/item/?token=secret'), null);
  assert.equal(normalizePublicAnalyticsPath('/%61dmin/'), null);
});

test('現有作品頁的空白、加號與 emoji 路徑能正常量測，仍拒絕私密 query 與跨層路徑', () => {
  for (const slug of ['260827_敦煌 RE', '260228_KTM Malaysia+Lalaport RE', '🌙']) {
    assert.equal(normalizePublicAnalyticsPath('/portfolio/' + encodeURIComponent(slug) + '/'), '/portfolio/' + slug + '/');
  }
  assert.equal(normalizePublicAnalyticsPath('/portfolio/works%3Ftoken%3Dsecret/'), null);
  assert.equal(normalizePublicAnalyticsPath('/portfolio/works%2Fprivate/'), null);
});

test('已簽署的停用偏好與 crawler 請求都不寫入事件資料庫', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { assert.fail('filtered visits must not access the database'); };
  const disabled = await collectAnalyticsEvents({ request: analyticsRequest({ preference: 'disabled' }), env: testEnv });
  const cookie = disabled.headers.get('set-cookie').split(';', 1)[0];
  const response = await collectAnalyticsEvents({ request: analyticsRequest(eventBody, { cookie }), env: testEnv });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).optedOut, true);
  const crawler = await collectAnalyticsEvents({ request: analyticsRequest(eventBody, { 'user-agent': 'Googlebot' }), env: testEnv });
  assert.equal((await crawler.json()).filtered, true);
});

test('事件 API 拒絕過大 payload 與不正確的 Content-Type', async () => {
  const oversized = await collectAnalyticsEvents({ request: analyticsRequest({ padding: 'x'.repeat(13 * 1024) }), env: {} });
  assert.equal(oversized.status, 413);
  const unsupported = await collectAnalyticsEvents({ request: analyticsRequest(eventBody, { 'content-type': 'text/plain' }), env: {} });
  assert.equal(unsupported.status, 415);
});

test('後台報表沒有管理員 session 時拒絕存取', async () => {
  const response = await analyticsReport({ request: new Request('https://phox999.com/api/admin/analytics'), env: {} });
  assert.equal(response.status, 401);
});

test('已收件回條重試時，歸因服務失敗仍回傳原收件成功', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  context.after(() => { globalThis.fetch = originalFetch; console.error = originalError; });
  console.error = () => {};
  const identity = await analyticsIdentityForRequest(new Request('https://phox999.com/'), testEnv);
  let attributionWrites = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/rpc/record_site_analytics_inquiry_v2')) {
      attributionWrites += 1;
      return new Response('{}', { status: 503 });
    }
    return new Response(JSON.stringify({ reference: 'PHOX-0123456789ABCDEF0123', createdAt: '2026-10-10T00:00:00Z', created: false }), { status: 200 });
  };
  const request = new Request('https://phox999.com/api/inquiries', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: identity.cookie.split(';', 1)[0] },
    body: JSON.stringify({
      name: 'Synthetic Test', contact_method: 'Instagram', contact_account: '@test', collaboration_type: '主題合作',
      shoot_project_id: 'city-night-portrait', shoot_project_revision: 1,
      preferred_date: '', description: '', reference_links: [], consent: true,
      submission_id: '00000000-0000-4000-8000-000000000001', receipt_token: 'a'.repeat(64),
    }),
  });
  const pending = [];
  const response = await submitInquiry({ request, env: testEnv, waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).receipt.reference, 'PHOX-0123456789ABCDEF0123');
  assert.equal(attributionWrites, 1);
});

test('事件驗證拒絕表單內容和任意事件參數，來源只保留分類與有限活動 slug', () => {
  assert.throws(() => normalizeAnalyticsEvent({
    id: eventId, name: 'page_view', path: '/', email: 'private@example.com',
  }));

  const batch = normalizeAnalyticsBatch({
    events: [{ id: eventId, name: 'page_view', path: '/' }],
    landing: { utmSource: 'instagram', utmMedium: 'story', utmCampaign: 'autumn_2026', referrerHost: 'private.example/path?q=secret' },
    device: 'mobile',
  });
  assert.deepEqual(batch.landing, { source: 'instagram', medium: 'story', campaign: 'autumn_2026' });

  const referral = normalizeAnalyticsBatch({
    events: [{ id: eventId, name: 'page_view', path: '/' }],
    landing: { referrerHost: 'sub.example.com' },
    device: 'unknown',
  });
  assert.deepEqual(referral.landing, { source: 'other', medium: 'referral', campaign: null });
});

test('台北時間區間從午夜切分，自訂日期拒絕無效日期及超過 90 天', () => {
  const now = new Date('2026-10-17T01:00:00.000Z');
  const today = resolveAnalyticsRange(new URLSearchParams('range=today'), now);
  assert.equal(today.start, '2026-10-16T16:00:00.000Z');
  assert.equal(today.end, now.toISOString());
  assert.equal(today.isCurrentDay, true);

  const yesterday = resolveAnalyticsRange(new URLSearchParams('range=yesterday'), now);
  assert.equal(yesterday.start, '2026-10-15T16:00:00.000Z');
  assert.equal(yesterday.end, '2026-10-16T16:00:00.000Z');

  assert.throws(() => resolveAnalyticsRange(new URLSearchParams('range=custom&start=2026-02-30&end=2026-03-01'), now));
  assert.throws(() => resolveAnalyticsRange(new URLSearchParams('range=custom&start=2026-07-01&end=2026-10-17'), now));
  assert.throws(() => resolveAnalyticsRange(new URLSearchParams('range=custom&start=2026-01-01&end=2026-01-02'), now), /保留範圍/);
});

test('簽署 cookie 跨頁保持訪客，閒置逾 30 分鐘建立新 session，偽造簽章不沿用識別', async () => {
  const env = { SITE_ANALYTICS_COOKIE_SECRET: secret };
  const now = Date.parse('2026-10-17T01:00:00.000Z');
  const initial = await analyticsIdentityForRequest(new Request('https://phox999.com/'), env, now);
  const cookie = initial.cookie.split(';', 1)[0];

  const withinSession = await existingAnalyticsIdentity(new Request('https://phox999.com/portfolio/', { headers: { cookie } }), env, now + 29 * 60_000);
  assert.equal(withinSession.identity.visitorId, initial.identity.visitorId);
  assert.equal(withinSession.identity.sessionId, initial.identity.sessionId);

  const afterIdle = await existingAnalyticsIdentity(new Request('https://phox999.com/portfolio/', { headers: { cookie } }), env, now + 31 * 60_000);
  assert.equal(afterIdle.identity.visitorId, initial.identity.visitorId);
  assert.notEqual(afterIdle.identity.sessionId, initial.identity.sessionId);

  const forged = cookie.replace(/.$/, (lastCharacter) => lastCharacter === 'A' ? 'B' : 'A');
  assert.equal(await existingAnalyticsIdentity(new Request('https://phox999.com/', { headers: { cookie: forged } }), env, now), null);
});

test('事件 API 拒絕跨來源，接受同來源的最小合法批次並回傳 HttpOnly cookie', async () => {
  const originalFetch = globalThis.fetch;
  let rpcCalls = 0;
  globalThis.fetch = async (input) => {
    rpcCalls += 1;
    assert.match(String(input), /\/rest\/v1\/rpc\/record_site_analytics_events$/);
    return new Response(JSON.stringify({ accepted: 1, rate_limited: false }), { status: 200 });
  };

  try {
    const env = {
      AUTH_ALLOW_LOCALHOST: 'true',
      SITE_ANALYTICS_COOKIE_SECRET: secret,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test_key_123456789',
    };
    const body = JSON.stringify({
      events: [{ id: eventId, name: 'page_view', path: '/', clientAt: new Date().toISOString() }],
      landing: { referrerHost: '' }, device: 'desktop',
    });
    const rejected = await collectAnalyticsEvents({
      request: new Request('http://localhost/api/analytics/events', {
        method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body,
      }), env,
    });
    assert.equal(rejected.status, 403);
    assert.equal(rpcCalls, 0);

    const accepted = await collectAnalyticsEvents({
      request: new Request('http://localhost/api/analytics/events', {
        method: 'POST', headers: { origin: 'http://localhost', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, body,
      }), env,
    });
    assert.equal(accepted.status, 202);
    assert.equal(rpcCalls, 1);
    assert.match(accepted.headers.get('set-cookie') || '', /HttpOnly/);
    assert.match(accepted.headers.get('set-cookie') || '', /SameSite=Lax/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
