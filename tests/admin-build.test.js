import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { finalizeAdminBuild } from '../scripts/admin-build.mjs';

test('analytics admin module is externalized for the existing same-origin script policy', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'phox999-admin-build-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const routes = ['admin', 'admin/login', 'admin/content', 'admin/portfolio', 'admin/audit', 'admin/galleries', 'admin/feedback', 'admin/availability', 'admin/analytics'];
  for (const route of routes) {
    const directory = path.join(root, route);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), '<script type="module">window.analyticsReady = true;</script>', 'utf8');
  }

  const result = await finalizeAdminBuild(root);
  const analyticsHtml = await readFile(path.join(root, 'admin', 'analytics', 'index.html'), 'utf8');
  assert.equal(result.externalized, routes.length);
  assert.match(analyticsHtml, /<script type="module" src="\/_astro\/admin-[a-f0-9]{20}\.js"><\/script>/);
  assert.doesNotMatch(analyticsHtml, /window\.analyticsReady/);
});
