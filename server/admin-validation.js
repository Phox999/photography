import { HttpError, json } from './auth.js';

export const PAGE_SIZE = 20;
export const STATUSES = ['new', 'reviewing', 'contacted', 'closed'];
export const INQUIRY_FIELDS = 'id,name,contact_method,contact_account,collaboration_type,preferred_date,description,consent,status,admin_notes,created_at,updated_at,version';
export const CONTENT_FIELDS = 'id,announcement,announcement_enabled,faqs,version,updated_at';

const invalid = (message) => { throw new HttpError(400, message, 'invalid_input'); };

export function allowMethods(request, methods) {
  return methods.includes(request.method)
    ? null
    : json({ success: false, message: '不支援此操作。', code: 'method_not_allowed' }, 405, { Allow: methods.join(', ') });
}

export function parsePage(url) {
  const value = url.searchParams.get('page') ?? '1';
  if (!/^[1-9]\d{0,6}$/.test(value)) invalid('頁碼格式不正確。');
  return Number(value);
}

export function parseStatus(value) {
  if (typeof value !== 'string' || !STATUSES.includes(value)) invalid('請選擇有效的處理狀態。');
  return value;
}

export function parseId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    invalid('詢問單編號格式不正確。');
  }
  return value;
}

export function parseVersion(value) {
  if (!Number.isInteger(value) || value < 1 || value > 2147483646) invalid('資料版本不正確，請重新載入。');
  return value;
}

function plainText(value, limit, label, { required = false, noMarkup = false } = {}) {
  if (typeof value !== 'string') invalid(`${label}格式不正確。`);
  const text = value.trim();
  if (text.length > limit) invalid(`${label}不可超過 ${limit} 字。`);
  if (required && !text) invalid(`請填寫${label}。`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) invalid(`${label}包含不支援的字元。`);
  if (noMarkup && /[<>]/.test(text)) invalid(`${label}請使用純文字，勿加入 HTML 標籤。`);
  return text;
}

function objectBody(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('資料格式不正確。');
  if (Object.keys(body).some((key) => !keys.includes(key))) invalid('資料包含不支援的欄位。');
}

export function inquiryUpdate(body) {
  objectBody(body, ['status', 'admin_notes', 'version']);
  return {
    p_status: parseStatus(body.status),
    p_admin_notes: plainText(body.admin_notes, 4000, '管理備註'),
    p_version: parseVersion(body.version),
  };
}

export function contentUpdate(body) {
  objectBody(body, ['announcement', 'announcement_enabled', 'faqs', 'version']);
  if (typeof body.announcement_enabled !== 'boolean') invalid('公告顯示設定不正確。');
  if (!Array.isArray(body.faqs) || body.faqs.length > 12) invalid('常見問題最多可設定 12 組。');
  const faqs = body.faqs.map((faq) => {
    objectBody(faq, ['question', 'answer']);
    return {
      question: plainText(faq.question, 160, '問題', { required: true, noMarkup: true }),
      answer: plainText(faq.answer, 1200, '回答', { required: true, noMarkup: true }),
    };
  });
  const announcement = plainText(body.announcement, 500, '公告', { noMarkup: true });
  if (body.announcement_enabled && !announcement) invalid('啟用公告前請填寫公告內容。');
  return {
    p_announcement: announcement,
    p_announcement_enabled: body.announcement_enabled,
    p_faqs: faqs,
    p_version: parseVersion(body.version),
  };
}

export function inquiryQuery(url) {
  const page = parsePage(url);
  const status = url.searchParams.get('status') ?? 'all';
  if (status !== 'all') parseStatus(status);
  const query = plainText(url.searchParams.get('q') ?? '', 120, '搜尋文字');
  const params = new URLSearchParams({
    select: INQUIRY_FIELDS,
    order: 'created_at.desc,id.desc',
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
  });
  if (status !== 'all') params.set('status', `eq.${status}`);
  if (query) {
    // Keep user input inside a quoted PostgREST value. Quotes and backslashes
    // cannot break out into additional filters; URLSearchParams encodes the URL.
    // SQL LIKE wildcards %, _ and PostgREST's * alias remain available in search.
    const quoted = `"*${query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}*"`;
    params.set('or', `(name.ilike.${quoted},contact_account.ilike.${quoted},description.ilike.${quoted})`);
  }
  return { page, params };
}

export function exactCount(headers) {
  const value = headers.get('content-range')?.split('/').pop();
  if (!value || !/^\d+$/.test(value)) throw new HttpError(502, '無法取得資料筆數，請稍後重試。', 'upstream_error');
  return Number(value);
}

export function rowResult(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new HttpError(502, '資料格式異常，請重新載入。', 'upstream_error');
  return row;
}
