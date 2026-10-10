import { endpoint, json, getSecretConfig } from '../../server/auth.js';
import { readInquirySubmission, referenceLinks, validateReferenceImages, persistInquiry } from '../../server/inquiry-references.js';
import { existingReceipt, prepareSubmission } from '../../server/inquiry-workflow.js';
import { attachShootProjectSnapshot, parseShootProjectRequest, projectForNewRequest } from '../../server/shoot-projects.js';

const contactMethods = new Set(['Instagram', 'Line', 'Facebook', 'Threads', '手機', '其他']);
const collaborationTypes = new Set(['輕量體驗(2hr)', '標準方案(3hr)', '主題合作']);

const fieldLimits = {
  name: 80,
  contact_method: 50,
  contact_account: 120,
  collaboration_type: 50,
  preferred_date: 200,
  description: 2000,
};
const allowedBodyKeys = new Set([
  'submission_id', 'receipt_token', 'website', 'name', 'contact_method', 'contact_account',
  'collaboration_type', 'preferred_date', 'description', 'reference_links', 'consent',
  'shoot_project_id', 'shoot_project_revision',
]);

const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeOptionalText = (value) => {
  const text = normalizeText(value);
  return text || null;
};

const normalizeConsent = (value) => value === true || value === 'true' || value === 'on';

const validateLength = (name, value) => {
  const limit = fieldLimits[name];

  if (!limit || value === null) {
    return null;
  }

  return value.length > limit ? `${name} 欄位不可超過 ${limit} 字。` : null;
};

export const onRequest = endpoint(async (context) => {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ success: false, message: '不支援此操作方式。' }, 405, { Allow: 'POST' });
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ success: false, message: '請從本站表單操作。' }, 403);
  const { body, files } = await readInquirySubmission(request);
  if (Object.keys(body).some((key) => !allowedBodyKeys.has(key))) return json({ success: false, message: '提交資料包含不支援的欄位。' }, 400);

  if (normalizeText(body.website)) {
    return json({
      success: false,
      message: '提交資料格式不正確。',
    }, 400);
  }

  const payload = {
    name: normalizeText(body.name),
    contact_method: normalizeText(body.contact_method),
    contact_account: normalizeText(body.contact_account),
    collaboration_type: normalizeText(body.collaboration_type),
    preferred_date: normalizeOptionalText(body.preferred_date),
    description: normalizeOptionalText(body.description),
    consent: normalizeConsent(body.consent),
  };
  const projectRequest = parseShootProjectRequest(body);
  if (projectRequest && (body.submission_id === undefined || body.receipt_token === undefined)) {
    return json({ success: false, message: '企劃申請需要安全的重試憑證，請重新載入頁面後再送出。' }, 400);
  }

  const lengthError = Object.entries(payload)
    .filter(([, value]) => typeof value === 'string')
    .map(([name, value]) => validateLength(name, value))
    .find(Boolean);

  if (lengthError) {
    return json(
      {
        success: false,
        message: lengthError,
      },
      400,
    );
  }

  if (!payload.name || !payload.contact_method || !payload.contact_account || !payload.collaboration_type || (!payload.description && !projectRequest)) {
    return json(
      {
        success: false,
        message: '請填寫姓名、聯絡方式、聯絡賬號、合作類型與想拍攝的風格 / 主題。',
      },
      400,
    );
  }

  if (!payload.consent) {
    return json(
      {
        success: false,
        message: '請先同意資料使用說明。',
      },
      400,
    );
  }

  if (!contactMethods.has(payload.contact_method)) {
    return json(
      {
        success: false,
        message: '請選擇有效的聯絡方式。',
      },
      400,
    );
  }

  if (!collaborationTypes.has(payload.collaboration_type)) {
    return json(
      {
        success: false,
        message: '請選擇有效的合作類型。',
      },
      400,
    );
  }

  payload.reference_links = referenceLinks(body.reference_links);
  const images = await validateReferenceImages(files);
  const workflow = await prepareSubmission(body, payload, images);
  const config = getSecretConfig(env);
  let persistedPayload = payload;
  if (projectRequest) {
    // A committed receipt wins before the current project state is checked.
    // This keeps the same request retryable after a project closes or changes.
    const priorReceipt = await existingReceipt(config, workflow);
    if (priorReceipt) return json({ success: true, message: '企劃申請已收到。', receipt: priorReceipt }, 201);
    const project = projectForNewRequest(projectRequest);
    persistedPayload = attachShootProjectSnapshot(payload, project);
  }
  const receipt = await persistInquiry(config, persistedPayload, images, workflow, projectRequest
    ? { beforeCommit: () => { projectForNewRequest(projectRequest); } }
    : undefined);

  return json(
    {
      success: true,
      message: projectRequest ? '企劃申請已送出，我會再確認合作與日期。' : '合作意向已送出，我會盡快與你聯絡。',
      receipt,
    },
    201,
  );
});
