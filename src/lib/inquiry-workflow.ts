export type SubmissionIdentity = { submission_id: string; receipt_token: string };
export type InquiryReceipt = { reference: string; createdAt: string; url: string };
export type InquiryStatus = 'new' | 'reviewing' | 'contacted' | 'closed';
export type ShootConfirmation = {
  version: number; status: 'confirmed'; slotId: string; startsAt: string; endsAt: string;
  location: string; mapUrl: string; wardrobe: string; bring: string; rainPlan: string;
  deliveryNote: string; publicationNote: string; updatedAt: string;
};
export type CooperationProgress = {
  reference: string; createdAt: string; status: InquiryStatus;
  summary: { name: string; collaborationType: string; preferredDate: string; description: string; referenceLinks: string[] };
  confirmation: ShootConfirmation | null;
};
const tokenPattern = /^[a-f0-9]{64}$/;
const referencePattern = /^PHOX-[A-F0-9]{20}$/;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 4000): value is string => typeof value === 'string' && value.length <= max;
export function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
export function createSubmissionIdentity(source: Crypto): SubmissionIdentity {
  if (!source?.getRandomValues) throw new Error('這個瀏覽器暫時無法建立私人收件連結，請改用其他瀏覽器或下方聯絡方式。');
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const receipt_token = Array.from(source.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  return { submission_id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, receipt_token };
}
export function receiptFromResponse(value: unknown, expectedToken: string): InquiryReceipt | null {
  if (!record(value) || !tokenPattern.test(expectedToken) || !text(value.reference, 80) || !referencePattern.test(value.reference) || !validTimestamp(value.createdAt) || value.url !== `/cooperation-status/#token=${expectedToken}`) return null;
  return { reference: value.reference, createdAt: value.createdAt, url: value.url };
}
export function tokenFromFragment(fragment: string): string {
  const values = new URLSearchParams(fragment.replace(/^#/, '')).getAll('token');
  return values.length === 1 && tokenPattern.test(values[0]) ? values[0] : '';
}
export function safeWebLink(value: unknown): string {
  if (!text(value, 2048) || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return '';
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.hostname ? url.href : ''; } catch { return ''; }
}
export function progressFromResponse(value: unknown): CooperationProgress | null {
  if (!record(value) || !text(value.reference, 80) || !referencePattern.test(value.reference) || !validTimestamp(value.createdAt) || !['new', 'reviewing', 'contacted', 'closed'].includes(String(value.status)) || !record(value.summary)) return null;
  const summary = value.summary;
  if (!text(summary.name, 80) || !text(summary.collaborationType, 200) || !(summary.preferredDate === null || text(summary.preferredDate, 200)) || !(summary.description === null || text(summary.description, 2000)) || !Array.isArray(summary.referenceLinks) || summary.referenceLinks.length > 3 || summary.referenceLinks.some(link => !safeWebLink(link))) return null;
  let confirmation: ShootConfirmation | null = null;
  if (value.confirmation !== null) {
    const item = value.confirmation;
    if (!record(item) || item.status !== 'confirmed' || !Number.isInteger(item.version) || Number(item.version) < 1 || !text(item.slotId, 80) || !item.slotId || !validTimestamp(item.startsAt) || !validTimestamp(item.endsAt) || Date.parse(item.endsAt) <= Date.parse(item.startsAt) || !validTimestamp(item.updatedAt)) return null;
    if (['location', 'mapUrl', 'wardrobe', 'bring', 'rainPlan', 'deliveryNote', 'publicationNote'].some(key => !text(item[key], 4000))) return null;
    if (item.mapUrl && !safeWebLink(item.mapUrl)) return null;
    confirmation = item as ShootConfirmation;
  }
  return { reference: value.reference, createdAt: value.createdAt, status: value.status as InquiryStatus, summary: { name: summary.name, collaborationType: summary.collaborationType, preferredDate: summary.preferredDate || '', description: summary.description || '', referenceLinks: summary.referenceLinks as string[] }, confirmation };
}
export function formatShootTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value));
}
const calendarEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n?|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const calendarDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
function foldCalendarLine(line: string): string {
  let result = ''; let width = 0;
  for (const character of line) { const point = character.codePointAt(0)!; const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; if (width + size > 75) { result += '\r\n '; width = 1; } result += character; width += size; }
  return result;
}
export function confirmationCalendar(progress: CooperationProgress): string | null {
  const item = progress.confirmation;
  if (!item || item.status !== 'confirmed' || !validTimestamp(item.startsAt) || !validTimestamp(item.endsAt) || Date.parse(item.endsAt) <= Date.parse(item.startsAt) || !validTimestamp(item.updatedAt)) return null;
  const description = [`收件編號：${progress.reference}`, `服裝：${item.wardrobe || '依雙方討論'}`, `攜帶物品：${item.bring || '依雙方討論'}`, `雨備：${item.rainPlan || '依雙方討論'}`, `交件：${item.deliveryNote || '待討論'}`, `公開方式：${item.publicationNote || '待討論'}`, item.mapUrl ? `集合地圖：${safeWebLink(item.mapUrl)}` : ''].filter(Boolean).join('\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Phox999//Shoot confirmation//ZH-TW', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${progress.reference.replace(/[^a-zA-Z0-9-]/g, '')}-${item.slotId.replace(/[^a-zA-Z0-9-]/g, '')}@phox999.com`, `DTSTAMP:${calendarDate(item.updatedAt)}`, `DTSTART:${calendarDate(item.startsAt)}`, `DTEND:${calendarDate(item.endsAt)}`, `SEQUENCE:${item.version}`, 'STATUS:CONFIRMED', 'SUMMARY:Phox999 拍攝合作', `LOCATION:${calendarEscape(item.location)}`, `DESCRIPTION:${calendarEscape(description)}`, 'END:VEVENT', 'END:VCALENDAR'].map(foldCalendarLine).join('\r\n') + '\r\n';
}
