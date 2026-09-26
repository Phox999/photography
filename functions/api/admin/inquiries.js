import { endpoint, json, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, exactCount, inquiryQuery, PAGE_SIZE } from '../../../server/admin-validation.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET']);
  if (unsupported) return unsupported;
  const { config, accessToken } = await requireAdmin(context);
  const { page, params } = inquiryQuery(new URL(context.request.url));
  const result = await supabaseRequest(config, `/rest/v1/collaboration_requests?${params}`, {
    accessToken,
    headers: { Prefer: 'count=exact' },
  });
  return json({ items: result.data ?? [], total: exactCount(result.headers), page, pageSize: PAGE_SIZE });
});
