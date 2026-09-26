# phox999 photography

Static Astro landing page for phox999 photography, focused on mutual-benefit portrait photography collaborations.

## Purpose

The site helps potential models and creators understand the photography style, collaboration format, expectations, image usage, and application flow before filling out the cooperation form.

## Tech stack

- Astro
- Astro components
- HTML
- CSS
- Minimal vanilla JavaScript only if needed

## Local development

```bash
npm install
npm run dev
```

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

## Asset replacement

Replace image placeholders in `public/assets/` using the same filenames:

- `hero.jpg`
- `portfolio-01.jpg` through `portfolio-06.jpg`
- `behind-01.jpg` through `behind-06.jpg`

Keep public paths as `/assets/file-name.jpg` in components.

## Contact link config

CTA, Instagram, and email links are centralized in `src/data/site.ts`.
