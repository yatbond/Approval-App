# Phase 3 authoritative client cutover

Date: 2026-07-20

## Outcome

The browser now treats the authenticated approval API as the source of truth for runtime requests. Local storage and `/api/workspace` retain user-interface configuration only; they can no longer create, decide, or overwrite approval state.

## Read path

- The workspace loads the authenticated actor from `GET /api/me` instead of fabricating a privileged browser identity.
- Queue and tracking tasks come from all pages of `GET /api/approval-requests`; selecting a request refreshes its canonical detail.
- The client refreshes canonical work on initial load, window focus, browser reconnect, and restoration of a visible tab.
- A versioned local request cache provides a last-known read-only view during a transient outage. A successful server response always replaces it.
- Personalized request DTOs contain server-computed `availableActions`, which gate the controls shown by the queue.
- Query failures retain the last-known view and show a visible alert with an explicit retry control.

## Write path

- Approval decisions call `POST /api/approval-requests/{requestNo}/actions` with only action input, expected state version, and an idempotency key.
- Request creation calls `POST /api/approval-requests` with a pinned database template version, participant assignments, and bounded attachment metadata.
- The browser never supplies the authoritative actor, role, timestamp, event record, next state, or resulting task snapshot.
- Network and dependency failures retain the same idempotency key for a safe retry. A successful result clears it.
- A stale `409` replaces the selected task with the canonical response and tells the user that the latest version is shown.
- Server-backed submissions and decisions no longer send browser-side lifecycle email. The atomic database command creates durable notification and outbox records.

## Workspace isolation

`GET` and `POST /api/workspace` strip `approvalTasks`. Autosave emits an empty runtime task list even when legacy code constructs a full workspace snapshot, so a delayed configuration save cannot overwrite an approval decision. Existing local-only sample tasks remain a development/test fallback when the authoritative API is unavailable.

## Attachment boundary

The submission contract accepts at most 50 attachment metadata records. The service-only submission transaction validates shape, MIME/name/key lengths, forbids traversal, requires every storage path to live under the authenticated actor's prefix, and inserts the metadata in the same transaction as the request. Request DTOs continue to omit storage paths and public URLs.

## Verification evidence

- Client contract tests cover paginated canonical reads, identity loading, actor-field omission, idempotency headers, directory-based target resolution, stale conflict handling, and attachment submission.
- Cutover source tests guard server-only actions/submissions, configuration-only workspace persistence, refresh triggers, versioned cache use, and removal of the fabricated superuser.
- The full unit suite passes 811 tests.
- Type generation/typecheck, ESLint, and the production webpack build pass.
- Disposable local Supabase migration replay, authoritative transaction suite, submission SQL assertions, and database lint pass.
- Real HTTP integration against local Supabase passes authenticated lifecycle and failure-status coverage.
- The existing browser regression suite remains green.
- A real two-browser Playwright scenario proves one concurrent approval commits, the stale browser receives `409`, a delayed workspace autosave cannot overwrite the decision, focus refresh reconciles the stale browser to version 1, and exactly one approved event exists.

The production Supabase project remains unchanged.
