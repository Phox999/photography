import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { publicFaqView } from '../src/lib/faq-state.js';

const source = await readFile(new URL('../src/lib/site-content.ts', import.meta.url), 'utf8');
const loaderCode = (await transform(source, { loader: 'ts', format: 'cjs' })).code;
const published = {
  announcement: '新版公告', hero_title: '新版主標', hero_copy: '新版合作介紹',
  hero_image_urls: [], faqs: [{ question: '新版問題', answer: '新版回答' }],
};
const fallbackFaqs = [{ question: '預設問題', answer: '預設回答' }];

function setup(snapshot, response = new Response('Unavailable', { status: 503 })) {
  let requests = 0;
  const title = { textContent: published.hero_title };
  const copy = { textContent: published.hero_copy };
  const section = { hidden: false };
  const grid = {
    children: [], closest: () => section,
    replaceChildren(...children) { this.children = children; },
  };
  const hero = { querySelector(selector) {
    if (selector === '.hero__media') return { querySelectorAll: () => [] };
    return selector === '[data-hero-title]' ? title : copy;
  } };
  const sandbox = vm.createContext({
    module: { exports: {} }, URL, AbortController,
    window: { setTimeout, clearTimeout, setInterval },
    document: {
      querySelector(selector) {
        if (selector === '#phox999-public-content') return snapshot == null ? null : { textContent: snapshot };
        if (selector === '[data-hero-carousel]') return hero;
        if (selector === '#faq .faq-grid') return grid;
        return null;
      },
      createElement(tag) { return { tag, children: [], append(...nodes) { this.children.push(...nodes); } }; },
    },
    fetch: async () => { requests++; return response.clone(); },
    require: () => ({ faqItems: fallbackFaqs }),
  });
  vm.runInContext(loaderCode, sandbox);
  const content = sandbox.module.exports;
  sandbox.require = (path) => path.includes('faq-state') ? { publicFaqView } : content;
  return { sandbox, content, title, copy, section, grid, requests: () => requests };
}

async function runConsumer(file, sandbox) {
  const astro = await readFile(new URL(`../src/components/${file}.astro`, import.meta.url), 'utf8');
  const script = astro.match(/<script>([\s\S]*?)<\/script>/)[1];
  const compiled = await transform(`(async () => {${script.replace(/^\s*import[^\n]*;\s*$/gm, '')}})()`, { loader: 'ts' });
  // Execute the real component scripts with the same content loader.
  sandbox.loadPublicSiteContent = sandbox.module.exports.loadPublicSiteContent;
  sandbox.publicFaqView = publicFaqView;
  await vm.runInContext(compiled.code, sandbox);
}

test('server snapshot keeps hero and FAQ consistent even when the API would return 503', async () => {
  const app = setup(JSON.stringify(published));
  await Promise.all([runConsumer('Hero', app.sandbox), runConsumer('FAQ', app.sandbox)]);
  assert.equal(app.requests(), 0);
  assert.equal(app.title.textContent, published.hero_title);
  assert.equal(app.copy.textContent, published.hero_copy);
  assert.equal(app.grid.children[0].children[0].textContent, published.faqs[0].question);
  assert.equal(app.grid.children[0].children[1].textContent, published.faqs[0].answer);
});

test('empty published FAQs stay empty instead of reverting to static questions', async () => {
  const app = setup(JSON.stringify({ ...published, faqs: [] }));
  await runConsumer('FAQ', app.sandbox);
  assert.equal(app.grid.children.length, 0);
  assert.equal(app.section.hidden, true);
  assert.equal(app.requests(), 0);
});

test('snapshot validates server-normalized local hero URLs without broadening the allowlist', async () => {
  const image = 'https://phox999.com/assets/portfolio/6-20%E6%B5%B7%E9%82%8Ajk_/IMG_9630.webp';
  const app = setup(JSON.stringify({ ...published, hero_image_urls: [image] }));
  assert.equal((await app.content.loadPublicSiteContent()).hero_image_urls[0], image);
  assert.equal(app.requests(), 0);
  assert.equal(app.content.validatePublicSiteContent({ ...published, hero_image_urls: ['https://phox999.com/assets/unknown.webp'] }), null);
  assert.equal(app.content.validatePublicSiteContent({ ...published, hero_image_urls: [image + '?extra=1'] }), null);
});

test('static pages share one API request and ignore malformed or invalid snapshots', async () => {
  for (const snapshot of [null, '{broken', JSON.stringify({ ...published, hero_title: '' })]) {
    const app = setup(snapshot, Response.json(published));
    const first = app.content.loadPublicSiteContent();
    assert.equal(first, app.content.loadPublicSiteContent());
    assert.equal((await first).hero_title, published.hero_title);
    assert.equal(app.requests(), 1);
  }
});

test('static pages retain their fallback when the API is unavailable or invalid', async () => {
  for (const response of [new Response('', { status: 503 }), Response.json({ hero_title: 'incomplete' })]) {
    const app = setup(null, response);
    assert.equal((await app.content.loadPublicSiteContent()).hero_title, '第一次互惠拍攝，\n也能安心開始。');
    assert.equal(app.requests(), 1);
  }
});
