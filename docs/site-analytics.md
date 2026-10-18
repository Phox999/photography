# Site analytics and journey panel

The first-party panel is available at `/admin/analytics/`. It combines allowlisted public-page events with committed rows in `public.collaboration_requests`. Cloudflare HTTP requests, scans, and errors remain separate diagnostics and never enter visitor or conversion denominators.

## Metric contract

All report dates are interpreted in `Asia/Taipei`. Each query interval includes its start and excludes its end (`[start, end)`). Event-based membership uses server `received_at`; successful inquiries use the database `created_at`. Session `started_at` is for display and stable ordering, not period inclusion. Browser `client_at` is retained separately and is used only to order client-side form steps where appropriate.

| Metric | Unit and inclusion | De-duplication and missing data |
| --- | --- | --- |
| Estimated visitors | Distinct signed `visitor_id` values with a public `page_view` received during the interval. | Cookie identity is a browser estimate, not a person. Clearing cookies, another device, or blocked collection can split or omit a visitor. No IP collection or IP-based joining is used. |
| Report visits | Distinct `session_id` values with a public `page_view` received during the interval. | A session uses the existing 30-minute measured-activity timeout. |
| Page views | Accepted public `page_view` events received during the interval. | `event_id` is the retry de-duplication key. A refresh is a new page visit. |
| Successful inquiries | Rows committed to `public.collaboration_requests` with `created_at` in the interval. | Every committed inquiry remains in the total, including unattributed inquiries. A submit attempt or external-link click is not success. |
| Visitor conversion | Distinct attributed visitors with both a measured page view and a committed inquiry in the interval, divided by estimated visitors. | Numerator and denominator follow the same interval. The UI displays the numerator and denominator. If the denominator is zero, the rate is `—`. |
| Form completion | Distinct sessions with a start, review, attempt, and committed inquiry in an ordered same-form chain, divided by distinct sessions that started a form. | V2 events must share `form_instance_id`; v1 has no form instance and is matched within its session using available event times. A session is counted once per stage. Unpaired committed inquiries remain separately visible. Zero denominator displays `—`. |
| Observation cards | Distinct sessions with the selected event evidence in the interval; `n/N` uses the same journey query and currently selected source, device, page, and visitor filters. `N` is all sessions with any retained analytics event or attributed success in the interval. | Cards can overlap. “Error then success” requires a received error before an inquiry whose database `created_at` is in the same interval. The card describes observed events, not a visitor's reason. |
| Session page count | Public `page_view` events in the selected interval for a matching session. | The entry and last page shown in details come from retained page-view events ordered by `received_at`; a default `/` stored on the session row is not treated as evidence. Equal-time events on different paths are marked uncertain. |
| Page visitors | Distinct signed visitor IDs with a `page_view` for that path received during the interval. | This is a browser estimate and is not added across paths to produce unique visitors. |
| CTA exposure denominator | Distinct `(page_visit_id, placement)` pairs with a qualifying visible event or a click. A visible event requires at least 50% intersection for 1 second. A click supplies exposure evidence when no visible event arrived. | Visible and click evidence are unioned per pair. A pair is counted once even if events are duplicated or multiple clicks occur. The click numerator is the subset of denominator pairs with a click, so the rate cannot exceed 100%. `clickSupplement` identifies clicked pairs without a visible event. V1 clicks lacking `page_visit_id` are listed as unpaired and excluded from the rate. A missing exposure event without a click is not counted as an exposure. |
| Next observed page | Counts v2 page views in the same session and tab with adjacent `tab_seq` values. | This is an aggregate observed transition, not a prediction. V1 events have no tab identity or sequence and are omitted. A missing transition does not mean the visitor left. |

The session list and its observation-card counts share the journey query's event-received and backend-receipt period criteria. Detailed visitor history is intentionally different: it returns the visitor's retained sessions for context and marks each row `符合目前篩選` or `篩選外上下文`. Context rows never change the selected result count. Visitor history is cursor-paginated in batches of at most 50; a session detail returns at most 500 events and reports when older events were truncated.

The detail view keeps source levels separate: the current session's source, the earliest retained measured source for that visitor, and the sequence of retained session sources/pages with backend receipt evidence. This is a limited observed path, not a weighted attribution model. Successes without an attribution row are not assigned to a visitor.

## Event and privacy contract

The server-signed HttpOnly cookie remains the source of `visitor_id` and `session_id`. The browser cannot submit those identities. V2 adds `page_visit_id`, `tab_id`, `document_id`, event and tab sequence numbers, and `form_instance_id`. A new cookie is bootstrapped before event delivery, and the browser serializes first event batches with Web Locks where supported. When Web Locks are unavailable, a short BroadcastChannel lock serializes the bootstrap and first event batch. Copied session-storage tabs use a BroadcastChannel handshake to split a duplicated tab ID. Without BroadcastChannel, the tab ID is made per document so cross-document transitions are omitted rather than guessed; browsers without either coordination mechanism can race on the first cookie bootstrap, but event identities still come from the signed server cookie.

Ordinary page loads and refreshes create a new page visit. Returning from the back-forward cache creates another page visit and sequence number. Retries preserve event IDs. V2 form steps record only allowlisted step codes and error categories; no form values are sent. CTA exposure records only a placement and the visibility threshold/time. The existing opt-out and private-path filters remain in place; opting out clears queued events and aborts an active request.

Event and attribution records continue to use the existing 90-day purge. The journey migration adds columns and RPCs, not a second event table or a longer retention period. The purge continues to be called by the Worker's existing scheduled retention task.

## Safe rollout and local checks

The journey migration is additive and is stored at `supabase/migrations/20261018003946_site_analytics_journeys.sql`. Apply it only after the existing analytics migration. It expands the event constraints, preserves v1 rows and the old report RPC, and changes form uniqueness from one start/review per session to one per version/form instance. The original v1 uniqueness behavior remains for v1 events.

The event Worker first attempts the v2 RPC. If it is missing, page, click, and allowlisted error events are sent through the v1 RPC; v2-only exposure and step events are skipped. Inquiry attribution also falls back to the existing v1 RPC. Admin journey endpoints report that the new feature is unavailable while the original summary report stays usable. The original report uses its legacy session funnel until the form-instance funnel RPC is present.

For disposable/local database verification, apply all project migrations, then run:

```powershell
supabase test db
```

The journey fixture is `supabase/tests/site_analytics_journeys.test.sql`; it uses synthetic rows inside a rollback transaction. Do not run it against production. It covers a first Instagram visit with no form start, a later direct successful visit outside the selected period, context-only history, form-instance matching, CTA pairing/de-duplication, v1 unpaired clicks, ordered v2 transitions, end-exclusive time boundaries, backend receipt detail, event-ID retry behavior, and 90-day purge of v2 event/session and attribution data.

The project has Node checks in `npm test`, Astro development via `npm run dev`, and production assets via `npm run build`. When `dist/` or `.astro/` contains user changes, use an isolated Astro output directory for validation and do not stage build artifacts. A local Astro preview or mocked browser response does not prove Worker-to-Supabase behavior.

## Rollout and rollback

1. Apply the existing analytics migration and then the journey migration to a dedicated test database.
2. Run `supabase test db`, Node tests, the isolated Astro build, and a dedicated Worker-to-test-database check with synthetic IDs only.
3. Review the migration and Worker bundle. A Worker code release can precede the additive migration because the v2 ingestion and journey RPCs have missing-function fallbacks; the new panels remain unavailable until the migration is applied.
4. Apply the production migration and deploy the Worker only under their separate explicit authorizations. This document does not state that either has happened.
5. For rollback, revert the Worker code while leaving the additive schema in place. Do not remove v2 columns or constraints after v2 events exist; use a forward migration if schema repair is needed.

No production database or live Worker query was made for this change. The previous acceptance note below is historical evidence only and is not a current production-state claim.

## Historical acceptance note

An earlier 2026-10-17 snapshot recorded local checks for the then-current v1 analytics implementation. It predates the journey migration and must not be used as evidence for this version's database, Worker, viewport, or production acceptance.
