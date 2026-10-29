import { defineConfig } from 'astro/config';
export default defineConfig({
  publicDir: '../../public',
  output: 'static',
  server: { host: '127.0.0.1', port: 4329 },
  vite: { server: { watch: { ignored: ['**/public/**','**/dist/**','**/.design-preview-dist/**','**/.git/**'] } } }
});
