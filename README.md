# phox999 photography

Astro photography site for phox999, focused on mutual-benefit portrait photography collaborations.

## Purpose

The site helps potential models and creators understand the photography style, collaboration format, expectations, image usage, and application flow before filling out the cooperation form.

## Tech stack

- Astro
- Astro components
- HTML
- CSS
- Minimal vanilla JavaScript only if needed
- Cloudflare Pages Functions / Worker routes for the existing admin APIs and server-rendered public SEO pages

## Local development

```bash
npm install
npm run dev
```

## Tests

Run the built-in Node unit and mock API checks with:

```bash
npm test
npm run build
npm run check:seo
```

The PostgreSQL security tests in `supabase/tests/` require a disposable local Supabase project and its complete migration sequence. They have not been run against a production project.

## Production build

```bash
npm run build
npm run preview
```

## 管理後台

後台入口為 `/admin/login/`，可管理合作意向、拍攝檔期、網站公告與 FAQ、操作紀錄、私人相簿及合作回饋。Cloudflare Pages Functions、Supabase migrations 與首次管理員設定請依照 [後台啟用說明](docs/admin-setup.md) 完成。

## Cloudflare Pages

Build command: `npm run build`

Output directory: `dist`

Framework preset: Astro

Root directory: project root

## SEO routes

The public home page and portfolio pages render the current published site and portfolio content in their initial HTML. Portfolio detail URLs use `/portfolio/{slug}/`; `/portfolio/?collection={slug}` redirects to the matching page. `/sitemap.xml` uses the same published portfolio source. Use `npm run check:seo` after a production build to inspect static output, private-page exclusions, structured data, sitemap URLs, and local image files.

## Contact link config

CTA, Instagram, and email links are centralized in `src/data/site.ts`.
