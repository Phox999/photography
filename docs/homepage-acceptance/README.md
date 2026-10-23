# Desktop homepage acceptance — 2026-10-24

Base: existing `dev`, `4ba8f150b2b725ba3ce473c4065995090c63fe45`. Work was isolated in `.homepage-dev-20261024` because the original checkout has substantial uncommitted source and photograph changes. No new branch or PR; no main merge, reset, force push, backend/schema change or production deployment.

## Implementation

- `src/pages/index.astro`: exactly Hero, selected works, featured series, visual directions, dates and application, followed by a compact footer.
- `src/styles/home-editorial.css`: homepage-only warm neutral palette, full viewport Hero, five portrait covers, image-led series layout, functional calendar and application styling. No new package.
- `Hero.astro`, `Header.astro`, `Portfolio.astro`, `Dates.astro`, `Contact.astro`, `BaseLayout.astro`: opt-in presentation variants. Published Hero photos still load; backend headline text cannot restore the old large homepage heading. Focus entrance is progressive enhancement; no added carousel timer.
- `FeaturedSeries.astro`: three distinct photographs from one real series, using existing catalogue/routes/image helpers, with published-data refresh and smaller layouts when images are insufficient. One series has no fake arrows.
- `VisualDirections.astro`, `visualDirections.ts`: typed, explicitly labelled concept slots. **Three independent concept images are still needed.** No reference-board crops or invented photography were added. Supply source, alt, dimensions and focal point in this file. Current placeholders say “獨立概念影像待補 / 版面預覽・非攝影作品”.
- `homePhotoPresentation.ts`: source-specific Hero crop settings, separated from portfolio records.
- Reference images in baseline dev were preview-only. Contact now retains accepted `File` objects, allows individual removal and sends the existing `reference_images` multipart contract. Content hashes participate only in the client idempotency identity; the server payload schema is unchanged. Same data/photos reuse identity on uncertain retries.
- FAQ and feedback remain reachable on `/cooperation/`; the admin feedback preview link and SEO check follow the new location. Other application pages retain their existing visual system.

## Evidence

| Check | Result |
| --- | --- |
| `npm run dev` | Starts, homepage HTTP 200. Local dependency junction causes a Vite dev-toolbar allow-list warning; built preview is used for browser acceptance. |
| `npm run build` / `npm run build:worker` | Pass, 59 pages and Worker asset preparation. |
| `npm run verify:seo` / `npm run verify:worker` | Pass, no failures, 41 structured-data checks. |
| `npm run verify:routes` | Pass, 29 generated portfolio routes and route maps. |
| Targeted existing tests | 30/30 pass: calendar range, featured ordering, inquiry form/workflow/references, published portfolio and Hero image fallback. |
| Full `node --test` | 131/132 pass. Existing `site-analytics-client.test.js` fails at `resolveTabId` because its mocked window lacks an event target. Reproduced with the unchanged test and module extracted from origin/dev. Not modified in this task. An initial analytics signature test also failed once, then passed in isolation and later full runs. |
| Desktop Edge | 1440×900, 1920×1080, 1280×800: exact six-section order, viewport-height Hero, no page overflow. |
| Small-screen smoke | 390×844: no page overflow. A designed mobile/tablet refresh remains the next phase. |
| Calendar | Month switch, selection, clearing, date transfer, error/retry and empty state pass. Uses test fixtures, not a production availability claim. |
| Application | Required-field validation, style selection, file preview/removal, review/back, multipart submit, simulated 503/retry/success and stable submission ID pass. All POSTs intercepted locally; no production application sent. |
| Published data | API fixture rebuild, portrait styling, routes, horizontal arrows and nonbroken series images pass. |
| Accessibility/fallback | Keyboard focus, reduced motion and JavaScript-disabled clear Hero pass. `/apply/` visual scope and cooperation FAQ interaction checked. |

The repeatable browser script is `scripts/homepage-browser-check.mjs`. It uses an already installed Playwright module, without adding a dependency. Set `PLAYWRIGHT_MODULE` to its module URL when not available through normal module resolution; it launches installed Edge. Start built preview on port 4336 before running it. Screenshot calendars use intercepted test slots; live availability still comes from the existing API.

## Preview and screenshots

Run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4336` in the dev checkout. Open `http://127.0.0.1:4336/`. Astro static preview has no Worker API; real backend runtime is separate from the intercepted browser tests.

- [1440 full page](full-1440.png), [1920 full page](full-1920.png), [1280 full page](full-1280.png)
- [01 Hero](01-hero.png), [02 selected works](02-portfolio.png), [03 featured series](03-featured-series.png)
- [04 visual directions](04-directions.png), [05 dates](05-dates.png), [06 application](06-contact.png)
- [Review step](contact-review.png), [apply regression](apply-regression.png), [cooperation FAQ](cooperation-faq.png), [cooperation feedback](cooperation-feedback.png)
- [Browser results](browser-results.json)

Cloudflare live configuration was read before pushing: the `photography` Worker has a non-production trigger for all branches except `main`, running `npm run build:worker` then `npx wrangler versions upload`. Only the separate main trigger runs `wrangler deploy`. There are no Pages projects in the connected account. Push to dev may create a version preview; it does not constitute a production release. Do not use the historical Pages deployment instructions to deploy this Worker.

Remaining: replace the three clearly labelled concept placeholders, design the mobile/tablet version, and fix the unrelated baseline analytics mock in a separately scoped change. Production storage persistence was not tested by sending real applications.
