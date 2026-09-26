import { endpoint, json, requireAdmin } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { assertUpload, readGalleryUpload, persistGalleryUpload } from '../../../server/gallery-upload.js';
export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['POST']); if (unsupported) return unsupported;
  assertUpload(context.request);
  const admin = await requireAdmin(context);
  const upload = await readGalleryUpload(context.request);
  return json({ photo: await persistGalleryUpload(context.env, admin, upload) }, 201);
});
