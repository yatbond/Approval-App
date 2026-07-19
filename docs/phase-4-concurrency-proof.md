# Phase 4 concurrency, idempotency, and conflict proof

Date: 2026-07-20

## Outcome

The authoritative command boundary has been exercised against realistic concurrent decisions, lost responses, retries, rate limits, transaction failures, and a held row lock. Exactly one transition wins each request version and all dependent rows remain atomic.

## Runtime safeguards

- `commit_approval_request_command` locks the request row before checking the command receipt and expected version.
- Its database `lock_timeout` is three seconds, so a stuck writer produces a bounded retryable dependency failure rather than exhausting application connections indefinitely.
- Exact idempotency-key/payload replays return the stored command result; the same key with a different payload conflicts.
- The durable per-actor action limit is evaluated inside the locked command transaction and does not create a receipt or change the request when exceeded.
- API correlation IDs are included in structured command logs and persisted in the immutable event details for receipt/event investigation.
- Database lock/deadlock/provider errors remain HTTP 503 at the route boundary. The Phase 3 client retains the original idempotency key for retryable failures.

## 1,000-iteration race matrix

`scripts/test-authoritative-concurrency.mjs` created a fresh request for every race and rotated ten active admin actors below the durable per-actor rate ceiling. It ran 25 races concurrently per batch across:

- approve / approve;
- approve / reject;
- approve / reassign;
- request correction / approve;
- cancel / approve.

All 1,000 pairs produced exactly one `applied` result and one `stale` result. Every request ended at state version 1 with exactly one command receipt, event, targeted notification, and email outbox row. There were no partial or duplicate winner records.

Observed local disposable-database command latency was p50 23 ms, p95 39 ms, p99 72 ms, and maximum 109 ms. These figures prove the local lock path only; the target-scale production-like load profile remains a Phase 7 gate.

## Retry and conflict proof

An additional 100 fresh requests simulated concurrent double-click/browser/serverless retries and ignored-response reconnects. Each produced one `applied` and one stable `replayed` result with one durable command/event/notification/outbox set. A changed payload using an already completed key returned `idempotency_conflict`, and a new key using an old expected version returned `stale` without adding rows.

The action-rate-limit test created the preceding 120 receipts only through valid command calls. Command 121 returned `rate_limited`; its request remained pending at version 0.

## Failure and lock injection

`supabase/tests/authoritative_command_failure_injection.sql` installs transaction-local rejecting triggers and forces a failure at each write boundary:

1. receipt insert;
2. request update;
3. participant update;
4. event insert;
5. notification insert;
6. outbox insert;
7. final receipt update.

After every injected error, the request version/status and receipt/event/notification/outbox counts remained exactly at their pre-command values. The transaction rolls the test triggers back at completion.

`scripts/test-authoritative-lock-timeout.mjs` held the selected request row in a separate PostgreSQL session for six seconds. The contending command failed with PostgreSQL `55P03` after 3,013 ms, inside the asserted 2.5–5 second bound, and the request remained unchanged.

## Verification commands

- `npm run test:db:concurrency`
- `npm run test:db:lock-timeout`
- direct `psql -v ON_ERROR_STOP=1` execution of `authoritative_command_failure_injection.sql`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:db:authoritative`
- local SQL security assertions and Supabase database lint
- `npm run test:api:authoritative`
- `npm run test:e2e:two-browser`
- `npm run e2e:regression`

The production Supabase project remains unchanged.
