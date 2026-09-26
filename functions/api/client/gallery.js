import { mapDraft, mapSelection } from '../../_lib/gallery-draft.js';
import { endpoint } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { clientJson, guest, guestRpc, signedPhotos, ttlFor } from '../../_lib/client-gallery.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET']);
  if (unsupported) return unsupported;
  const auth = await guest(context);
  const data = await guestRpc(auth, 'client_read_gallery');
  const seconds = ttlFor(data.expiresAt, 600);
  const paths = data.photos.map(photo => photo.preview_path);
  const signed = await signedPhotos(auth.config, [...new Set(paths)], seconds);
  return clientJson({
    gallery: { id: data.gallery.id, title: data.gallery.title, status: data.gallery.status,
      selectionLimit: data.gallery.selection_limit, allowDownloads: data.gallery.allow_downloads,
      expiresAt: data.expiresAt },
    photos: data.photos.map(photo => ({ id: photo.id, title: photo.title, previewUrl: signed.get(photo.preview_path),
      downloadable: data.gallery.status === 'delivered' && data.gallery.allow_downloads && Boolean(photo.delivery_path) })),
    selection: data.selection ? mapSelection(data.selection) : null,
    draft: data.selection ? null : mapDraft(data.draft),
  });
});
