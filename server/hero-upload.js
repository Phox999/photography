import { getSecretConfig, HttpError } from './auth.js';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const invalid = () => new HttpError(400, '請選擇有效的 JPEG、PNG 或 WebP 圖片。', 'invalid_input');
const unavailable = () => new HttpError(503, '首頁照片上傳尚未確認，請稍後重新整理。', 'upload_unconfirmed');

export function assertHeroUpload(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin
      || request.headers.get('x-phox-request') !== '1'
      || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, '請從本站後台操作。', 'invalid_origin');
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'multipart/form-data') {
    throw new HttpError(415, '請使用圖片上傳表單。', 'invalid_content_type');
  }
}

async function readBounded(body, limit) {
  if (!body) throw invalid();
  const reader = body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, '首頁照片最多 8 MiB。', 'payload_too_large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function matchesType(bytes, type) {
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  return bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.slice(12, 16)));
}

export async function readHeroUpload(request) {
  const maxFormBytes = MAX_BYTES + 32768;
  if (Number(request.headers.get('content-length') || 0) > maxFormBytes) {
    throw new HttpError(413, '首頁照片最多 8 MiB。', 'payload_too_large');
  }
  const contentType = request.headers.get('content-type');
  if (!contentType || contentType.length > 512) throw invalid();
  const bytes = await readBounded(request.body, maxFormBytes);
  let form;
  try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(); } catch { throw invalid(); }
  if ([...form.keys()].some((key) => key !== 'file') || form.getAll('file').length !== 1) throw invalid();
  const file = form.get('file');
  if (!file || typeof file === 'string' || !Object.hasOwn(TYPES, file.type) || !file.size || file.size > MAX_BYTES) throw invalid();
  const image = new Uint8Array(await file.arrayBuffer());
  if (image.byteLength !== file.size || !matchesType(image, file.type)) throw invalid();
  return { bytes: image, type: file.type, path: `${crypto.randomUUID()}.${TYPES[file.type]}` };
}

export async function persistHeroUpload(env, upload) {
  const config = getSecretConfig(env);
  const headers = new Headers({
    apikey: config.key,
    'Content-Type': upload.type,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'x-upsert': 'false',
  });
  if (!config.key.startsWith('sb_secret_')) headers.set('Authorization', `Bearer ${config.key}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${config.url}/storage/v1/object/site-hero/${upload.path}`, {
      method: 'POST', headers, body: upload.bytes, signal: controller.signal, redirect: 'error', cache: 'no-store',
    });
    const text = await response.text();
    if (text.length > 16384) throw unavailable();
    let result;
    try { result = JSON.parse(text); } catch { throw unavailable(); }
    if (!response.ok || result?.Key !== `site-hero/${upload.path}`) throw unavailable();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unavailable();
  } finally { clearTimeout(timer); }
  return { path: upload.path, url: `${config.url}/storage/v1/object/public/site-hero/${upload.path}` };
}
