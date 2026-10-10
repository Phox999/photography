# Public portfolio fixture

`portfolio-success.json` is a local success-response fixture shaped like `/api/portfolio`. Its 29 entries are derived from the checked-in `portfolioCatalog`; it is not a captured live API response. The live endpoint was unavailable in this task environment, so this fixture validates successful hydration, selected-cover preservation, route mapping, and local responsive-image metadata without claiming coverage of the current uploaded Supabase covers.

Regenerate the fixture only from the current catalog, or replace it with an authorized API response fixture when one is available. The image-variant generator accepts it with `--api-fixture tests/fixtures/portfolio-success.json`.
