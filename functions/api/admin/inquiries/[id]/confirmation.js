import { assertMutation, endpoint, json, readJson, requireAdmin, supabaseRequest } from '../../../../../server/auth.js';
import { allowMethods, parseId } from '../../../../../server/admin-validation.js';
import { confirmationUpdate } from '../../../../../server/inquiry-workflow.js';
import { CONFIRMATION_BODY_MAX_BYTES } from '../../../../../src/lib/confirmation-request-size.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method === 'PATCH') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  const id = parseId(context.params.id);
  const update = context.request.method === 'PATCH' ? confirmationUpdate(await readJson(context.request, CONFIRMATION_BODY_MAX_BYTES)) : null;
  const { data } = await supabaseRequest(config, `/rest/v1/rpc/${update ? 'admin_update_shoot_confirmation' : 'admin_get_shoot_confirmation'}`, {
    method: 'POST', accessToken, body: { p_inquiry_id: id, ...(update ?? {}) },
  });
  return json({ item: data });
});
