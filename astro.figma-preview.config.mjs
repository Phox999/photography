import { mergeConfig } from 'astro/config';
import base from './astro.config.mjs';

// Read-only live content for the local static preview. Submission is not proxied.
export default mergeConfig(base, {
  devToolbar: { enabled: false },
  outDir: './.figma-preview-build',
  vite: { server: { proxy: {
    '^/api/(availability|site-content)(\\?|$)': {
      target: 'https://dev-photography.andrewtan088.workers.dev',
      changeOrigin: true,
    },
  } } },
});
