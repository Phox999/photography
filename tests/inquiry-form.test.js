import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInquiryPayload,
  normalizeInquiryDraft,
  validateInquiryDraft,
} from '../src/lib/inquiry-form.js';

const makeFormData = (values = {}) => ({
  get: (name) => values[name] ?? null,
});

const validValues = {
  name: ' Luna ',
  contact_method: 'Instagram',
  contact_account: ' @luna ',
  collaboration_type: '標準方案(3hr)',
  preferred_date: '',
  description: '想拍一組夕陽逆光的照片。',
  reference_links: '',
  consent: 'on',
  website: '',
};

test('姓名必填，且只由空白組成時仍視為未填', () => {
  const draft = normalizeInquiryDraft(makeFormData({ ...validValues, name: '   ' }));
  assert.equal(validateInquiryDraft(draft)?.field, 'name');
});

test('姓名和自由描述可形成有效提交，並沿用正規化值', () => {
  const draft = normalizeInquiryDraft(makeFormData(validValues));
  assert.equal(validateInquiryDraft(draft), null);
  assert.equal(draft.name, 'Luna');
  assert.equal(draft.contactAccount, '@luna');
  assert.equal(buildInquiryPayload(draft).name, 'Luna');
});

test('選擇風格但沒有自由描述時，仍可形成伺服器要求的描述', () => {
  const draft = normalizeInquiryDraft(
    makeFormData({ ...validValues, description: '' }),
    ['OL 制服'],
  );
  assert.equal(validateInquiryDraft(draft), null);
  assert.equal(buildInquiryPayload(draft).description, '偏好風格：OL 制服');
});

test('中文多行想法與參考連結分欄，連結不併入描述', () => {
  const draft = normalizeInquiryDraft(makeFormData({
    ...validValues,
    description: '  想拍街景\n希望是自然的光線  ',
    reference_links: 'https://EXAMPLE.com\n\nhttps://example.com/portrait',
  }), ['情侶寫真']);

  const payload = buildInquiryPayload(draft);
  assert.equal(validateInquiryDraft(draft), null);
  assert.equal(draft.description, '想拍街景\n希望是自然的光線');
  assert.equal(payload.description, '想拍街景\n希望是自然的光線\n\n偏好風格：情侶寫真');
  assert.deepEqual(payload.reference_links, ['https://example.com/', 'https://example.com/portrait']);
});

test('0、1、3 個有效連結可提交', () => {
  for (const links of ['', 'https://example.com', 'https://one.example\nhttps://two.example\nhttps://three.example']) {
    const draft = normalizeInquiryDraft(makeFormData({ ...validValues, reference_links: links }));
    assert.equal(validateInquiryDraft(draft), null);
  }
});

test('拒絕過多、不安全或超長的參考連結', () => {
  const invalidValues = [
    'https://a.example\nhttps://b.example\nhttps://c.example\nhttps://d.example',
    'ftp://example.com/file',
    'https://user:secret@example.com/',
    `https://example.com/${'a'.repeat(2048)}`,
    'https://example.com/\u0001',
  ];

  for (const links of invalidValues) {
    const draft = normalizeInquiryDraft(makeFormData({ ...validValues, reference_links: links }));
    assert.equal(validateInquiryDraft(draft)?.field, 'reference_links');
  }
});

test('描述合計 2,000 字可通過，超過時拒絕而不截斷', () => {
  const atLimit = normalizeInquiryDraft(makeFormData({ ...validValues, description: '想'.repeat(2000) }));
  const overLimit = normalizeInquiryDraft(makeFormData({ ...validValues, description: '想'.repeat(2001) }));

  assert.equal(validateInquiryDraft(atLimit), null);
  assert.equal(validateInquiryDraft(overLimit)?.field, 'description');
  assert.equal(overLimit.description.length, 2001);
});

test('姓名、聯絡帳號與日期偏好的上限前後一致', () => {
  const atLimits = normalizeInquiryDraft(makeFormData({
    ...validValues,
    name: 'L'.repeat(80),
    contact_account: 'a'.repeat(120),
    preferred_date: 'D'.repeat(200),
  }));
  assert.equal(validateInquiryDraft(atLimits), null);

  for (const [field, value, expectedField] of [
    ['name', 'L'.repeat(81), 'name'],
    ['contact_account', 'a'.repeat(121), 'contact_account'],
    ['preferred_date', 'D'.repeat(201), 'preferred_date'],
  ]) {
    const draft = normalizeInquiryDraft(makeFormData({ ...validValues, [field]: value }));
    assert.equal(validateInquiryDraft(draft)?.field, expectedField);
  }
});

test('參考連結恰好 2,048 字可通過，超過一字即拒絕', () => {
  const prefix = 'https://example.com/';
  const atLimitLink = `${prefix}${'a'.repeat(2048 - prefix.length)}`;
  const overLimitLink = `${atLimitLink}a`;
  assert.equal(atLimitLink.length, 2048);

  const atLimit = normalizeInquiryDraft(makeFormData({ ...validValues, reference_links: atLimitLink }));
  const overLimit = normalizeInquiryDraft(makeFormData({ ...validValues, reference_links: overLimitLink }));
  assert.equal(validateInquiryDraft(atLimit), null);
  assert.equal(validateInquiryDraft(overLimit)?.field, 'reference_links');
});
