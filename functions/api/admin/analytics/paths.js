import { endpoint, HttpError, json } from '../../../../server/auth.js';
import { analyticsAdminFilters, callAnalyticsJourneyRpc, requireAnalyticsAdmin, ANALYTICS_TIMEZONE } from '../../../../server/site-analytics-admin.js';

export const onRequest = endpoint(async ({ request, env }) => {
  if (request.method !== 'GET') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'GET' });
  const { config } = await requireAnalyticsAdmin(request, env);
  const filters = analyticsAdminFilters(new URL(request.url).searchParams);
  if (filters.cursorAt || filters.cursorId) throw new HttpError(400, '頁面表現不接受造訪分頁游標。', 'analytics_cursor_invalid');
  const { data } = await callAnalyticsJourneyRpc(config, 'get_site_analytics_paths', {
    p_start: filters.range.start,
    p_end: filters.range.end,
    p_page_path: filters.pagePath,
    p_source: filters.source,
    p_device: filters.device,
    p_result: filters.result,
    p_visitor_prefix: filters.visitorPrefix,
    p_limit: Math.min(50, filters.limit),
  });
  if (!data || !Array.isArray(data.pages) || !Array.isArray(data.transitions)) {
    throw new HttpError(503, '頁面表現資料格式尚未就緒。', 'analytics_paths_invalid');
  }
  return json({ range: filters.range, timezone: ANALYTICS_TIMEZONE, ...data });
});
