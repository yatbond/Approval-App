# Phase 8 cutover and reconciliation

Phase 8 removes the last browser-owned approval fallback and makes rollout state a server-owned database decision. The implementation and evidence below were exercised against the disposable local Supabase project only. Production was not changed.

## Safety model

- Canonical `approval_requests`, normalized participants/assignments, append-only events, command receipts, notifications, outbox rows, attachments, and collaboration rows remain the source of truth.
- `read_compare` records projection differences but rejects commands. A stale legacy projection is evidence only and can never overwrite canonical columns.
- `cohort` enables commands for a deterministic percentage of actor UUIDs. The same actor always receives the same bucket.
- `authoritative` enables all commands and requires a 100% cohort.
- `rollback_read_only` keeps reads available and returns HTTP 503 with `cutover_paused` for submissions, decisions, and collaboration mutations. Rollback never restores legacy writes.
- Seven obsolete runtime tables have database triggers that reject insert, update, and delete even through the service role.
- The local request cache is usable only before the server-owned `legacy_read_fallback_until`. After expiry, the browser deletes it and does not seed mock approval tasks.
- Workspace bootstrap intentionally excludes approval runtime rows. Canonical requests are loaded through the bounded, paginated approval API so an administrator with hundreds of visible requests cannot produce an oversized `.in(...)` database URL.
- Missing requester, owner, and participant identities and incomplete pinned templates without a recoverable template version are written to `approval_migration_issues`; values and workflow routes are not guessed. Operators resolve the source data and rerun reconciliation.

## Deployment order

1. Announce a short approval-command maintenance window. Do not stop read access.
2. Capture a database backup and inventory counts for requests, events, receipts, participants, assignments, attachments, collaboration rows, notifications, outbox rows, profiles, and migration history.
3. Apply `20260720080000_cutover_reconciliation_and_legacy_freeze.sql` before deploying the application. Confirm the migration transaction succeeds and database lint is clean.
4. Repeatedly invoke `reconcile_approval_legacy_runtime` in bounded batches until it reports `scanned: 0`. It selects only rows that still need repair or quarantine, so successive batches converge instead of revisiting the same oldest rows. Review every unresolved `approval_migration_issues` row and compare counts/hashes with the inventory.
5. Invoke `audit_approval_runtime_projections`. Any unresolved mismatch blocks cohort enablement. Repair the projection with reconciliation; never copy it into canonical columns.
6. Deploy the application while mode remains `read_compare` or `rollback_read_only`. Verify authenticated reads and confirm commands return the controlled 503 response.
7. Set `cohort` to a small percentage, observe error rate, p95/p99 latency, lock waits, database connections, outbox age/failures, scheduler health, and projection mismatches, then expand deliberately.
8. Set `authoritative` at 100%, run one real-user submit/decision lifecycle, and retain the bounded read fallback only for the approved support window.
9. After the fallback deadline, verify stale browser caches are removed and no support path depends on legacy task data. The database write freeze remains permanent.

## Admin operation API

Only an authenticated active administrator may use `/api/admin/rollout`; the route calls service-only functions and accepts at most 16 KB. `GET` returns the current setting, recent rollout events, recent comparison mismatches, and the unresolved count. The Admin page shows the current mode, cohort, mismatch count, write freeze, expiry, and reason.

State changes require an explicit reason of 8 to 1,000 characters:

```json
{
  "action": "set_state",
  "mode": "cohort",
  "cohortPercentage": 10,
  "legacyReadFallbackUntil": "2026-07-21T00:00:00.000Z",
  "reason": "Enable the first monitored production cohort"
}
```

Maintenance actions use `{"action":"audit","limit":500}` and `{"action":"reconcile","limit":1000}`. Every state change appends an immutable event; rollout event updates and deletes are rejected.

## Rollback and incident response

1. Set mode to `rollback_read_only`, cohort to `0`, and state the incident/correlation IDs in the reason.
2. Confirm reads return 200 and all three command surfaces return `503 cutover_paused`.
3. Preserve database rows, event history, receipts, mismatch evidence, and logs. Do not manually edit request state and do not unfreeze legacy tables.
4. Diagnose with structured command logs and the System health panel. Resolve application or dependency failure, then run reconciliation and projection audit.
5. Restore through a monitored cohort. Return to `authoritative` only at 100% and only when mismatches, lock waits, and error thresholds are clear.

Rollback remains available after the cache fallback expires because it pauses writes; it does not require legacy reads.

## Rehearsal evidence

The incremental rehearsal started with 52 existing requests and added seven production-shaped in-flight scenarios: sequential, parallel, conditional, returned, delegated, reassigned, and collaborative. The final migration preserved all seven statuses, the sequential event order `[1,2]`, its attachment, and the collaboration record. It reconciled 26 participant rows and five active assignments. Two genuinely missing identity mappings were quarantined.

A deliberately corrupted task projection produced one mismatch while canonical status, version, and owner remained unchanged. Reconciliation restored the projection and the audit resolved the mismatch. Deterministic cohort decisions were stable across repeated calls. Browser-role execution of rollout functions failed. Service-role writes to a frozen legacy row failed. HTTP rehearsal proved read `200`, rollback command `503`, and restored authoritative command `200`.

The Admin page was verified in a real browser with mode `authoritative`, cohort `100%`, unresolved mismatches `0`, legacy writes `Frozen`, no page errors, and zero horizontal overflow. Backup/restore matched 59 requests, 53 events, 51 receipts, 51 notifications, 51 outbox rows, 314 profiles, rollout tables/events/evidence, seven freeze triggers, 41 migration records, and both operational and rollout functions.

The 300-user load rehearsal exposed and then verified a scale correction in workspace bootstrap: the original normalized-state load put every visible approval request ID into one PostgREST `.in(...)` query and returned `URI too long` for a broad-visibility administrator. Approval runtime loading is now disabled for bootstrap, while canonical requests continue through the paginated API. The final wave completed 300 concurrent reads with zero errors and no lock waits; its p95/p99 read latency was 1,239/1,245 ms. A 50-command burst completed in 51 ms with 50 requests, receipts, events, notifications, and outbox rows.

The post-load cutover audit also exercised a dataset larger than the 1,000-row maintenance limit. Reconciliation repaired 399 rows in its first bounded pass, then quarantined 103 deliberately minimal direct-database test fixtures whose pinned workflow route could not be reconstructed safely, and the next pass reported `scanned: 0`. The follow-up audit resolved all 346 stale comparison records and returned the Admin mismatch gate to zero. These quarantined synthetic fixtures exist only in the disposable rehearsal database.

## Release gates

```powershell
npm run test:db:phase8-seed       # before applying Phase 8 to the rehearsal copy
npm run test:db:phase8-verify     # after applying Phase 8
npm run test:api:phase8-rollback  # requires the local app server
npm run test:restore:phase7
npm run verify
npm audit --json
```

Also run `supabase db lint --level warning`, `supabase/tests/phase7_security_scale.sql`, and `supabase/tests/phase8_cutover.sql` against the migrated rehearsal database. Rerun the complete authoritative API/database, concurrency, collaboration, durable-delivery, security, load, accessibility, and browser suites on the final candidate before production rollout.
