import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import adminBuildIntegration from './scripts/admin-build.mjs';

const isPublicSitemapPage = (page) => {
  const pathname = new URL(page).pathname;
  return !/^\/(?:admin|client|cooperation-status)(?:\/|$)/.test(pathname)
    && !/^\/404(?:\.html)?\/?$/.test(pathname);
};

export default defineConfig({
  output: 'static',
  site: 'https://phox999.com',
  integrations: [
    sitemap({
      filter: isPublicSitemapPage,
    }),
    adminBuildIntegration(),
  ],
});
