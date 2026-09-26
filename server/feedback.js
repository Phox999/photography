import { HttpError } from './auth.js';

export const FEEDBACK_FIELDS = 'id,name,contact,experience,improvement,allow_publication,status,created_at,updated_at,version';
export const PUBLIC_FEEDBACK_FIELDS = 'id,name,experience,created_at,status,allow_publication';

function text(value, maximum, label, required = false) {
  if (typeof value !== 'string') throw new HttpError(400, `${label}格式不正確。`, 'invalid_input');
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)) {
    throw new HttpError(400, `請檢查${label}，最多 ${maximum} 字。`, 'invalid_input');
  }
  return cleaned;
}

export function feedbackSubmission(body) {
  const keys = ['name', 'contact', 'experience', 'improvement', 'allowPublication', 'consent', 'website'];
  if (Object.keys(body).some(key => !keys.includes(key))) throw new HttpError(400, '包含不支援的欄位。', 'invalid_input');
  if (body.consent !== true || typeof body.allowPublication !== 'boolean') throw new HttpError(400, '請確認資料使用與公開設定。', 'invalid_consent');
  if (body.website !== undefined && (typeof body.website !== 'string' || body.website.trim())) throw new HttpError(400, '未接受這次提交，請從網站表單重新操作。', 'invalid_input');
  return {
    name: text(body.name, 80, '顯示名稱', true),
    contact: text(body.contact, 160, '聯絡方式', true),
    experience: text(body.experience, 2000, '合作經驗', true),
    improvement: text(body.improvement ?? '', 1000, '改善建議'),
    allow_publication: body.allowPublication,
    consent: true,
    status: 'pending',
  };
}

export function publicFeedback(rows) {
  if (!Array.isArray(rows)) throw new HttpError(502, '回饋資料暫時無法載入。', 'invalid_response');
  return rows.filter(row => row.status === 'approved' && row.allow_publication === true)
    .slice(0, 20).map(row => ({ id: row.id, name: row.name, experience: row.experience, created_at: row.created_at }));
}
