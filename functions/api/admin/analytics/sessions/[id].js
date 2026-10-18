import { endpoint, HttpError, json } from '../../../../../server/auth.js';
import { callAnalyticsJourneyRpc, requireAnalyticsAdmin } from '../../../../../server/site-analytics-admin.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const onRequest = endpoint(async ({ request, env, params }) => {
  if (request.method !== 'GET') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'GET' });
  const { config } = await requireAnalyticsAdmin(request, env);
  if (!UUID_PATTERN.test(params.id || '')) throw new HttpError(400, '造訪識別碼不正確。', 'analytics_id_invalid');
  const { data } = await callAnalyticsJourneyRpc(config, 'get_site_analytics_session_detail', {
    p_session_id: params.id.toLowerCase(),
  });
  if (!data || !data.session || !Array.isArray(data.events) || !Array.isArray(data.inquiries)) {
    throw new HttpError(503, '造訪詳情格式尚未就緒。', 'analytics_session_detail_invalid');
  }
  return json(data);
});
