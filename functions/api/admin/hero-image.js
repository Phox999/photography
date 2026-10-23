import { endpoint, json, requireAdmin } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { assertHeroUpload, persistHeroUpload, readHeroUpload } from '../../../server/hero-upload.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['POST']);
  if (unsupported) return unsupported;
  assertHeroUpload(context.request);
  await requireAdmin(context);
  // This endpoint's client sends both the original and a WebP thumbnail.
  // Keep the helper's default strict for callers that do not use thumbnails.
  const upload = await readHeroUpload(context.request, '首頁照片', { allowThumbnail: true });
  return json({ image: await persistHeroUpload(context.env, upload) }, 201);
});
