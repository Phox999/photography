import { assertMutation, endpoint, HttpError, json, readJson, requireAdmin, supabaseRequest } from '../../../../server/auth.js';
import { allowMethods, INQUIRY_FIELDS, inquiryUpdate, parseId, rowResult } from '../../../../server/admin-validation.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method === 'PATCH') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  const id = parseId(context.params.id);
  if (context.request.method === 'GET') {
    const params = new URLSearchParams({ select: INQUIRY_FIELDS, id: `eq.${id}`, limit: '1' });
    const { data } = await supabaseRequest(config, `/rest/v1/collaboration_requests?${params}`, { accessToken });
    if (!Array.isArray(data)) throw new HttpError(502, '資料格式異常，請重新載入。', 'upstream_error');
    if (!data.length) throw new HttpError(404, '找不到這筆資料。', 'not_found');
    return json({ item: rowResult(data) });
  }
  const payload = inquiryUpdate(await readJson(context.request));
  const result = await supabaseRequest(config, '/rest/v1/rpc/admin_update_inquiry', {
    method: 'POST', accessToken, body: { p_id: id, ...payload },
  });
  return json({ item: rowResult(result.data) });
});
