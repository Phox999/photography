import { assertMutation, endpoint, readJson, HttpError } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { guest, guestRpc, invalidInput, ttlFor, validId } from '../../_lib/client-gallery.js';
import { ARCHIVE_MAX_PHOTOS, readArchiveFiles, validateArchiveList, zipResponse } from '../../_lib/gallery-archive.js';
let activeArchives = 0;
export const onRequest = endpoint(async context => {
  const unsupported = allowMethods(context.request, ['POST']); if (unsupported) return unsupported;
  assertMutation(context.request);
  const auth = await guest(context);
  const body = await readJson(context.request, 4096);
  if (!Array.isArray(body.photoIds) || !body.photoIds.length || body.photoIds.length > ARCHIVE_MAX_PHOTOS || body.photoIds.some(id => !validId(id)) || new Set(body.photoIds).size !== body.photoIds.length) invalidInput();
  if (activeArchives >= 2) throw new HttpError(429, '正在準備其他下載，請稍候再試。', 'archive_busy');
  activeArchives++;
  let retained = false;
  try {
    const args = { p_photo_ids: body.photoIds };
    const list = validateArchiveList(await guestRpc(auth, 'client_download_archive', args), body.photoIds);
    ttlFor(list.expiresAt, 60);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const files = await readArchiveFiles(auth.config, list.photos, controller.signal);
      // Authorize again after the last byte: revocation, hidden/replaced photos and delivery changes fail before any ZIP is emitted.
      const latest = validateArchiveList(await guestRpc(auth, 'client_download_archive', args), body.photoIds);
      ttlFor(latest.expiresAt, 60);
      if (JSON.stringify(latest.photos) !== JSON.stringify(list.photos)) invalidInput();
      const response = zipResponse(files, `gallery-${list.galleryId}.zip`);
      // The response owns retained bytes until the stream closes/cancels.
      const reader = response.body.getReader(); let released = false;
      const release = () => { if (!released) { released = true; activeArchives--; } };
      const stream = new ReadableStream({ async pull(output) { try { const part = await reader.read(); if (part.done) { release(); output.close(); } else output.enqueue(part.value); } catch (error) { release(); output.error(error); } }, async cancel(reason) { try { await reader.cancel(reason); } finally { release(); } } });
      retained = true;
      return new Response(stream, { headers: response.headers });
    } finally { clearTimeout(timeout); }
  } finally { if (!retained) activeArchives--; }
});
