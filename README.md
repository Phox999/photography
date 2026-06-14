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
