import { assertMutation, endpoint, readJson } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { clientJson, guest, guestRpc, invalidInput, signedPhotos, ttlFor, validId } from '../../_lib/client-gallery.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['POST']);
  if (unsupported) return unsupported;
  assertMutation(context.request);
  const auth = await guest(context);
  const body = await readJson(context.request, 1024);
  if (!validId(body.photoId)) invalidInput();
  const data = await guestRpc(auth, 'client_download_photo', { p_photo_id: body.photoId });
  const expiresIn = ttlFor(data.expiresAt, 60);
  const signed = await signedPhotos(auth.config, [data.path], expiresIn);
  const url = new URL(signed.get(data.path));
  url.searchParams.set('download', data.filename);
  return clientJson({ url: url.href, expiresIn });
});
