import { handlePublicPage } from '../server/public-page-routing.js';

export async function onRequest(context) {
  return await handlePublicPage(context) ?? context.next();
}
