import { HttpError, getSecretConfig, requireAdmin, supabaseRequest } from './auth.js';
import { normalizePublicAnalyticsPath, resolveAnalyticsRange } from './site-analytics.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCES = new Set(['direct', 'instagram', 'threads', 'facebook', 'google', 'other']);
const DEVICES = new Set(['mobile', 'tablet', 'desktop', 'unknown']);
const RESULTS = new Set(['portfolio_no_form_start', 'cta_no_form_start', 'submit_error', 'error_then_success']);

export async function requireAnalyticsAdmin(request, env) {
  const admin = await requireAdmin({ request, env });
  return { admin, config: getSecretConfig(env) };
}

export function analyticsAdminFilters(searchParams, { allowResult = true, allowTransition = false } = {}) {
  const range = resolveAnalyticsRange(searchParams);
  const rawSource = searchParams.get('source');
  const rawDevice = searchParams.get('device');
  const rawPage = searchParams.get('page');
  const rawResult = searchParams.get('result');
  const rawVisitor = searchParams.get('visitor');
  const rawTransitionFrom = searchParams.get('transition_from');
  const rawTransitionTo = searchParams.get('transition_to');
  const limitRaw = searchParams.get('limit');
  const cursorAtRaw = searchParams.get('cursor_at');
  const cursorIdRaw = searchParams.get('cursor_id');
  if (rawSource !== null && !SOURCES.has(rawSource)) throw new HttpError(400, '來源篩選不正確。', 'analytics_filter_invalid');
  if (rawDevice !== null && !DEVICES.has(rawDevice)) throw new HttpError(400, '裝置篩選不正確。', 'analytics_filter_invalid');
  if (!allowResult && rawResult !== null) throw new HttpError(400, '頁面查詢不支援這個結果篩選。', 'analytics_filter_invalid');
  if (rawResult !== null && !RESULTS.has(rawResult)) throw new HttpError(400, '結果篩選不正確。', 'analytics_filter_invalid');
  if (!allowTransition && (rawTransitionFrom !== null || rawTransitionTo !== null)) {
    throw new HttpError(400, '此查詢不支援頁面流向篩選。', 'analytics_filter_invalid');
  }
  if ((rawTransitionFrom === null) !== (rawTransitionTo === null)) {
    throw new HttpError(400, '頁面流向篩選不完整。', 'analytics_filter_invalid');
  }

  let pagePath = null;
  if (rawPage !== null) {
    pagePath = normalizePublicAnalyticsPath(rawPage);
    if (!pagePath) throw new HttpError(400, '公開頁面篩選不正確。', 'analytics_filter_invalid');
  }

  let transitionFrom = null;
  let transitionTo = null;
  if (rawTransitionFrom !== null) {
    transitionFrom = normalizePublicAnalyticsPath(rawTransitionFrom);
    transitionTo = normalizePublicAnalyticsPath(rawTransitionTo || '');
    if (!transitionFrom || !transitionTo) throw new HttpError(400, '頁面流向篩選不正確。', 'analytics_filter_invalid');
  }

  let visitorPrefix = null;
  if (rawVisitor !== null && rawVisitor.trim()) {
    const code = rawVisitor.trim().replace(/^v-/i, '').toLowerCase();
    if (!/^[0-9a-f]{1,6}$/.test(code)) throw new HttpError(400, '訪客代碼格式不正確。', 'analytics_filter_invalid');
    visitorPrefix = code;
  }

  let cursorAt = null;
  let cursorId = null;
  if ((cursorAtRaw === null) !== (cursorIdRaw === null)) throw new HttpError(400, '分頁游標不完整。', 'analytics_cursor_invalid');
  if (cursorAtRaw !== null) {
    const time = Date.parse(cursorAtRaw);
    if (cursorAtRaw.length > 40
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/i.test(cursorAtRaw)
      || !Number.isFinite(time) || !UUID_PATTERN.test(cursorIdRaw || '')) {
      throw new HttpError(400, '分頁游標格式不正確。', 'analytics_cursor_invalid');
    }
    // Preserve sub-millisecond precision from PostgreSQL so equal-time keyset pages cannot skip rows.
    cursorAt = cursorAtRaw;
    cursorId = cursorIdRaw.toLowerCase();
  }

  const limit = limitRaw === null ? 25 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(400, '每頁筆數必須介於 1 到 50。', 'analytics_limit_invalid');
  return {
    range,
    source: rawSource,
    device: rawDevice,
    pagePath,
    transitionFrom,
    transitionTo,
    result: allowResult ? rawResult : null,
    visitorPrefix,
    cursorAt,
    cursorId,
    limit,
  };
}

export async function callAnalyticsJourneyRpc(config, rpcName, body) {
  try {
    return await supabaseRequest(config, `/rest/v1/rpc/${rpcName}`, { method: 'POST', body });
  } catch (error) {
    if (error instanceof HttpError && error.code === 'upstream_http_404') {
      throw new HttpError(503, '訪客旅程查詢尚未啟用；原有報表仍可使用。', 'analytics_journeys_unavailable');
    }
    throw error;
  }
}

export const ANALYTICS_TIMEZONE = 'Asia/Taipei';
