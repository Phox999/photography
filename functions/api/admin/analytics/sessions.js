import { endpoint, HttpError, json } from '../../../../server/auth.js';
import { analyticsAdminFilters, callAnalyticsJourneyRpc, requireAnalyticsAdmin, ANALYTICS_TIMEZONE } from '../../../../server/site-analytics-admin.js';

export const onRequest = endpoint(async ({ request, env }) => {
  if (request.method !== 'GET') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'GET' });
  const { config } = await requireAnalyticsAdmin(request, env);
  const filters = analyticsAdminFilters(new URL(request.url).searchParams, { allowTransition: true });
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
    p_visitor_id: null,
    p_transition_from: filters.transitionFrom,
    p_transition_to: filters.transitionTo,
  });
  if (!data || !Array.isArray(data.items) || !Number.isInteger(data.total)) {
    throw new HttpError(503, '造訪資料格式尚未就緒。', 'analytics_sessions_invalid');
  }
  return json({
    range: filters.range,
    timezone: ANALYTICS_TIMEZONE,
    filters: {
      source: filters.source, device: filters.device, pagePath: filters.pagePath,
      result: filters.result, visitorPrefix: filters.visitorPrefix,
      transitionFrom: filters.transitionFrom, transitionTo: filters.transitionTo,
    },
    items: data.items,
    total: data.total,
    nextCursor: data.nextCursor || null,
  });
});
