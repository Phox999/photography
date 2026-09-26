import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Astro may inline small processed scripts. Move only generated admin scripts
// to same-origin files so the production script-src 'self' policy stays usable.
export async function finalizeAdminBuild(outputDirectory) {
  const root = outputDirectory instanceof URL ? fileURLToPath(outputDirectory) : outputDirectory;
  const assetDirectory = path.join(root, '_astro');
  let externalized = 0;
  for (const route of ['admin', 'admin/login', 'admin/content', 'admin/audit', 'admin/galleries', 'admin/feedback', 'admin/availability']) {
    const file = path.join(root, route, 'index.html');
    let html = await fs.readFile(file, 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const [original, attributes, body] of scripts) {
      if (/\bsrc\s*=/i.test(attributes) || !body.trim()) continue;
      const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
      if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
      const hash = createHash('sha256').update(body).digest('hex').slice(0, 20);
      const filename = `admin-${hash}.js`;
      await fs.mkdir(assetDirectory, { recursive: true });
      await fs.writeFile(path.join(assetDirectory, filename), body, 'utf8');
      html = html.replace(original, `<script${attributes} src="/_astro/${filename}"></script>`);
      externalized++;
    }
    if (/\son[a-z]+\s*=/i.test(html)) throw new Error(`Admin build includes an inline event handler: ${route}`);
    await fs.writeFile(file, html, 'utf8');
  }
  return { externalized };
}

export default function adminBuildIntegration() {
  return {
    name: 'phox999-admin-csp',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const result = await finalizeAdminBuild(dir);
        logger.info(`Admin CSP: ${result.externalized} generated scripts externalized.`);
      },
    },
  };
}
