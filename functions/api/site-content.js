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
    const heroPath = content?.hero_image_path;
    if (!content || typeof content.announcement !== 'string' || !Array.isArray(content.faqs) || !Number.isInteger(content.version)
      || typeof content.hero_title !== 'string' || typeof content.hero_copy !== 'string'
      || (heroPath !== null && (typeof heroPath !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(heroPath)))) {
      throw new HttpError(503, '網站內容暫時無法載入。', 'content_unavailable');
    }
    return json({
      announcement: content.announcement,
      faqs: content.faqs.map(({ question, answer }) => ({ question, answer })),
      hero_title: content.hero_title,
      hero_copy: content.hero_copy,
      hero_image_url: heroPath ? `${config.url}/storage/v1/object/public/site-hero/${heroPath}` : null,
      version: content.version,
    }, 200, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' });
  } catch {
    // Static content remains readable if the database is unavailable or unconfigured.
    // Never leak configuration details or fall back to a privileged server key.
    throw new HttpError(503, '網站內容暫時無法載入。', 'content_unavailable');
  }
});
