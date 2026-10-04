import { endpoint, json, getSecretConfig, HttpError, supabaseRequest, assertMutation, readJson } from '../../server/auth.js';
import { assertReceiptRequest, publicProgress, sha256 } from '../../server/inquiry-workflow.js';

const REFERENCE = /^PHOX-[A-F0-9]{20}$/;

async function progressByToken(context) {
  const token = assertReceiptRequest(context);
  const { data } = await supabaseRequest(getSecretConfig(context.env), '/rest/v1/rpc/get_cooperation_progress', {
    method: 'POST', body: { p_token_hash: await sha256(token) },
  });
  if (data === null) throw new HttpError(404, '查詢憑證無效或已失效，請與攝影師聯絡。', 'receipt_not_found');
  return data;
}

async function progressByReference(context) {
  assertMutation(context.request);
  const body = await readJson(context.request, 512);
  if (Object.keys(body).some((key) => key !== 'reference') || typeof body.reference !== 'string') {
    throw new HttpError(400, '請輸入有效的查詢代碼。', 'invalid_reference');
  }
  const reference = body.reference.trim().toUpperCase();
  if (!REFERENCE.test(reference)) throw new HttpError(400, '請輸入完整的 PHOX 查詢代碼。', 'invalid_reference');

  const { data } = await supabaseRequest(getSecretConfig(context.env), '/rest/v1/rpc/get_cooperation_progress_by_reference', {
    method: 'POST', body: { p_reference: reference },
  });
  if (data === null) throw new HttpError(404, '找不到這組查詢代碼，請確認後再試。', 'receipt_not_found');
  return data;
}

const handler = endpoint(async (context) => {
  let data;
  if (context.request.method === 'GET') data = await progressByToken(context);
  else if (context.request.method === 'POST') data = await progressByReference(context);
  else return json({ success: false, message: '不支援此操作。', code: 'method_not_allowed' }, 405, { Allow: 'GET, POST' });
  return json(publicProgress(data));
});

export const onRequest = async (context) => {
  const response = await handler(context);
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Vary', context.request.method === 'GET' ? 'Authorization' : 'Origin');
  return response;
};
