import { endpoint, json, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, exactCount, PAGE_SIZE, parsePage } from '../../../server/admin-validation.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET']);
  if (unsupported) return unsupported;
  const { config, accessToken } = await requireAdmin(context);
  const page = parsePage(new URL(context.request.url));
  const params = new URLSearchParams({
    select: 'id,actor_id,action,target_id,metadata,created_at',
    order: 'created_at.desc,id.desc',
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
  });
  const result = await supabaseRequest(config, `/rest/v1/audit_logs?${params}`, {
    accessToken, headers: { Prefer: 'count=exact' },
  });
  return json({ items: result.data ?? [], total: exactCount(result.headers), page, pageSize: PAGE_SIZE });
});
