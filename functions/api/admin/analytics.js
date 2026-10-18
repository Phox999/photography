import { endpoint, json, requireAdmin, getSecretConfig, supabaseRequest, HttpError } from '../../../server/auth.js';
import { resolveAnalyticsRange } from '../../../server/site-analytics.js';

async function loadReport(config, start, end, hourly) {
  const { data } = await supabaseRequest(config, '/rest/v1/rpc/get_site_analytics_report', {
    method: 'POST',
    body: { p_start: start, p_end: end, p_hourly: hourly },
  });
  if (!data || typeof data !== 'object' || !data.totals || !Array.isArray(data.trend)
    || !Array.isArray(data.sources) || !Array.isArray(data.clicks) || !Array.isArray(data.pages)
    || !Array.isArray(data.funnel)) {
    throw new HttpError(503, '分析資料格式尚未就緒。', 'analytics_report_invalid');
  }
  return data;
}

async function loadFormFunnel(config, report, start, end) {
  try {
    const { data } = await supabaseRequest(config, '/rest/v1/rpc/get_site_analytics_form_funnel', {
      method: 'POST', body: { p_start: start, p_end: end },
    });
    if (!data || !Array.isArray(data.funnel) || !Number.isInteger(data.unpairedInquiries)) {
      throw new HttpError(503, '表單步驟資料格式尚未就緒。', 'analytics_funnel_invalid');
    }
    return { ...report, funnel: data.funnel, unpairedInquiries: data.unpairedInquiries, funnelVersion: 'form_instance_v2' };
  } catch (error) {
    // Before the journey migration is applied, keep the existing aggregate report usable.
    if (error instanceof HttpError && error.code === 'upstream_http_404') return { ...report, funnelVersion: 'legacy_session' };
    throw error;
  }
}

export const onRequest = endpoint(async ({ request, env }) => {
  if (request.method !== 'GET') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'GET' });
  await requireAdmin({ request, env });
  const range = resolveAnalyticsRange(new URL(request.url).searchParams);
  const config = getSecretConfig(env);
  // Leave room for clock and network delay between this check and the database RPC.
  const retentionCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
  const [currentBase, previousBase] = await Promise.all([
    loadReport(config, range.start, range.end, range.hourly),
    new Date(range.previousStart).getTime() >= retentionCutoff
      ? loadReport(config, range.previousStart, range.previousEnd, false)
      : Promise.resolve(null),
  ]);
  const [current, previous] = await Promise.all([
    loadFormFunnel(config, currentBase, range.start, range.end),
    previousBase ? loadFormFunnel(config, previousBase, range.previousStart, range.previousEnd) : Promise.resolve(null),
  ]);
  return json({
    range,
    current,
    previous,
    updatedAt: new Date().toISOString(),
    timezone: 'Asia/Taipei',
    retentionDays: 90,
  });
});
