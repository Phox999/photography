import { endpoint, getSupabaseConfig, HttpError, json, supabaseRequest } from '../../server/auth.js';
import { allowMethods } from '../../server/admin-validation.js';

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET']);
  if (unsupported) return unsupported;
  try {
    const config = getSupabaseConfig(context.env);
    // The database function only exposes published fields. An anonymous request
    // cannot select the content table or recover a disabled announcement.
    const result = await supabaseRequest(config, '/rest/v1/rpc/get_public_site_content', {
      method: 'POST', body: {},
    });
    const content = result.data;
    if (!content || typeof content.announcement !== 'string' || !Array.isArray(content.faqs) || !Number.isInteger(content.version)) {
      throw new HttpError(503, '網站內容暫時無法載入。', 'content_unavailable');
    }
    return json({
      announcement: content.announcement,
      faqs: content.faqs.map(({ question, answer }) => ({ question, answer })),
      version: content.version,
    }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' });
  } catch {
    // Static content remains readable if the database is unavailable or unconfigured.
    // Never leak configuration details or fall back to a privileged server key.
    throw new HttpError(503, '網站內容暫時無法載入。', 'content_unavailable');
  }
});
