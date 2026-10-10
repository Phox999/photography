# Public portfolio fixture

`portfolio-success.json` is a legacy success-response fixture derived from the checked-in `portfolioCatalog`; it remains useful for deterministic catalog-only checks but is not live evidence.

`portfolio-live-2026-10-10.json` is a sanitized snapshot of the public GET `/api/portfolio` response captured at `2026-10-10T08:03:43Z` (UTC). It contains only the 29 public collections and necessary public fields. Eighteen selected covers differ from the static catalog; it is a dated observation, not a promise of the current backend state. Use it to reproduce identity, routing, and image-candidate checks.

`hero-live-2026-10-10.json` is a sanitized snapshot of the complete public GET `/api/site-content` response captured at `2026-10-10T08:03:43Z` (UTC), plus capture metadata. It contains public announcement and FAQ text and ten `hero_image_urls` (nine remote URLs and one local public portfolio URL), so the same fixture passes the runtime validator and exercises actual Hero hydration. The derivative generator maps each exact source to local variants and keeps the exact source as fallback.

Regenerate catalog-only fixtures with the catalog script when appropriate. Generate portfolio candidates from the dated live snapshot with `node scripts/generate-seo-image-variants.mjs --api-fixture tests/fixtures/portfolio-live-2026-10-10.json`; generate the matching Hero variants with `node scripts/generate-public-hero-variants.mjs tests/fixtures/hero-live-2026-10-10.json`.

- portfolio-reordered-2026-10-10.json is a synthetic browser/unit-test order derived from the real public snapshot. It moves the catalog's original entries 13–15 to the front; it does not claim the backend used that order.

`portfolio-remote-cover-synthetic-2026-10-10.json` is a schema-valid synthetic sample for the public Supabase cover path. The live snapshot had no remote portfolio cover URLs, so this fixture verifies source identity and fallback behavior without fetching the placeholder object or claiming it exists.
