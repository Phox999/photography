import { HttpError, getSecretConfig, supabaseRequest } from './auth.js';

export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const invalid = () => new HttpError(400, '請選擇有效的 JPEG、PNG 或 WebP 圖片。', 'invalid_input');
const unavailable = () => new HttpError(503, '上傳尚未確認，請保留佇列並重試。', 'upload_unconfirmed');
export function assertUpload(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-phox-request') !== '1'
      || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, '請從本站操作。', 'invalid_origin');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'multipart/form-data') throw new HttpError(415, '請使用圖片上傳表單。', 'invalid_content_type');
}
async function bounded(body, limit) {
  if (!body) throw invalid();
  const reader = body.getReader(); const chunks = []; let count = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      count += value.byteLength;
      if (count > limit) { await reader.cancel(); throw new HttpError(413, '每張圖片最多 8 MiB。', 'payload_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readGalleryUpload(request) {
  const limit = UPLOAD_MAX_BYTES + 32768;
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, '每張圖片最多 8 MiB。', 'payload_too_large');
  const contentType = request.headers.get('content-type');
  if (!contentType || contentType.length > 512) throw invalid();
  const bytes = await bounded(request.body, limit);
  let form; try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(); } catch { throw invalid(); }
  const allowed = ['gallery_id', 'upload_id', 'kind', 'photo_id', 'title', 'file'];
  for (const key of form.keys()) if (!allowed.includes(key) || form.getAll(key).length !== 1) throw invalid();
  const galleryId = form.get('gallery_id'), uploadId = form.get('upload_id'), kind = form.get('kind');
  const photoId = form.get('photo_id') || null, title = form.get('title') || '';
  if (!UUID.test(galleryId) || !UUID.test(uploadId) || !['preview', 'delivery'].includes(kind)
      || (kind === 'delivery' ? !UUID.test(photoId) : photoId !== null)
      || typeof title !== 'string' || title.length > 160 || /[\u0000-\u001f\u007f]/.test(title)) throw invalid();
  const file = form.get('file');
  if (!file || typeof file === 'string' || !Object.hasOwn(TYPES, file.type) || !file.size) throw invalid();
  if (file.size > UPLOAD_MAX_BYTES) throw new HttpError(413, '每張圖片最多 8 MiB。', 'payload_too_large');
  const image = new Uint8Array(await file.arrayBuffer());
  const signature = image[0] === 255 && image[1] === 216 && image[2] === 255 ? 'image/jpeg'
    : [137,80,78,71,13,10,26,10].every((b,i) => image[i] === b) ? 'image/png'
    : image.length >= 16 && String.fromCharCode(...image.slice(0,4)) === 'RIFF'
      && String.fromCharCode(...image.slice(8,12)) === 'WEBP'
      && ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...image.slice(12,16))) ? 'image/webp' : '';
  if (signature !== file.type) throw invalid();
  const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), b => b.toString(16).padStart(2,'0')).join('');
  const imageHash = await hash(image);
  const fingerprint = await hash(new TextEncoder().encode(JSON.stringify([galleryId, uploadId, kind, photoId, title.trim(), file.type, imageHash])));
  return { galleryId, uploadId, kind, photoId, title: title.trim() || '未命名照片', fingerprint,
    path: `${galleryId}/${uploadId}-${imageHash}.${TYPES[file.type]}`, type: file.type, bytes: image };
}
export async function persistGalleryUpload(env, admin, upload) {
  // Check gallery membership before consuming storage. The RPC rechecks it under lock.
  const { data: rows } = await supabaseRequest(admin.config, `/rest/v1/client_galleries?id=eq.${upload.galleryId}&select=id&limit=1`, { accessToken: admin.accessToken });
  if (!rows?.[0]) throw new HttpError(404, '找不到相簿。', 'not_found');
  if (upload.kind === 'delivery') {
    const { data } = await supabaseRequest(admin.config, `/rest/v1/client_gallery_photos?id=eq.${upload.photoId}&gallery_id=eq.${upload.galleryId}&select=id&limit=1`, { accessToken: admin.accessToken });
    if (!data?.[0]) throw new HttpError(404, '找不到照片。', 'not_found');
  }
  const config = getSecretConfig(env);
  const headers = new Headers({ apikey: config.key, 'Content-Type': upload.type, 'x-upsert': 'false', 'Cache-Control': 'private, max-age=0' });
  if (!config.key.startsWith('sb_secret_')) headers.set('Authorization', `Bearer ${config.key}`);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${config.url}/storage/v1/object/client-galleries/${upload.path}`, { method:'POST', headers,
      body:upload.bytes, redirect:'error', cache:'no-store', signal:controller.signal });
    const bytes = await bounded(response.body, 16384); let result;
    try { result = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw unavailable(); }
    // Content-addressed paths plus overwrite=false make an identical retry safe.
    const duplicate = [400,409].includes(response.status) && [result?.error, result?.code].some(code => ['Duplicate','ResourceAlreadyExists','KeyAlreadyExists','already_exists'].includes(code));
    if (!duplicate && (!response.ok || result?.Key !== `client-galleries/${upload.path}`)) throw unavailable();
  } catch { throw unavailable(); } finally { clearTimeout(timer); }
  // Never delete after an ambiguous acknowledgement: a committed row may own this object.
  const { data } = await supabaseRequest(admin.config, '/rest/v1/rpc/admin_attach_gallery_upload', { method:'POST', accessToken:admin.accessToken,
    body:{ p_upload_id:upload.uploadId, p_gallery_id:upload.galleryId, p_kind:upload.kind, p_photo_id:upload.photoId,
      p_title:upload.title, p_path:upload.path, p_fingerprint:upload.fingerprint } });
  if (!data?.id || data.gallery_id !== upload.galleryId) throw unavailable();
  return data;
}
