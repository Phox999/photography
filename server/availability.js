import { HttpError } from './auth.js';
import { parseId, parseVersion } from './admin-validation.js';

const invalid = (message = '檔期資料格式不正確。') => { throw new HttpError(400, message, 'invalid_input'); };
const DAY = 86400000;

export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('日期請使用 YYYY-MM-DD 格式。');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid('日期不存在。');
  return value;
}

export function availabilityRange(url, optional = false, now = new Date()) {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !['from', 'to'].includes(key)) || new Set(keys).size !== keys.length) invalid('查詢包含不支援的欄位。');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const from = dateValue(url.searchParams.get('from') ?? (optional ? today : ''));
  const defaultTo = new Date(Date.parse(`${from}T00:00:00Z`) + 179 * DAY).toISOString().slice(0, 10);
  const to = dateValue(url.searchParams.get('to') ?? (optional ? defaultTo : ''));
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1;
  if (days < 1 || days > 180) invalid('查詢範圍需為 1 至 180 天。');
  return { from, to, startsAt: `${from}T00:00:00+08:00`, endsAt: new Date(Date.parse(`${to}T00:00:00+08:00`) + DAY).toISOString() };
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid('時間必須包含時區。');
  dateValue(value.slice(0, 10));
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid();
  return parsed.toISOString();
}

export function availabilityWrite(body, update = false) {
  const keys = update ? ['id', 'version', 'startsAt', 'endsAt', 'status'] : ['startsAt', 'endsAt', 'status'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) invalid('資料包含不支援的欄位。');
  if (!['open', 'held', 'closed'].includes(body.status)) invalid('請選擇可洽詢、暫留或關閉。已確認檔期請由拍攝確認單管理。');
  const startsAt = instant(body.startsAt);
  const endsAt = instant(body.endsAt);
  const duration = Date.parse(endsAt) - Date.parse(startsAt);
  if (duration <= 0 || duration > DAY) invalid('結束時間需晚於開始時間，且單筆不得超過 24 小時。');
  return { p_id: update ? parseId(body.id) : null, p_version: update ? parseVersion(body.version) : null, p_starts_at: startsAt, p_ends_at: endsAt, p_status: body.status };
}

export function availabilityItem(row) {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !['open', 'held', 'booked', 'closed'].includes(row.status)
    || !Number.isFinite(Date.parse(row.starts_at)) || !Number.isFinite(Date.parse(row.ends_at)) || !Number.isInteger(row.version)) {
    throw new HttpError(503, '檔期暫時無法載入。', 'availability_unavailable');
  }
  return { id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, inquiryId: row.inquiry_id ?? null, version: row.version };
}
