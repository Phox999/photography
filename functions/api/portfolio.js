import { endpoint, getSupabaseConfig, HttpError, json, supabaseRequest } from '../../server/auth.js';
import { allowMethods } from '../../server/admin-validation.js';
import { publicPortfolioResult } from '../../server/portfolio-images.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET']);
  if (unsupported) return unsupported;
  try {
    const config = getSupabaseConfig(context.env);
    const result = await supabaseRequest(config, '/rest/v1/rpc/get_public_portfolio_content', {
      method: 'POST', body: {}, timeoutMs: context.publicReadTimeoutMs,
    });
    return json(publicPortfolioResult(result.data, config), 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' });
  } catch {
    throw new HttpError(503, '作品集暫時無法載入。', 'portfolio_unavailable');
  }
});
