import { HttpError, getSecretConfig, json, supabaseRequest } from '../../server/auth.js';

export const BUCKET = 'client-galleries';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validId = (value) => typeof value === 'string' && UUID.test(value);
export function clientJson(data, status = 200) { return json(data, status, { Vary: 'Authorization', 'X-Robots-Tag': 'noindex, nofollow' }); }
export function invalidInput() { throw new HttpError(400, '欄位內容不符合規定，請檢查後再試。', 'invalid_input'); }
export function textField(value, limit, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > limit || (!allowEmpty && !value.trim())) invalidInput();
  return value.trim();
}
export function objectPath(value, galleryId) {
  if (typeof value !== 'string' || value.length > 240 || !value.startsWith(`${galleryId}/`)
    || !/^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(value)) invalidInput();
  return value;
}
export async function hashToken(token) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
export function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function guest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const local = env.AUTH_ALLOW_LOCALHOST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new HttpError(400, '專屬相簿需要 HTTPS 連線。', 'https_required');
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== url.origin)) throw new HttpError(403, '請從本站專屬相簿操作。', 'invalid_origin');
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') || '');
  if (!match) throw new HttpError(401, '請使用攝影師提供的完整邀請連結。', 'invitation_required');
  return { config: getSecretConfig(env), tokenHash: await hashToken(match[1]) };
}
export async function guestRpc(auth, name, body = {}) {
  try {
    const result = await supabaseRequest(auth.config, `/rest/v1/rpc/${name}`, { method: 'POST', body: { p_token_hash: auth.tokenHash, ...body } });
    return result.data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) throw new HttpError(403, '邀請已過期、已撤銷，或目前無法執行此操作，請聯絡攝影師。', 'invitation_unavailable');
    if (error instanceof HttpError && error.status === 409) throw new HttpError(409, '選片清單已確認，若要變更請聯絡攝影師。', 'selection_confirmed');
    throw error;
  }
}
export async function signedPhotos(config, paths, expiresIn) {
  if (!paths.length) return new Map();
  const result = await supabaseRequest(config, `/storage/v1/object/sign/${BUCKET}`, { method: 'POST', body: { paths, expiresIn } });
  if (!Array.isArray(result.data) || result.data.length !== paths.length) throw new HttpError(503, '照片暫時無法載入。', 'storage_unavailable');
  const urls = new Map();
  for (const item of result.data) {
    if (!paths.includes(item.path) || urls.has(item.path) || item.error || typeof item.signedURL !== 'string') throw new HttpError(503, '照片尚未準備完成，請聯絡攝影師。', 'storage_unavailable');
    const value = item.signedURL.startsWith('/object/sign/') ? `/storage/v1${item.signedURL}` : item.signedURL;
    const url = new URL(value, config.url);
    if (url.origin !== config.url || decodeURIComponent(url.pathname) !== `/storage/v1/object/sign/${BUCKET}/${item.path}` || !url.searchParams.get('token')) throw new HttpError(503, '照片暫時無法載入。', 'storage_unavailable');
    urls.set(item.path, url.href);
  }
  if (urls.size !== paths.length) throw new HttpError(503, '照片暫時無法載入。', 'storage_unavailable');
  return urls;
}
export function ttlFor(expiresAt, maximum) {
  const ttl = Math.min(maximum, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  if (!Number.isFinite(ttl) || ttl < 1) throw new HttpError(403, '邀請已過期，請聯絡攝影師。', 'invitation_unavailable');
  return ttl;
}
