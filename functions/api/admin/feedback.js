import { assertMutation, endpoint, HttpError, json, readJson, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, parseId, parsePage, parseVersion, rowResult } from '../../../server/admin-validation.js';
import { FEEDBACK_FIELDS } from '../../../server/feedback.js';

export const onRequest = endpoint(async context => {
  const unsupported = allowMethods(context.request, ['GET', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method === 'PATCH') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  if (context.request.method === 'GET') {
    const url = new URL(context.request.url);
    const page = parsePage(url);
    const status = url.searchParams.get('status') || 'pending';
    if (!['all', 'pending', 'approved', 'declined'].includes(status)) throw new HttpError(400, '回饋狀態不正確。', 'invalid_input');
    const query = new URLSearchParams({ select: FEEDBACK_FIELDS, order: 'created_at.desc,id.desc', limit: '21', offset: String((page - 1) * 20) });
    if (status !== 'all') query.set('status', `eq.${status}`);
    const { data } = await supabaseRequest(config, `/rest/v1/collaboration_feedback?${query}`, { accessToken });
    if (!Array.isArray(data)) throw new HttpError(502, '回饋資料格式異常。', 'invalid_response');
    return json({ items: data.slice(0, 20), page, hasMore: data.length > 20 });
  }
  const body = await readJson(context.request, 4096);
  if (Object.keys(body).some(key => !['id', 'status', 'version'].includes(key)) || !['pending', 'approved', 'declined'].includes(body.status)) throw new HttpError(400, '回饋狀態不正確。', 'invalid_input');
  const { data } = await supabaseRequest(config, '/rest/v1/rpc/admin_review_feedback', {
    method: 'POST', accessToken, body: { p_id: parseId(body.id), p_status: body.status, p_version: parseVersion(body.version) },
  });
  return json({ item: rowResult(data) });
});
