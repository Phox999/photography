import { endpoint, json, getSecretConfig, HttpError, supabaseRequest } from '../../server/auth.js';
import { assertReceiptRequest, publicProgress, sha256 } from '../../server/inquiry-workflow.js';

const handler = endpoint(async (context) => {
  if (context.request.method !== 'GET') return json({ success: false, message: '不支援此操作。', code: 'method_not_allowed' }, 405, { Allow: 'GET' });
  const token = assertReceiptRequest(context);
  const { data } = await supabaseRequest(getSecretConfig(context.env), '/rest/v1/rpc/get_cooperation_progress', {
    method: 'POST', body: { p_token_hash: await sha256(token) },
  });
  if (data === null) throw new HttpError(404, '查詢連結無效或已失效，請與攝影師聯絡。', 'receipt_not_found');
  return json(publicProgress(data));
});

export const onRequest = async (context) => {
  const response = await handler(context);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Vary', 'Authorization');
  return response;
};
