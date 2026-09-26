import { assertMutation, endpoint, json, readJson, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, portfolioUpdate, rowResult } from '../../../server/admin-validation.js';
import { adminPortfolioResult } from '../../../server/portfolio-images.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method === 'PATCH') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  if (context.request.method === 'GET') {
    const result = await supabaseRequest(config, '/rest/v1/rpc/get_public_portfolio_content', { method: 'POST', body: {}, accessToken });
    return json(adminPortfolioResult(result.data, config));
  }
  const payload = portfolioUpdate(await readJson(context.request, 512 * 1024));
  const result = await supabaseRequest(config, '/rest/v1/rpc/admin_update_portfolio', {
    method: 'POST', accessToken, body: payload,
  });
  return json(adminPortfolioResult(rowResult(result.data), config));
});
