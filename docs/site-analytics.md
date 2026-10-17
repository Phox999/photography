# Site analytics setup and metric definitions

The first-party report lives at /admin/analytics/. It combines allowlisted public-page events with committed rows in public.collaboration_requests. Cloudflare HTTP requests and error counts remain a separate diagnostic source and are not used as the visitor or conversion denominator.

## Before enabling it

1. Apply supabase/migrations/20261017023027_site_analytics.sql to a disposable/local Supabase test database first, then run supabase test db. Do not use a production link for this first verification. The repository currently has no supabase/config.toml, so initialize or connect a dedicated local/test Supabase project before running database tests.
2. Set a dedicated HMAC key for the signed first-party cookie. In PowerShell, generate a value with: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))". Put it in the ignored .dev.vars file as SITE_ANALYTICS_COOKIE_SECRET="...". Do not commit the generated value.
3. Before a Worker deployment, install the same setting as a Cloudflare Worker Secret with npx wrangler secret put SITE_ANALYTICS_COOKIE_SECRET. The cookie uses HttpOnly, Secure, SameSite=Lax, and a 30-day lifetime in production. Sessions split after 30 minutes of inactivity.
4. After the test database and secret are configured, run the project checks and validate the admin page at 390, 768, and 1440 pixels using synthetic inquiries only.

No migration has been applied and no Worker has been deployed as part of this implementation.

## Metric definitions

- Estimated visitors: distinct signed anonymous visitor IDs with a valid public page_view in the selected period.
- Visits: distinct sessions with a valid public page view. A session ends after 30 minutes without measured activity.
- Page views: accepted page-view event IDs; event retries share an ID and are stored once.
- Successful inquiries: rows actually committed to public.collaboration_requests during the period, including submissions without analytics attribution.
- Visitor conversion: distinct attributed visitors who had a measured public page view in the same period and a committed inquiry in that period, divided by measured visitors. Two inquiries from one visitor count as two inquiries and one converted visitor.
- Form completion: distinct sessions with an ordered start, review, submit attempt, and committed inquiry in that same session, divided by sessions that started the form. Successful inquiries without a matched funnel remain in the success total and are shown as unpaired.
- Sources: allowlisted UTM source/medium and campaign slug, or normalized referrer category. The raw referrer URL, full query string, form values, IP, and full user agent are not stored.
- Retention: event and attribution data are deleted after 90 days by the Worker cron. After retention, older UV and visitor conversion cannot be calculated exactly.

The global public-page control in the footer stops first-party collection for that browser or clears the signed analytics cookie. It does not change the form payload. Logged-in administrators are excluded after server-side session verification. Analytics write errors do not prevent an inquiry from being committed.

## Current boundaries

Cloudflare HTTP analytics are not connected to this page yet. Google Forms completion, cross-device identity, historical visitors before the collection start date, and photography confirmation/completion cohorts are not inferred by this first version. The report does not refresh itself continuously; use the reload control.

## Acceptance snapshot — 2026-10-17

Local acceptance passed 93 Node tests, an isolated 59-page Astro build, Worker asset preparation, SEO and strict Worker asset checks, and a Wrangler dry-run bundle (no upload). All 38 generated public portfolio/journal/project detail routes pass event path validation, including portfolio slugs with spaces, plus signs, and emoji. The dashboard was inspected at 390, 768, and 1440 pixels with synthetic API responses, including empty data and failure states.

Acceptance corrected dropped portfolio events, disable/re-enable preference synchronization and queued-event disposal, rejection of dates older than retention, and an inconsistent unpaired-inquiry SQL fixture. The SQL fixture has not been executed: no dedicated test branch/local PostgreSQL was available. A read-only production check confirmed that the analytics table and report function are not installed. Database migration, pgTAP, real Worker/database end-to-end submission, retention execution, and production rollout therefore remain open gates. Synthetic UI numbers are not production traffic or database proof.
