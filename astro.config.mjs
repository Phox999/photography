import { defineConfig } from 'astro/config';
import adminBuildIntegration from './scripts/admin-build.mjs';

export default defineConfig({
  output: 'static',
  integrations: [adminBuildIntegration()],
});
