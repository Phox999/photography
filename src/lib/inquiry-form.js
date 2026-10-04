import { normalizeFavorites } from './portfolio-favorites.js';
const CONTACT_METHODS = new Set(['Instagram', 'Line', 'Facebook', 'Threads', '手機', '其他']);
const COLLABORATION_TYPES = new Set(['輕量體驗(2hr)', '標準方案(3hr)', '主題合作']);
const REFERENCE_LINK_LIMIT = 3;
const REFERENCE_LINK_LENGTH = 2048;
const DESCRIPTION_LENGTH = 2000;

const text = (value) => typeof value === 'string' ? value.trim() : '';

function normalizeReferenceLinks(value) {
  const rawLinks = String(value || '').split(/\r?\n/).map((link) => link.trim()).filter(Boolean);
  if (rawLinks.length > REFERENCE_LINK_LIMIT) {
    return { links: rawLinks, error: '參考連結最多 3 個。' };
  }

  const links = [];
  for (const link of rawLinks) {
    if (link.length > REFERENCE_LINK_LENGTH || /[\u0000-\u001f\u007f]/.test(link)) {
      return { links: rawLinks, error: '每個參考連結最多 2,048 字，且不可包含控制字元。' };
    }

    let url;
    try { url = new URL(link); } catch {
      return { links: rawLinks, error: '請輸入完整的 HTTP 或 HTTPS 參考連結。' };
    }
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > REFERENCE_LINK_LENGTH) {
      return { links: rawLinks, error: '參考連結需使用 HTTP 或 HTTPS，不可含帳號密碼，且每個最多 2,048 字。' };
    }
    links.push(url.href);
  }
  return { links, error: null };
}

export function composeInquiryDescription(description, styles = []) {
  const selectedStyles = styles.map(text).filter(Boolean);
  const styleDescription = selectedStyles.length ? `偏好風格：${selectedStyles.join('、')}` : '';
  return [text(description), styleDescription].filter(Boolean).join('\n\n');
}

export function normalizeInquiryDraft(formData, styles = [], favorites = []) {
  const get = (name) => formData.get(name);
  const links = normalizeReferenceLinks(get('reference_links'));
  const consentValue = get('consent');
  const description = text(get('description'));
  const selectedStyles = styles.map(text).filter(Boolean);
  const portfolioFavorites = normalizeFavorites(favorites);

  return {
    name: text(get('name')),
    contactMethod: text(get('contact_method')),
    contactAccount: text(get('contact_account')),
    collaborationType: text(get('collaboration_type')),
    preferredDate: text(get('preferred_date')),
    description,
    styles: selectedStyles,
    combinedDescription: composeInquiryDescription(description, selectedStyles) || (portfolioFavorites.length ? '以已收藏的作品作為拍攝參考。' : ''),
    portfolioFavorites,
    referenceLinks: links.links,
    referenceLinkError: links.error,
    consent: consentValue === true || consentValue === 'on' || consentValue === 'true',
    website: String(get('website') || ''),
  };
}

export function validateInquiryDraft(draft) {
  if (!draft.name) return { field: 'name', message: '請填寫姓名或暱稱。' };
  if (draft.name.length > 80) return { field: 'name', message: '姓名或暱稱不可超過 80 字。' };
  if (!draft.contactMethod) return { field: 'contact_method', message: '請選擇聯絡方式。' };
  if (!CONTACT_METHODS.has(draft.contactMethod)) return { field: 'contact_method', message: '請選擇有效的聯絡方式。' };
  if (!draft.contactAccount) return { field: 'contact_account', message: '請填寫聯絡帳號或連結。' };
  if (draft.contactAccount.length > 120) return { field: 'contact_account', message: '聯絡帳號或連結不可超過 120 字。' };
  if (!draft.collaborationType) return { field: 'collaboration_type', message: '請選擇合作類型。' };
  if (!COLLABORATION_TYPES.has(draft.collaborationType)) return { field: 'collaboration_type', message: '請選擇有效的合作類型。' };
  if (draft.preferredDate.length > 200) return { field: 'preferred_date', message: '偏好日期不可超過 200 字。' };
  if (!draft.description && !draft.styles.length && !draft.portfolioFavorites?.length) return { field: 'description', message: '請選擇拍攝風格或填寫拍攝想法。' };
  if (draft.combinedDescription.length > DESCRIPTION_LENGTH) return { field: 'description', message: '拍攝想法與已選風格合計不可超過 2,000 字。' };
  if (draft.referenceLinkError) return { field: 'reference_links', message: draft.referenceLinkError };
  if (!draft.consent) return { field: 'consent', message: '請先同意資料使用說明。' };
  return null;
}

export function buildInquiryPayload(draft) {
  return {
    website: draft.website,
    name: draft.name,
    contact_method: draft.contactMethod,
    contact_account: draft.contactAccount,
    collaboration_type: draft.collaborationType,
    preferred_date: draft.preferredDate,
    description: draft.combinedDescription,
    reference_links: draft.referenceLinks,
    consent: draft.consent,
    ...(draft.portfolioFavorites?.length ? { portfolio_favorites: draft.portfolioFavorites } : {}),
  };
}
