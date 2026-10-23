import { assertMutation, endpoint, getSecretConfig, json, readJson, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods, portfolioUpdate, rowResult } from '../../../server/admin-validation.js';
import { adminPortfolioResult } from '../../../server/portfolio-images.js';
import { imageThumbnailUrls } from '../../../server/storage-thumbnails.js';

async function portfolioResponse(data, config, env) {
  const imagePaths = Array.isArray(data?.collections)
    ? data.collections.flatMap((collection) => [collection?.cover, ...(Array.isArray(collection?.images) ? collection.images : [])])
      .filter((path) => typeof path === 'string')
    : [];
  let storageConfig = null;
  if (imagePaths.some((path) => !path.startsWith('static:'))) {
    try { storageConfig = getSecretConfig(env); } catch { /* Optional legacy thumbnail inventory. */ }
  }
  const thumbnails = await imageThumbnailUrls(storageConfig, 'site-portfolio', imagePaths);
  return json(adminPortfolioResult(data, config, thumbnails));
}

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method === 'PATCH') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  if (context.request.method === 'GET') {
    const result = await supabaseRequest(config, '/rest/v1/rpc/get_public_portfolio_content', { method: 'POST', body: {}, accessToken });
    return portfolioResponse(result.data, config, context.env);
  }
  const payload = portfolioUpdate(await readJson(context.request, 512 * 1024));
  const result = await supabaseRequest(config, '/rest/v1/rpc/admin_update_portfolio', {
    method: 'POST', accessToken, body: payload,
  });
  return portfolioResponse(rowResult(result.data), config, context.env);
});
