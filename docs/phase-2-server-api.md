# Phase 2 authenticated server API

Date: 2026-07-20

## Outcome

The application now exposes a bounded server contract for identity, directory lookup, request lists/details, atomic request submission, and authoritative lifecycle commands.

- `GET /api/me`
- `GET /api/directory?query=&limit=`
- `GET /api/approval-requests?view=&cursor=&limit=`
- `POST /api/approval-requests`
- `GET /api/approval-requests/{requestNo}`
- `POST /api/approval-requests/{requestNo}/actions`

Every runtime route verifies the session and active profile itself. Personalized responses use `private, no-store`, include a safe correlation ID, and copy refreshed Supabase cookies on success and error responses.

## Authority and validation

- The server derives actor ID, email, name, active status, role, and admin status from Auth plus `profiles`.
- Strict discriminated Zod schemas reject unknown properties and client-supplied actor, role, timestamp, event, next-state, or task-snapshot fields.
- Request bodies, strings, arrays, records, directory searches, page sizes, and cursors are bounded.
- The server computes a canonical SHA-256 payload hash; semantic object-key order does not change it.
- Exact retries return the original result even after the request version advances. Reuse of the same key with a different payload returns `idempotency_conflict`.
- The canonical database row and pinned template snapshot feed the existing pure workflow engine on the server.
- Current-owner IDs, target identities, audit action/details, event IDs, timestamps, request versions, notification recipients, and email outbox rows are server/database derived.
- Request DTOs omit storage paths and public attachment URLs and include server-computed `availableActions`.
- Durable per-actor submission and command limits return HTTP 429 without creating partial state.

## Atomic submission

`supabase/migrations/20260720000500_authoritative_request_submission.sql` adds an idempotent, service-role-only submission receipt and `submit_approval_request`. One transaction creates the request, pinned template snapshot, requester/participant visibility, owner assignments, initial event, targeted notifications, email outbox rows, and receipt. An invalid notification or target rolls the entire submission back.

## Stable responses

- 200: successful or replayed command; replayed submission.
- 201: newly submitted request.
- 400: malformed payload, unknown field, invalid cursor/query, or invalid transition input.
- 401: no valid session.
- 403: inactive profile or authenticated actor without the action entitlement.
- 404: missing or RLS-hidden request.
- 409: stale version, conflicting idempotency-key reuse, or already-decided request.
- 422: inactive/unresolved user or unavailable template/precondition.
- 429: durable per-actor command/submission limit reached.
- 503: dependency failure, with no partial transaction committed.

## Verification evidence

- Contract/runtime/route tests reject forged actor/role/timestamp/event/state fields and validate action-specific bounds, canonical hashing, canonical row overlays, candidate-only reassignment rights, no-store/cookie response plumbing, method exposure, and stable status/code mappings.
- Disposable database migration replay against the current production schema shape passed.
- Atomic database suite passed request submission apply/replay/conflict/rollback, browser RPC denial, command apply/replay/conflict/stale/invalid action/invalid target/rollback, assignment transitions, RLS, and simultaneous decision races.
- SQL assertions passed for receipt RLS/grants, function execution grants, empty `search_path`, and FK indexes.
- Supabase database lint reports no schema errors or warnings.
- Real HTTP integration against local Supabase with real Auth cookies passed 401, 403, hidden 404, strict 400, stale/idempotency/already-decided 409, inactive-target 422, request list/detail, directory, submission replay, reassignment proposal/acceptance, premature-candidate denial, delegation, approval, exact action replay, rejection, amendment/resubmission, and cancellation.

The production Supabase project remains unchanged. Remote advisors remain a staging/release gate after these migrations are applied to an isolated remote branch.
