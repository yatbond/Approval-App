# Phase 1 database foundation

Date: 2026-07-19

## Outcome

The database now provides the authoritative transaction boundary for approval commands. Runtime request state, the append-only event, durable in-app notifications, email outbox rows, and the idempotency receipt are committed in one locked transaction. Browser roles retain scoped read access but cannot mutate runtime or audit data directly.

The application configuration save path now calls `save_workspace_configuration` once. It no longer rewrites request, event, or attachment history while saving workspace configuration.

## Migration

- `supabase/migrations/20260719150248_authoritative_runtime_foundation.sql`
- Additive request versioning and pinned snapshot fields.
- Normalized participants and assignments.
- Idempotency command receipts.
- Durable notification and email outbox tables.
- Case-insensitive identity backfill with unresolved rows recorded in `approval_migration_issues` instead of silently discarded.
- Foreign keys and indexes for runtime lookup, ownership, due work, unread notifications, outbox claims, and legacy collaboration rows.
- RLS and explicit grants. Authenticated clients have scoped reads and no direct runtime/audit writes.
- `commit_approval_request_command` is service-role-only, uses `FOR UPDATE`, checks the expected version and action allowlist, and commits all command effects atomically.
- The same transaction advances normalized owner/delegate assignments and retained-visibility participants. Pending reassignment candidates can accept or decline but do not gain approval authority before acceptance.
- Request event tables are append-only, including for the service role.

## Verification evidence

The final migration was replayed against a disposable Supabase/Postgres 17 database initialized from a schema-only dump of the current production `public` and `private` schemas. Production was not changed.

- Legacy backfill fixture: passed. Resolvable mixed-case identities were normalized; unresolved identities were reported; malformed task/template JSON was reconstructed; existing attachment `public_url` values were preserved.
- Behavioral database suite: passed. Requester, assignee, admin, and unrelated-user RLS were checked with real Auth users.
- Direct authenticated request updates, event inserts, and command RPC calls: denied.
- Atomic configuration RPC: admin success, non-admin denial, and rollback on an invalid row all passed.
- Command behavior: apply, exact replay, idempotency conflict, stale version, unknown action, invalid target, and notification-triggered rollback all passed.
- Assignment behavior: reassignment proposal, premature candidate approval denial, candidate acceptance, prior-owner completion, new-owner activation, and retained RLS visibility all passed.
- Concurrency: simultaneous approve/reject calls from separate clients produced exactly one applied command and one stale command, with one receipt and one event.
- SQL assertions: grants, RLS, function security, append-only triggers, authenticated write-policy absence, and foreign-key indexes passed inside a rolled-back test transaction.
- `supabase db lint --schema public,private --level warning --fail-on error`: no schema errors.
- Application gates: 786 tests passed; typecheck, ESLint, and the Next.js production build passed.

## Production rollout

1. Put runtime command writes into maintenance/read-only mode.
2. Take and verify a restorable database backup.
3. Re-run preflight counts for orphaned legacy collaboration rows and duplicate case-insensitive profile emails.
4. Apply the migration in a non-production Supabase branch or staging project cloned from production data shape.
5. Run the backfill verifier, behavioral database suite, SQL assertions, database lint, and Supabase security/performance advisors.
6. Deploy the server command API before enabling command traffic.
7. Apply to production, repeat the verification queries/advisors, then enable server-authoritative commands gradually.

## Rollback and recovery

This migration is forward-oriented. Do not drop the new tables or columns after authoritative commands have been accepted, because that would discard receipts and audit history.

- Before command traffic is enabled: roll back the application deployment and restore the pre-migration backup if the schema must be removed.
- After command traffic is enabled: stop command writes, preserve receipts/events/outbox rows, and prefer a forward repair migration.
- For a catastrophic migration failure during the maintenance window: restore the verified backup, then redeploy the previous application version.
- Never repair an audit row with ordinary DML. Any exceptional repair must be separately authorized, logged, and performed in a controlled maintenance transaction with the append-only trigger restored before traffic resumes.

Remote Supabase advisors are intentionally deferred until this migration is applied to an isolated remote branch/staging database; local lint and explicit security/performance assertions are the current pre-deployment gate.
