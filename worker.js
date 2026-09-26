import { onRequest as authAction } from './functions/api/auth/[action].js';
import { onRequest as siteContent } from './functions/api/site-content.js';
import { onRequest as inquiries } from './functions/api/inquiries.js';
import { onRequest as feedback } from './functions/api/feedback.js';
import { onRequest as cooperation } from './functions/api/cooperation.js';
import { onRequestGet as publicAvailabilityGet } from './functions/api/availability.js';
import { onRequest as adminOverview } from './functions/api/admin/overview.js';
import { onRequest as adminInquiries } from './functions/api/admin/inquiries.js';
import { onRequest as adminInquiry } from './functions/api/admin/inquiries/[id].js';
import { onRequest as adminInquiryReferences } from './functions/api/admin/inquiries/[id]/references.js';
import { onRequest as adminInquiryConfirmation } from './functions/api/admin/inquiries/[id]/confirmation.js';
import { onRequest as adminContent } from './functions/api/admin/content.js';
import { onRequest as adminAvailability } from './functions/api/admin/availability.js';
import { onRequest as adminAudit } from './functions/api/admin/audit.js';
import { onRequest as adminGalleries } from './functions/api/admin/galleries.js';
import { onRequest as adminGalleryUpload } from './functions/api/admin/gallery-upload.js';
import { onRequest as adminFeedback } from './functions/api/admin/feedback.js';
import { onRequest as clientSelection } from './functions/api/client/selection.js';
import { onRequest as clientGallery } from './functions/api/client/gallery.js';
import { onRequest as clientDraft } from './functions/api/client/draft.js';
import { onRequest as clientDownload } from './functions/api/client/download.js';
import { onRequest as clientArchive } from './functions/api/client/archive.js';
import { json } from './server/auth.js';

async function publicAvailability(context) {
  if (context.request.method !== 'GET') {
    return json({ success: false, message: '不支援此操作。', code: 'method_not_allowed' }, 405, { Allow: 'GET' });
  }
  return publicAvailabilityGet(context);
}

const apiRoutes = [
  [/^\/api\/auth\/([^/]+)$/, authAction, ['action']],
  [/^\/api\/site-content$/, siteContent],
  [/^\/api\/inquiries$/, inquiries],
  [/^\/api\/feedback$/, feedback],
  [/^\/api\/cooperation$/, cooperation],
  [/^\/api\/availability$/, publicAvailability],
  [/^\/api\/admin\/overview$/, adminOverview],
  [/^\/api\/admin\/inquiries$/, adminInquiries],
  [/^\/api\/admin\/inquiries\/([^/]+)\/references$/, adminInquiryReferences, ['id']],
  [/^\/api\/admin\/inquiries\/([^/]+)\/confirmation$/, adminInquiryConfirmation, ['id']],
  [/^\/api\/admin\/inquiries\/([^/]+)$/, adminInquiry, ['id']],
  [/^\/api\/admin\/content$/, adminContent],
  [/^\/api\/admin\/availability$/, adminAvailability],
  [/^\/api\/admin\/audit$/, adminAudit],
  [/^\/api\/admin\/galleries$/, adminGalleries],
  [/^\/api\/admin\/gallery-upload$/, adminGalleryUpload],
  [/^\/api\/admin\/feedback$/, adminFeedback],
  [/^\/api\/client\/selection$/, clientSelection],
  [/^\/api\/client\/gallery$/, clientGallery],
  [/^\/api\/client\/draft$/, clientDraft],
  [/^\/api\/client\/download$/, clientDownload],
  [/^\/api\/client\/archive$/, clientArchive],
];

function jsonNotFound() {
  return new Response(JSON.stringify({ success: false, message: '找不到此功能。', code: 'not_found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function decodeParams(match, names = []) {
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
}

export default {
  async fetch(request, env, executionContext) {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
      for (const [pattern, handler, paramNames = []] of apiRoutes) {
        const match = pathname.match(pattern);
        if (!match) continue;

        try {
          return await handler({
            request,
            env,
            params: decodeParams(match, paramNames),
            waitUntil: (promise) => executionContext.waitUntil(promise),
            passThroughOnException: () => executionContext.passThroughOnException(),
          });
        } catch {
          return new Response(JSON.stringify({ success: false, message: '服務暫時無法使用，請稍後再試。', code: 'service_unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
          });
        }
      }

      return jsonNotFound();
    }

    return env.ASSETS.fetch(request);
  },
};
