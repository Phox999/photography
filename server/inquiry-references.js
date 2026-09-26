import { HttpError, readJson, supabaseRequest } from './auth.js';
import { existingReceipt, receiptResult } from './inquiry-workflow.js';

export const REFERENCE_BUCKET = 'inquiry-references';
export const REFERENCE_LIMIT = 3;
export const REFERENCE_MAX_BYTES = 4 * 1024 * 1024;
export const INQUIRY_JSON_MAX_BYTES = 20 * 1024;
export const MULTIPART_MAX_BYTES = REFERENCE_LIMIT * REFERENCE_MAX_BYTES + INQUIRY_JSON_MAX_BYTES + 64 * 1024;
export const REFERENCE_URL_TTL = 300;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const OBJECT_PATH = new RegExp(`^${UUID}/${UUID}\\.(jpg|png|webp)$`);
const invalid = (message = '參考資料格式不正確。') => new HttpError(400, message, 'invalid_references');
const tooLarge = () => new HttpError(413, '參考圖片每張最多 4 MiB，最多 3 張。', 'payload_too_large');
const storageError = () => new HttpError(503, '參考圖片暫時無法儲存或讀取，請稍後再試。', 'storage_unavailable');

// Content-Length alone is insufficient: chunked bodies are capped before formData
// can buffer or parse any multipart parts.
async function boundedBytes(body, maxBytes, onOversize, onInvalid) {
  if (!body) throw onInvalid();
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* Keep the size error. */ }
        throw onOversize();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw onInvalid();
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function referenceLinks(value = []) {
  if (!Array.isArray(value) || value.length > REFERENCE_LIMIT) throw invalid('參考連結最多 3 個。');
  return value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.length > 2048 || /[\u0000-\u001f\u007f]/.test(item)) {
      throw invalid('請輸入完整的 HTTP 或 HTTPS 參考連結，每個最多 2048 字。');
    }
    let url;
    try { url = new URL(item.trim()); } catch { throw invalid('請輸入完整的 HTTP 或 HTTPS 參考連結。'); }
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 2048) {
      throw invalid('參考連結需使用 HTTP 或 HTTPS，且不可包含帳號密碼。');
    }
    // Links are stored as text only. The server never follows them.
    return url.href;
  });
}

export async function readInquirySubmission(request) {
  const contentType = request.headers.get('content-type') || '';
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (mediaType === 'application/json') return { body: await readJson(request, INQUIRY_JSON_MAX_BYTES), files: [] };
  if (mediaType !== 'multipart/form-data') throw new HttpError(415, '請使用 JSON 或 multipart/form-data 格式送出。', 'invalid_content_type');
  if (contentType.length > 512) throw invalid();
  if (Number(request.headers.get('content-length') || 0) > MULTIPART_MAX_BYTES) throw tooLarge();
  const bytes = await boundedBytes(request.body, MULTIPART_MAX_BYTES, tooLarge, invalid);
  let form;
  try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw invalid('提交資料格式不正確，請重新選擇圖片後再試。'); }
  const values = form.getAll('payload');
  if (values.length !== 1 || typeof values[0] !== 'string') throw invalid('請提供一份表單資料。');
  if (new TextEncoder().encode(values[0]).byteLength > INQUIRY_JSON_MAX_BYTES) throw new HttpError(413, '提交資料過大。', 'payload_too_large');
  if ([...form.keys()].some((key) => !['payload', 'reference_images'].includes(key))) throw invalid();
  let body;
  try { body = JSON.parse(values[0]); } catch { throw invalid('提交資料格式不正確。'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const files = form.getAll('reference_images');
  if (files.length > REFERENCE_LIMIT) throw invalid('參考圖片最多 3 張。');
  if (files.some((file) => typeof file === 'string' || typeof file.arrayBuffer !== 'function')) throw invalid('請選擇有效的參考圖片檔案。');
  return { body, files };
}

function imageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.slice(12, 16)))) return 'image/webp';
  return '';
}

function safeFilename(value, extension) {
  const basename = String(value || '').normalize('NFKC').split(/[\\/]/).pop();
  const stem = basename.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f\u007f<>:"|?*\\/]/g, '-').replace(/^[.\s]+|[.\s]+$/g, '');
  let safe = '';
  for (const character of stem || 'reference') {
    // Iteration keeps surrogate pairs together; replace malformed lone surrogates
    // because PostgreSQL JSONB rejects them even when JSON.stringify escapes them.
    const next = /^[\uD800-\uDFFF]$/.test(character) ? '-' : character;
    if (safe.length + next.length > 120 - extension.length - 1) break;
    safe += next;
  }
  return `${safe}.${extension}`;
}

export async function validateReferenceImages(files) {
  if (files.length > REFERENCE_LIMIT) throw invalid('參考圖片最多 3 張。');
  const images = [];
  let total = 0;
  for (const file of files) {
    if (file.size > REFERENCE_MAX_BYTES) throw tooLarge();
    if (!file.size || !Object.hasOwn(TYPES, file.type)) throw invalid('參考圖片僅接受 JPEG、PNG 或 WebP。');
    total += file.size;
    if (total > REFERENCE_LIMIT * REFERENCE_MAX_BYTES) throw tooLarge();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size || imageType(bytes) !== file.type) throw invalid('圖片內容與格式不符，請選擇有效的 JPEG、PNG 或 WebP。');
    images.push({ name: safeFilename(file.name, TYPES[file.type]), type: file.type, size: bytes.byteLength, bytes });
  }
  return images;
}

// Unlike supabaseRequest, this sends raw bytes, never JSON or public credentials.
// getSecretConfig validated the key: new secret keys use apikey alone; legacy
// service_role JWTs additionally use Authorization, matching server/auth.js.
async function uploadObject(config, path, image) {
  const headers = new Headers({ apikey: config.key, 'Content-Type': image.type, 'Cache-Control': 'private, max-age=0', 'x-upsert': 'false' });
  if (!config.key.startsWith('sb_secret_')) headers.set('Authorization', `Bearer ${config.key}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const result = await fetch(`${config.url}/storage/v1/object/${REFERENCE_BUCKET}/${path}`, {
      method: 'POST', headers, body: image.bytes, signal: controller.signal, redirect: 'error', cache: 'no-store',
    });
    const bytes = result.body ? await boundedBytes(result.body, 16 * 1024, storageError, storageError) : new Uint8Array();
    if (!result.ok) throw storageError();
    let data;
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw storageError(); }
    if (!data || data.Key !== `${REFERENCE_BUCKET}/${path}`) throw storageError();
  } catch { throw storageError(); }
  finally { clearTimeout(timeout); }
}

async function removeObjects(config, paths) {
  if (!paths.length) return;
  // Retry once for a transient cleanup failure; removing a missing object is safe.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await supabaseRequest(config, `/storage/v1/object/${REFERENCE_BUCKET}`, { method: 'DELETE', body: { prefixes: paths } });
      return;
    } catch {
      if (attempt === 1) throw new HttpError(503, '提交未完成，圖片清理暫時失敗，請稍後再試。', 'reference_cleanup_failed');
    }
  }
}

export async function persistInquiry(config, payload, images, workflow) {
  if (workflow) {
    const existing = await existingReceipt(config, workflow);
    if (existing) return existing;
  }
  const attemptedPaths = [];
  const metadata = [];
  const prefix = images.length ? crypto.randomUUID() : '';
  try {
    for (const image of images) {
      const path = `${prefix}/${crypto.randomUUID()}.${TYPES[image.type]}`;
      // Include the in-flight object: an upstream timeout can occur after a write.
      attemptedPaths.push(path);
      await uploadObject(config, path, image);
      metadata.push({ name: image.name, type: image.type, size: image.size, path });
    }
  } catch (error) {
    await removeObjects(config, attemptedPaths);
    throw error;
  }
  let result;
  try {
    const row = { ...payload, ...(metadata.length ? { reference_images: metadata } : {}) };
    if (workflow) {
      result = (await supabaseRequest(config, '/rest/v1/rpc/submit_workflow_inquiry', {
        method: 'POST', body: { p_submission_id: workflow.submissionId, p_token_hash: workflow.tokenHash,
          p_request_hash: workflow.requestHash, p_payload: row },
      })).data;
      if (typeof result?.created !== 'boolean') throw new HttpError(503, '無法確認提交結果。', 'upstream_unavailable');
      // Validate the acknowledgement inside the ambiguous-write protection.
      receiptResult(result, workflow.token);
    } else {
      await supabaseRequest(config, '/rest/v1/collaboration_requests', {
        method: 'POST', body: row, headers: { Prefer: 'return=minimal' },
      });
    }
  } catch (error) {
    // The database can commit before its response is lost. Delete only when the
    // existing helper identifies a definitive rejection; preserving the objects
    // on an ambiguous 5xx/transport failure avoids breaking a saved inquiry.
    if (error instanceof HttpError && [400, 401, 403, 404, 409, 413, 429].includes(error.status)) {
      await removeObjects(config, attemptedPaths);
      throw error;
    }
    throw new HttpError(503, workflow ? '暫時無法確認是否送出，請保留表單並重試；相同資料不會重複建立。' : '暫時無法確認是否送出，請聯絡攝影師確認，避免重複提交。', 'inquiry_submission_unconfirmed');
  }
  // Two identical requests can both finish uploading before the RPC serializes
  // them. Delete only the losing request's unused objects after a valid replay.
  if (workflow && result.created === false) await removeObjects(config, attemptedPaths);
  return workflow ? receiptResult(result, workflow.token) : undefined;
}

export async function signedInquiryReferences(config, row) {
  let links;
  try { links = referenceLinks(row.reference_links ?? []); } catch { throw storageError(); }
  const images = row.reference_images ?? [];
  if (!Array.isArray(images) || images.length > REFERENCE_LIMIT) throw storageError();
  for (const item of images) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name || item.name.length > 120
      || /[\u0000-\u001f\u007f<>:"|?*\\/]/.test(item.name) || !Object.hasOwn(TYPES, item.type)
      || !Number.isInteger(item.size) || item.size < 1 || item.size > REFERENCE_MAX_BYTES
      || typeof item.path !== 'string' || !OBJECT_PATH.test(item.path) || !item.path.endsWith(`.${TYPES[item.type]}`)) throw storageError();
  }
  const paths = images.map((item) => item.path);
  if (new Set(paths).size !== paths.length) throw storageError();
  if (!paths.length) return { reference_links: links, reference_images: [], expires_in: REFERENCE_URL_TTL };
  const { data } = await supabaseRequest(config, `/storage/v1/object/sign/${REFERENCE_BUCKET}`, { method: 'POST', body: { paths, expiresIn: REFERENCE_URL_TTL } });
  if (!Array.isArray(data) || data.length !== paths.length) throw storageError();
  const urls = new Map();
  for (const item of data) {
    if (!item || !paths.includes(item.path) || urls.has(item.path) || item.error || typeof item.signedURL !== 'string') throw storageError();
    let url;
    try {
      const value = item.signedURL.startsWith('/object/sign/') ? `/storage/v1${item.signedURL}` : item.signedURL;
      url = new URL(value, config.url);
      if (url.origin !== config.url || url.username || url.password || url.hash
        || decodeURIComponent(url.pathname) !== `/storage/v1/object/sign/${REFERENCE_BUCKET}/${item.path}` || !url.searchParams.get('token')) throw storageError();
    } catch { throw storageError(); }
    urls.set(item.path, url.href);
  }
  return { reference_links: links, reference_images: images.map(({ name, type, size, path }) => ({ name, type, size, url: urls.get(path) })), expires_in: REFERENCE_URL_TTL };
}
