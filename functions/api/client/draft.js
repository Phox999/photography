import { assertMutation, endpoint, readJson } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { clientJson, guest, guestRpc } from '../../_lib/client-gallery.js';
import { mapDraft, selectionInput, versionInput } from '../../_lib/gallery-draft.js';
export const onRequest = endpoint(async context => {
  const unsupported = allowMethods(context.request, ['POST']); if (unsupported) return unsupported;
  assertMutation(context.request);
  const auth = await guest(context);
  const body = await readJson(context.request, 512 * 1024);
  const data = await guestRpc(auth, 'client_save_draft', { ...selectionInput(body, true), p_expected_version: versionInput(body.version) });
  if (data.conflict) return clientJson({ code: 'draft_conflict', draft: mapDraft(data.draft) }, 409);
  return clientJson({ draft: mapDraft(data) });
});
