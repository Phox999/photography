# phox999 Photography Website Instructions

This is a static Astro landing page for phox999 photography.

The goal is to create an inbound cooperation page for mutual-benefit portrait photography collaborations. The page should help potential models or creators understand the cooperation style, filter themselves, build trust, and click the Google Form CTA.

Use Astro, HTML, CSS, and minimal vanilla JavaScript.

Do not use React, Vue, Tailwind, Bootstrap, SSR, backend services, or unnecessary dependencies unless explicitly requested.

Primary CTA:
- Text: 填寫合作意向
- URL: https://forms.gle/8V17E3gPVf3NdEaY8

Contact:
- Instagram: https://www.instagram.com/phox999_/
- Email: chuajinglun@ymail.com

Static images should go under `public/assets/`.

Main source page:
- `src/pages/index.astro`

Global styles:
- `src/styles/global.css`

Use CSS variables for colors, spacing, radius, shadows, and typography.

The site must be deployable to Cloudflare Pages:
- Build command: `npm run build`
- Output directory: `dist`

Before finishing any task, check:
- `npm run dev` works
- `npm run build` works
- Hero image fills the first screen
- CTA links are consistent
- Mobile layout does not overflow
- FAQ works
- Navigation anchors work
- Image paths are correct

After finishing, summarize:
1. Files changed
2. What was implemented
3. How to preview locally
4. How to deploy to Cloudflare Pages
5. Known limitations
6. Suggested next refinement
