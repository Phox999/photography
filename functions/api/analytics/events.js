import { endpoint, json, HttpError, readSessionCookies, verifyAdminToken } from '../../../server/auth.js';
import {
  analyticsIdentityForRequest, issueAnalyticsCookie, normalizeAnalyticsBatch,
  recordAnalyticsEvents,
} from '../../../server/site-analytics.js';

const MAX_BODY_BYTES = 12 * 1024;
const CRAWLER_PATTERN = /bot|crawler|spider|slurp|preview|headless|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot/i;

async function readBoundedJson(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, '事件資料過大。', 'analytics_body_too_large');
  }
  if (!request.body) throw new HttpError(400, '事件資料格式不正確。', 'invalid_json');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, '事件資料過大。', 'analytics_body_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpError(400, '事件資料格式不正確。', 'invalid_json'); }
}

async function isVerifiedAdminVisit(request, env) {
  let accessToken;
  try { ({ accessToken } = readSessionCookies({ request, env })); }
  catch (error) {
    if (error instanceof HttpError && error.code === 'https_required') return false;
    throw error;
  }
  if (!accessToken) return false;
  try {
    await verifyAdminToken(env, accessToken);
    return true;
  } catch (error) {
    // Fail closed if the admin session cannot be checked; never add an admin visit to public counts.
    return !(error instanceof HttpError && [401, 403].includes(error.status));
  }
}
function sameOrigin(request) {
  const expected = new URL(request.url).origin;
  return request.headers.get('origin') === expected && request.headers.get('sec-fetch-site') !== 'cross-site';
}

export const onRequest = endpoint(async ({ request, env }) => {
  if (request.method !== 'POST') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'POST' });
  if (!sameOrigin(request)) throw new HttpError(403, '請從本站頁面操作。', 'invalid_origin');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError(415, '事件資料格式不正確。', 'unsupported_media_type');
  }

  const body = await readBoundedJson(request);
  const batch = normalizeAnalyticsBatch(body);
  if (batch.preference === 'clear') {
    const cookie = await issueAnalyticsCookie(request, env, null, { clear: true });
    return json({ success: true, cleared: true }, 200, { 'Set-Cookie': cookie });
  }
  const { identity, cookie } = await analyticsIdentityForRequest(request, env);
  if (batch.preference) {
    identity.optOut = batch.preference === 'disabled';
    const preferenceCookie = await issueAnalyticsCookie(request, env, identity);
    return json({ success: true, enabled: !identity.optOut }, 200, { 'Set-Cookie': preferenceCookie });
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (CRAWLER_PATTERN.test(userAgent)) {
    return json({ accepted: 0, filtered: true }, 202, { 'Set-Cookie': cookie });
  }
  if (await isVerifiedAdminVisit(request, env)) return json({ accepted: 0, filtered: true }, 202, { 'Set-Cookie': cookie });
  if (identity.optOut) return json({ accepted: 0, optedOut: true }, 202, { 'Set-Cookie': cookie });

  try {
    const result = await recordAnalyticsEvents(env, identity, batch.events, batch.landing, batch.device);
    const rateLimited = result.data?.rate_limited === true;
    return json(
      { accepted: Number(result.data?.accepted) || 0, rateLimited },
      rateLimited ? 429 : 202,
      { 'Set-Cookie': cookie, ...(rateLimited ? { 'Retry-After': '60' } : {}) },
    );
  } catch (error) {
    console.error('Site analytics write failed', error instanceof HttpError ? error.code : 'upstream_unavailable');
    return json({ accepted: 0, error: 'analytics_unavailable' }, 503, { 'Set-Cookie': cookie });
  }
});
