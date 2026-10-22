import { endpoint, json, requireAdmin } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { assertHeroUpload, persistHeroUpload, readHeroUpload } from '../../../server/hero-upload.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['POST']);
  if (unsupported) return unsupported;
  assertHeroUpload(context.request);
  await requireAdmin(context);
  const upload = await readHeroUpload(context.request, '首頁照片', { allowThumbnail: true });
  return json({ image: await persistHeroUpload(context.env, upload, 'site-hero', '首頁照片', context.performanceTimings) }, 201);
});
