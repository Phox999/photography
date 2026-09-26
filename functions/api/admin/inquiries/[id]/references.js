import { endpoint, getSecretConfig, HttpError, json, requireAdmin, supabaseRequest } from '../../../../../server/auth.js';
import { allowMethods, parseId } from '../../../../../server/admin-validation.js';
import { signedInquiryReferences } from '../../../../../server/inquiry-references.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET']);
  if (unsupported) return unsupported;
  const { config, accessToken } = await requireAdmin(context);
  const id = parseId(context.params.id);
  const query = new URLSearchParams({ select: 'id,reference_links,reference_images', id: `eq.${id}`, limit: '1' });
  // The row read stays user-scoped so the existing admin RLS policy still applies.
  const { data } = await supabaseRequest(config, `/rest/v1/collaboration_requests?${query}`, { accessToken });
  if (!Array.isArray(data)) throw new HttpError(503, '參考資料暫時無法讀取。', 'upstream_unavailable');
  if (data.length === 0) throw new HttpError(404, '找不到這筆合作意向。', 'not_found');
  if (data.length !== 1 || data[0]?.id?.toLowerCase() !== id.toLowerCase()) throw new HttpError(503, '參考資料暫時無法讀取。', 'upstream_unavailable');
  return json(await signedInquiryReferences(getSecretConfig(context.env), data[0]));
});
