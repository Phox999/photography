import { HttpError } from '../../server/auth.js';
import { BUCKET, objectPath, validId } from './client-gallery.js';
export const ARCHIVE_MAX_PHOTOS = 20;
export const ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;
const unavailable = () => new HttpError(503, '作品檔案暫時無法下載，請稍後重試。', 'archive_unavailable');
const tooLarge = () => new HttpError(413, '這批照片超過 32 MiB，請減少每批張數或使用單張下載。', 'archive_too_large');
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
export function crc32(chunks) {
  let crc = 0xffffffff;
  for (const chunk of chunks) for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function validateArchiveList(data, ids) {
  if (!data || !validId(data.galleryId) || !Array.isArray(data.photos) || data.photos.length !== ids.length) throw unavailable();
  const seen = new Set();
  for (const photo of data.photos) {
    if (!ids.includes(photo.id) || seen.has(photo.id)) throw unavailable();
    seen.add(photo.id);
    try { objectPath(photo.path, data.galleryId); } catch { throw unavailable(); }
    const extension = photo.path.split('.').pop();
    // Names are generated from IDs; titles never become filesystem paths.
    if (photo.filename !== `${photo.id}.${extension}`) throw unavailable();
  }
  return data;
}
export async function readArchiveFiles(config, photos, signal) {
  let total = 0, chunkCount = 0;
  const files = [];
  for (const photo of photos) {
    const url = new URL(`/storage/v1/object/authenticated/${BUCKET}/${photo.path}`, config.url);
    if (url.origin !== config.url) throw unavailable();
    const headers = { apikey: config.key };
    if (!config.key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${config.key}`;
    let response;
    try { response = await fetch(url.href, { headers, signal, redirect: 'error', cache: 'no-store' }); }
    catch { throw unavailable(); }
    if (!response.ok || !response.body || !/^image\/(?:jpeg|png|webp|avif)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel(); throw unavailable();
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > ARCHIVE_MAX_BYTES - total) { await response.body.cancel(); throw tooLarge(); }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.byteLength; size += value.byteLength;
        if (total > ARCHIVE_MAX_BYTES) { await reader.cancel(); throw tooLarge(); }
        if (++chunkCount > 8192) { await reader.cancel(); throw unavailable(); }
        chunks.push(value);
      }
    } catch (error) { if (error instanceof HttpError) throw error; throw unavailable(); }
    finally { reader.releaseLock(); }
    if (!size || (response.headers.has('content-length') && (!Number.isSafeInteger(length) || size !== length))) throw unavailable();
    files.push({ name: photo.filename, chunks, size, crc: crc32(chunks) });
  }
  return files;
}
function header(size) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
/** STORE ZIP: known CRC/sizes, UTF-8 flag, central directory, no copies of image chunks. */
export function zipResponse(files, filename = 'photos.zip') {
  const parts = [], directory = []; let offset = 0, directorySize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const local = header(30 + name.length); const v = local.view;
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true);
    v.setUint16(12, 33, true); v.setUint32(14, file.crc, true); v.setUint32(18, file.size, true); v.setUint32(22, file.size, true); v.setUint16(26, name.length, true); local.bytes.set(name, 30);
    const central = header(46 + name.length); const c = central.view;
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, file.crc, true); c.setUint32(20, file.size, true); c.setUint32(24, file.size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.bytes.set(name, 46);
    parts.push(local.bytes); for (const chunk of file.chunks) parts.push(chunk); directory.push(central.bytes); offset += local.bytes.length + file.size; directorySize += central.bytes.length;
    file.chunks = [];
  }
  const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, files.length, true); end.view.setUint16(10, files.length, true); end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  parts.push(...directory, end.bytes); let index = 0;
  const body = new ReadableStream({ pull(controller) { if (index === parts.length) { controller.close(); return; } const chunk = parts[index]; parts[index++] = null; controller.enqueue(chunk); }, cancel() { parts.length = 0; } });
  return new Response(body, { headers: { 'Content-Type': 'application/zip', 'Content-Length': String(offset + directorySize + 22), 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store', Pragma: 'no-cache', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } });
}
