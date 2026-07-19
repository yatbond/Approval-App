# Phase 6 durable escalation and notification delivery

Date: 2026-07-20

## Outcome

Operational correctness no longer depends on an open browser. A protected Vercel Cron route invokes service-only database functions that expire due delegations, claim overdue approval requests with `FOR UPDATE SKIP LOCKED`, commit each canonical state transition and event once, and atomically create targeted in-app notifications plus email outbox rows.

The browser escalation timer and local-storage notification read ledger were removed. The retired client-triggered workflow email endpoint now returns `410`; workflow commands and the scheduler are the only sources of durable notification delivery work.

## Scheduler

- `vercel.json` schedules `GET /api/cron/approval-operations` once per minute. This cadence requires a Vercel plan that permits per-minute Cron invocations.
- The route requires `Authorization: Bearer $CRON_SECRET`, rejects missing/short secrets, and uses a constant-time comparison.
- A deployment-and-minute run key is unique in `approval_scheduler_runs`. Repeated or overlapping invocations return the recorded run instead of repeating decisions.
- Due request rows and expired delegate assignments are claimed with row locks and `SKIP LOCKED`, so multiple workers can safely overlap.
- Escalation resolves the target from the request's pinned template and active profile directory, increments `state_version`, updates normalized ownership and the compatibility snapshot, appends a system event, and notifies only the escalation target and requester.
- Expired delegation cleanup removes the expired delegate from pending ownership, restores a delegated request to pending, records an authoritative expiry event, and notifies the accountable owner and expired delegate.
- A due request with no active pinned escalation target becomes `overdue` but is not routed to an invented or inactive identity.

## Notification and email durability

- `GET/PATCH /api/notifications` loads the signed-in recipient's bounded notification feed and updates only that recipient's unread rows. Browser roles still have no direct table UPDATE grant.
- The header unread count and read state use this server API; the prior per-browser local-storage ledger is gone.
- `approval_email_outbox` has bounded attempts, a worker lease token and expiry, exponential backoff capped at one hour, retry/permanent/exhausted failure classes, provider diagnostics, and terminal `failed` state.
- Claiming recovers expired leases and uses `FOR UPDATE SKIP LOCKED`. Completion and failure require the exact lease token.
- Resend receives `approval-outbox-{row-id}` as an idempotency key. HTTP 408/409/425/429 and 5xx responses retry; other 4xx responses fail permanently.
- Admins can inspect the real outbox through `/api/email/outbox` and manually reset a retry/failed row. The Admin UI displays durable status and a retry control.
- When live email is not configured, the scheduler still runs while pending email rows remain durable for a later configured worker.

## Configuration and operations

Required server variables:

- `CRON_SECRET`: random secret of at least 16 characters, configured in Vercel and used automatically by Vercel Cron.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only database authority for the protected worker.
- `EMAIL_PROVIDER=resend`, `EMAIL_LIVE=true`, `RESEND_API_KEY`, and `EMAIL_FROM`: enable live provider delivery.
- `NEXT_PUBLIC_APP_URL`: absolute base URL used in email links.

Operators diagnose scheduler runs in `approval_scheduler_runs`, provider state in `approval_email_outbox`, and structured `approval_operations_completed` / `approval_operations_failed` logs. A failed outbox row retains the provider error without rolling back or duplicating the workflow decision.

## Verification evidence

The final Phase 6 implementation passed against the disposable local Supabase/Postgres database and real Auth users:

- 830 unit, state, contract, source-boundary, cron-authentication, and provider-classification tests;
- TypeScript type generation/typecheck and ESLint;
- Next.js 16.2.9 webpack production build with the three new operational routes;
- clean migration reset and direct SQL privilege assertions;
- authoritative database/RLS regression suite;
- clock-controlled past/future requests and a Saturday no-browser scheduler run;
- two overlapping scheduler invocations with one escalation event and one replay;
- expired delegation cleanup with normalized state, assignment, event, notification, and outbox proof;
- two parallel outbox workers claiming distinct rows;
- retryable provider failure, permanent provider failure, backoff state, and terminal diagnostic state;
- recipient-only notification visibility and denial of direct browser read-state mutation;
- live protected cron HTTP smoke in the isolated environment, including invalid secret denial and replay resistance;
- authoritative API regression, server notification read-state API, admin outbox visibility/manual retry, and retired direct-email endpoint;
- two-browser stale-version reconciliation and three-user collaboration browser suites.

The isolated smoke invoked the real scheduled route manually because Vercel Cron only fires on production deployments. No production deployment, production database, email recipient, or original dirty checkout was changed.

## Phase 7 handoff

Phase 7 should add measured security and scale proof around these hot paths: RLS/function audits, dependency remediation, 300-active-user and 50-command-per-second load, database connection/lock metrics, structured alert thresholds, accessibility checks, and operator runbooks.
