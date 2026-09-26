import { endpoint, json, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, exactCount, STATUSES } from '../../../server/admin-validation.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET']);
  if (unsupported) return unsupported;
  const { config, accessToken } = await requireAdmin(context);
  const counts = await Promise.all(['total', ...STATUSES].map(async (status) => {
    const params = new URLSearchParams({ select: 'id', limit: '1' });
    if (status !== 'total') params.set('status', `eq.${status}`);
    const result = await supabaseRequest(config, `/rest/v1/collaboration_requests?${params}`, {
      method: 'HEAD', accessToken, headers: { Prefer: 'count=exact' },
    });
    return [status, exactCount(result.headers)];
  }));
  return json({ counts: Object.fromEntries(counts) });
});
