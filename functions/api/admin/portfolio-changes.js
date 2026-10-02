import { assertMutation, endpoint, json, readJson, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, parseVersion, portfolioChanges, rowResult } from '../../../server/admin-validation.js';
import { adminPortfolioResult } from '../../../server/portfolio-images.js';
import { PORTFOLIO_CHANGES_MAX_BYTES } from '../../../src/lib/portfolio-changes.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['PATCH']);
  if (unsupported) return unsupported;
  assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  const payload = portfolioChanges(await readJson(context.request, PORTFOLIO_CHANGES_MAX_BYTES));
  const result = await supabaseRequest(config, '/rest/v1/rpc/admin_update_portfolio_changes', {
    method: 'POST', accessToken, body: payload,
  });
  return json(adminPortfolioResult(rowResult(result.data), config));
});
