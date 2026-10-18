import { endpoint, HttpError, json } from '../../../../../../server/auth.js';
import { analyticsAdminFilters, callAnalyticsJourneyRpc, requireAnalyticsAdmin, ANALYTICS_TIMEZONE } from '../../../../../../server/site-analytics-admin.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const onRequest = endpoint(async ({ request, env, params }) => {
  if (request.method !== 'GET') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'GET' });
  const { config } = await requireAnalyticsAdmin(request, env);
  if (!UUID_PATTERN.test(params.id || '')) throw new HttpError(400, '訪客識別碼不正確。', 'analytics_id_invalid');
  const filters = analyticsAdminFilters(new URL(request.url).searchParams);
  const { data } = await callAnalyticsJourneyRpc(config, 'get_site_analytics_sessions', {
    p_start: filters.range.start,
    p_end: filters.range.end,
    p_source: filters.source,
    p_device: filters.device,
    p_page_path: filters.pagePath,
    p_result: filters.result,
    p_visitor_prefix: filters.visitorPrefix,
    p_cursor_at: filters.cursorAt,
    p_cursor_id: filters.cursorId,
    p_limit: filters.limit,
    p_visitor_id: params.id.toLowerCase(),
  });
  if (!data || !Array.isArray(data.items) || !Number.isInteger(data.total)) {
    throw new HttpError(503, '訪客歷程資料格式尚未就緒。', 'analytics_visitor_history_invalid');
  }
  return json({
    visitorId: params.id.toLowerCase(),
    range: filters.range,
    timezone: ANALYTICS_TIMEZONE,
    filters: { source: filters.source, device: filters.device, pagePath: filters.pagePath, result: filters.result, visitorPrefix: filters.visitorPrefix },
    items: data.items,
    total: data.total,
    nextCursor: data.nextCursor || null,
  });
});
