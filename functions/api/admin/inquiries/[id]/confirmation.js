import { assertMutation, endpoint, json, readJson, requireAdmin, supabaseRequest } from '../../../../../server/auth.js';
import { allowMethods, parseId } from '../../../../../server/admin-validation.js';
import { confirmationUpdate } from '../../../../../server/inquiry-workflow.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method === 'PATCH') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  const id = parseId(context.params.id);
  const update = context.request.method === 'PATCH' ? confirmationUpdate(await readJson(context.request, 16 * 1024)) : null;
  const { data } = await supabaseRequest(config, `/rest/v1/rpc/${update ? 'admin_update_shoot_confirmation' : 'admin_get_shoot_confirmation'}`, {
    method: 'POST', accessToken, body: { p_inquiry_id: id, ...(update ?? {}) },
  });
  return json({ item: data });
});
