import { endpoint, HttpError, json } from '../../../../server/auth.js';
import { analyticsAdminFilters, callAnalyticsJourneyRpc, requireAnalyticsAdmin, ANALYTICS_TIMEZONE } from '../../../../server/site-analytics-admin.js';

export const onRequest = endpoint(async ({ request, env, performanceTimings }) => {
  if (request.method !== 'GET') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'GET' });
  const { config } = await requireAnalyticsAdmin(request, env, performanceTimings);
  const filters = analyticsAdminFilters(new URL(request.url).searchParams, { allowResult: false, allowTransition: true });
  if (filters.cursorAt || filters.cursorId) throw new HttpError(400, '現象統計不接受造訪分頁游標。', 'analytics_cursor_invalid');
  const { data } = await callAnalyticsJourneyRpc(config, 'get_site_analytics_observation_counts', {
    p_start: filters.range.start,
    p_end: filters.range.end,
    p_source: filters.source,
    p_device: filters.device,
    p_page_path: filters.pagePath,
    p_visitor_prefix: filters.visitorPrefix,
    p_transition_from: filters.transitionFrom,
    p_transition_to: filters.transitionTo,
  });
  const keys = ['portfolio_no_form_start', 'cta_no_form_start', 'submit_error', 'error_then_success'];
  const values = [data?.total, ...keys.map((key) => data?.counts?.[key])];
  if (!data || !data.counts || values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new HttpError(503, '造訪現象統計格式尚未就緒。', 'analytics_observation_counts_invalid');
  }
  return json({
    range: filters.range,
    timezone: ANALYTICS_TIMEZONE,
    filters: { source: filters.source, device: filters.device, pagePath: filters.pagePath, visitorPrefix: filters.visitorPrefix, transitionFrom: filters.transitionFrom, transitionTo: filters.transitionTo },
    total: data.total,
    counts: data.counts,
  });
});
