import { assertMutation, endpoint, json, readJson, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, rowResult } from '../../../server/admin-validation.js';
import { availabilityItem, availabilityRange, availabilityWrite } from '../../../server/availability.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'POST', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method !== 'GET') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  if (context.request.method === 'GET') {
    const range = availabilityRange(new URL(context.request.url), true);
    const result = await supabaseRequest(config, '/rest/v1/rpc/get_admin_availability', {
      method: 'POST', accessToken, body: { p_from: range.from, p_to: range.to },
    });
    if (!Array.isArray(result.data)) throw new Error('invalid availability');
    return json({ items: result.data.map(availabilityItem) });
  }
  const body = availabilityWrite(await readJson(context.request, 4096), context.request.method === 'PATCH');
  const result = await supabaseRequest(config, '/rest/v1/rpc/admin_save_availability', { method: 'POST', accessToken, body });
  return json({ item: availabilityItem(rowResult(result.data)) }, context.request.method === 'POST' ? 201 : 200);
});
