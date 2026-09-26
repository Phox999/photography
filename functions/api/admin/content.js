import { assertMutation, endpoint, HttpError, json, readJson, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, CONTENT_FIELDS, contentUpdate, rowResult } from '../../../server/admin-validation.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method === 'PATCH') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  if (context.request.method === 'GET') {
    const params = new URLSearchParams({ select: CONTENT_FIELDS, id: 'eq.1', limit: '1' });
    const result = await supabaseRequest(config, `/rest/v1/site_content?${params}`, { accessToken });
    if (!Array.isArray(result.data) || !result.data[0]) {
      throw new HttpError(503, '網站內容尚未初始化，請先完成資料庫設定。', 'content_unavailable');
    }
    return json({ content: result.data[0] });
  }
  // Twelve Chinese FAQ entries can exceed 32 KiB while staying within all
  // character limits. Keep a byte cap large enough for escaped Unicode JSON.
  const payload = contentUpdate(await readJson(context.request, 128 * 1024));
  const result = await supabaseRequest(config, '/rest/v1/rpc/admin_update_content', {
    method: 'POST', accessToken, body: payload,
  });
  return json({ content: rowResult(result.data) });
});
