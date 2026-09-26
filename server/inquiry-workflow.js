import { HttpError, supabaseRequest } from './auth.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;
const fail = (message = '提交資料格式不正確。') => { throw new HttpError(400, message, 'invalid_input'); };
const upstream = () => new HttpError(503, '服務暫時無法使用，請稍後再試。', 'upstream_unavailable');

export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function submissionCredentials(body) {
  const hasId = body.submission_id !== undefined;
  const hasToken = body.receipt_token !== undefined;
  if (hasId !== hasToken) fail('請重新載入表單後再送出。');
  if (hasId) {
    if (typeof body.submission_id !== 'string' || !UUID_V4.test(body.submission_id)
      || typeof body.receipt_token !== 'string' || !TOKEN.test(body.receipt_token)) fail('收件憑證格式不正確，請重新載入表單。');
    return { submissionId: body.submission_id.toLowerCase(), token: body.receipt_token };
  }
  // Legacy clients still receive a receipt; safe retry requires the optional pair.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { submissionId: crypto.randomUUID(), token: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') };
}

export async function prepareSubmission(body, payload, images) {
  const credentials = submissionCredentials(body);
  // Explicit key order and normalized values make equivalent JSON/multipart
  // payloads identical. File order, sanitized names, types and bytes participate.
  const canonical = {
    name: payload.name, contact_method: payload.contact_method, contact_account: payload.contact_account,
    collaboration_type: payload.collaboration_type, preferred_date: payload.preferred_date,
    description: payload.description, consent: payload.consent, reference_links: payload.reference_links ?? [],
    reference_images: await Promise.all(images.map(async (image) => ({ name: image.name, type: image.type, size: image.size, hash: await sha256(image.bytes) }))),
  };
  return { ...credentials, tokenHash: await sha256(credentials.token), requestHash: await sha256(JSON.stringify(canonical)) };
}

export function receiptResult(data, token) {
  if (!data || typeof data !== 'object' || typeof data.reference !== 'string' || !/^PHOX-[A-F0-9]{20}$/.test(data.reference)
    || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) throw upstream();
  return { reference: data.reference, createdAt: new Date(data.createdAt).toISOString(), url: `/cooperation-status/#token=${token}` };
}

export async function existingReceipt(config, workflow) {
  const { data } = await supabaseRequest(config, '/rest/v1/rpc/find_inquiry_receipt', {
    method: 'POST', body: { p_submission_id: workflow.submissionId, p_token_hash: workflow.tokenHash, p_request_hash: workflow.requestHash },
  });
  return data === null ? null : receiptResult(data, workflow.token);
}

export function assertReceiptRequest(context) {
  const url = new URL(context.request.url);
  const local = context.env.AUTH_ALLOW_LOCALHOST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new HttpError(400, '查詢需要使用 HTTPS 連線。', 'https_required');
  const origin = context.request.headers.get('origin');
  if ((origin && origin !== url.origin) || context.request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, '請從本站頁面查詢。', 'invalid_origin');
  }
  // Tokens are accepted only in Authorization, never query strings or cookies.
  if (url.search) fail('請使用原有的私人進度查詢連結。');
  const match = /^Bearer ([0-9a-f]{64})$/.exec(context.request.headers.get('authorization') || '');
  if (!match) throw new HttpError(401, '查詢連結無效，請使用送出後提供的私人連結。', 'invalid_receipt');
  return match[1];
}

const TEXT_FIELDS = { location: 300, mapUrl: 2048, wardrobe: 2000, bring: 2000, rainPlan: 2000, deliveryNote: 2000, publicationNote: 2000 };
export function confirmationUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['version', 'status', 'slotId', ...Object.keys(TEXT_FIELDS)].includes(key))) fail();
  if (!Number.isInteger(body.version) || body.version < 0 || body.version > 2147483646) fail('資料版本不正確，請重新載入。');
  if (!['draft', 'confirmed'].includes(body.status)) fail('請選擇有效的確認單狀態。');
  if (body.slotId !== null && (typeof body.slotId !== 'string' || !UUID_V4.test(body.slotId))) fail('請選擇有效的檔期。');
  const fields = {};
  for (const [key, limit] of Object.entries(TEXT_FIELDS)) {
    if (typeof body[key] !== 'string') fail('請完整填寫確認單欄位。');
    fields[key] = body[key].trim();
    if (fields[key].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(fields[key])) fail('確認單欄位過長或含有不支援的字元。');
  }
  if (fields.mapUrl) {
    let url;
    try { url = new URL(fields.mapUrl); } catch { fail('地圖連結格式不正確。'); }
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 2048) fail('地圖連結需使用 HTTP 或 HTTPS，且不可包含帳號密碼。');
    fields.mapUrl = url.href;
  }
  if (body.status === 'confirmed' && (!body.slotId || !fields.location)) fail('發布確認單前，請選擇檔期並填寫集合地點。');
  return { p_version: body.version, p_status: body.status, p_slot_id: body.slotId,
    p_location: fields.location, p_map_url: fields.mapUrl, p_wardrobe: fields.wardrobe,
    p_bring: fields.bring, p_rain_plan: fields.rainPlan, p_delivery_note: fields.deliveryNote, p_publication_note: fields.publicationNote };
}

// Defence in depth: even an upstream schema change cannot expose storage paths,
// contact accounts, internal notes, token hashes or unpublished draft details.
export function publicProgress(data) {
  if (!data || typeof data !== 'object' || !['new', 'reviewing', 'contacted', 'closed'].includes(data.status)
    || !data.summary || typeof data.summary.name !== 'string') throw upstream();
  receiptResult(data, '');
  const source = data.confirmation;
  let confirmation = null;
  if (source?.status === 'confirmed') {
    if (!Number.isInteger(source.version) || source.version < 1 || typeof source.slotId !== 'string' || !UUID_V4.test(source.slotId)
      || !Number.isFinite(Date.parse(source.startsAt)) || !Number.isFinite(Date.parse(source.endsAt))
      || !Number.isFinite(Date.parse(source.updatedAt))) throw upstream();
    confirmation = { version: source.version, status: 'confirmed', slotId: source.slotId,
      startsAt: source.startsAt, endsAt: source.endsAt, updatedAt: source.updatedAt };
    for (const key of Object.keys(TEXT_FIELDS)) {
      if (typeof source[key] !== 'string' || source[key].length > TEXT_FIELDS[key]) throw upstream();
      confirmation[key] = source[key];
    }
  }
  const summary = data.summary;
  if (summary.name.length > 80 || typeof summary.collaborationType !== 'string' || summary.collaborationType.length > 50
    || (summary.preferredDate !== null && (typeof summary.preferredDate !== 'string' || summary.preferredDate.length > 200))
    || (summary.description !== null && (typeof summary.description !== 'string' || summary.description.length > 2000))
    || !Array.isArray(summary.referenceLinks) || summary.referenceLinks.length > 3
    || summary.referenceLinks.some(link => typeof link !== 'string' || link.length > 2048 || !/^https?:\/\//.test(link))) throw upstream();
  return { reference: data.reference, createdAt: data.createdAt, status: data.status,
    summary: { name: summary.name, collaborationType: summary.collaborationType, preferredDate: summary.preferredDate ?? null,
      description: summary.description ?? null, referenceLinks: summary.referenceLinks }, confirmation };
}
