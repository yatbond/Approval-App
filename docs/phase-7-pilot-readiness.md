# Phase 7 pilot readiness

Phase 7 proves the security, scale, accessibility, recovery, and operational boundaries for a pilot of hundreds of concurrent users. All database and load evidence in this document was produced against the disposable local Supabase project `Approval Workflow Phase1 DB Test`; production was not mutated.

## Security and dependency controls

- Replaced vulnerable `xlsx@0.18.5` with `read-excel-file@9.3.2`. Workbooks are bounded to 5 MB, 20 sheets, 5,000 rows per sheet, 200 columns, and 100,000 cells before application processing.
- Forced the supported `postcss@8.5.10` release for transitive consumers. `npm audit --json` reports zero known vulnerabilities and `npm ls xlsx` is empty.
- Added streaming request-body bounds for JSON and multipart input, including chunked bodies without `Content-Length`. Approval commands are limited to 24 KB, submissions to 64 KB, operations to 16 KB, external form intake to 512 KB, spreadsheets to 5 MB, and documents to 25 MB plus multipart overhead.
- Restricted Data API grants to the exact current tables and operations. Browser roles cannot write authoritative request state, events, notifications, scheduler runs, outbox rows, or obsolete shared-state tables.
- Every public table has RLS. The private `approval-documents` bucket is capped at 25 MB and permits owner writes plus owner/request-participant reads.
- Every `SECURITY DEFINER` function in `public` and `private` has an empty `search_path`. Scheduler, outbox-worker, retry, and operational-metric functions are service-role-only.
- Added covering indexes for the four previously unindexed scoped-role foreign keys. List/directory/notification/outbox APIs use stable ordering, cursor or fixed limits, and maximum page sizes.
- The app uses Supabase HTTP APIs and is compatible with managed connection pooling. Any future direct PostgreSQL worker must use the transaction-pooler connection string and must not retain session state.

## Operational telemetry and alerts

Core approval commands, submissions, cron runs, document parsing, autosave, and operation-monitor failures emit one-line JSON with `timestamp`, `level`, `service`, `event`, correlation/request identifiers, outcome, and duration where applicable. Logs do not include document contents, tokens, cookies, or service keys.

The admin System health panel shows application operation outcomes plus live database connections, lock waits, pending/exhausted outbox counts, and scheduler health. These thresholds are executable in `src/lib/operational-alerts.ts`:

| Signal | Threshold | Severity |
| --- | ---: | --- |
| Database lock waits | greater than 0 | critical |
| Database connections | 80% or more of `max_connections` | warning |
| Exhausted outbox items | greater than 0 | critical |
| Oldest pending email | greater than 5 minutes | warning |
| Last completed scheduler run | older than 3 minutes or absent | critical |
| Approval command p95 | greater than 1,500 ms during pilot test | release blocker |
| Approval command p99 | greater than 2,500 ms during pilot test | release blocker |
| API error rate | greater than 1% for 5 minutes | incident |

### Operator runbook

1. Scheduler stale: confirm `/api/cron/approval-operations` authentication and deployment cron configuration, inspect the latest `approval_scheduler_runs`, and run one authorized invocation with a unique run key. Do not edit request state manually.
2. Outbox failed/stale: inspect the admin outbox view and provider error class. Repair credentials/provider availability, then use the server retry action. Never duplicate the original workflow command.
3. Lock wait: capture waiting/blocking sessions, request numbers, correlation IDs, and query timing. Stop the offending non-production load if applicable. Do not terminate production sessions until the owning transaction and impact are identified.
4. Elevated latency/error rate: compare structured command duration/outcome logs with database connections and lock waits. Roll back the application cohort or disable the affected integration; preserve the authoritative database/event log.
5. RLS/storage denial spike: correlate user, route, and correlation ID without logging tokens. Verify the participant/role assignment; do not broaden a policy to solve one bad record.
6. Restore: take an application-schema backup, restore to a new isolated database, compare request/event/receipt/notification/outbox/profile/storage/migration counts, and run integrity tests before using the copy. The rehearsal script refuses any container other than the named disposable local project.

## Measured evidence

### Security matrix

Five real authenticated users proved requester, owner, participant, outsider, and admin behavior. Requester/participant visibility was one row each; outsider visibility was zero. Cross-user storage download/upload/delete, direct authoritative writes, obsolete-table writes, anonymous runtime reads, and browser scheduler execution were denied.

### Pilot load profile

The test created and authenticated 300 distinct users, launched 300 concurrent RLS-backed reads, and launched 50 distinct authoritative commands in one burst.

| Measurement | Result |
| --- | ---: |
| 300-user read wave | 1,228 ms |
| Read latency p50 / p95 / p99 / max | 259 / 1,221 / 1,225 / 1,225 ms |
| 50-command burst completion | 48 ms |
| Command latency p50 / p95 / p99 / max | 35 / 46 / 47 / 47 ms |
| Error rate | 0% |
| Maximum database connections sampled | 22 |
| Maximum lock waits sampled | 0 |
| Database container CPU peak | 513.58% Docker CPU, about 5.14 of 32 unrestricted host logical CPUs |
| Correctness | exactly 50 requests, receipts, events, notifications, and outbox rows |

The CPU figure is a short local multicore burst, not a production capacity forecast. Production rollout must retain connection, latency, error, and database CPU alerts and compare them with the pilot thresholds.

### Accessibility and browser proof

- axe found zero serious or critical violations on login, desktop inbox, admin health, and mobile workflow pages.
- Keyboard proof covered page tab order, notification focus/escape restoration, and confirmation-dialog initial focus, trap, escape, and focus restoration.
- A 390 x 844 viewport had zero horizontal overflow, a 24 px minimum visible interactive target, and the desktop-only workflow canvas fallback.
- Live Playwright checks recorded zero page/console errors. The independent browser smoke found meaningful content, no framework error overlay, and expected interactive login elements.

### Backup and restore

The application-owned `public`, `private`, `auth`, `storage`, `supabase_migrations`, and `extensions` schemas were dumped and restored into a new isolated database. Counts matched for 52 requests, 50 events, 50 receipts, 50 notifications, 50 outbox rows, 310 profiles, storage metadata, five migrations, and the operational metric function. The temporary restore database and dump were removed afterward.

## Repeatable commands

```powershell
npm audit --json
npm run test:security:phase7
npm run test:load:phase7
npm run test:a11y:phase7
npm run test:restore:phase7
npm run verify
```

Run `supabase db lint --local --level warning` and `supabase/tests/phase7_security_scale.sql` against the disposable migrated database. Browser and load tests also require the local Supabase URL/keys; the accessibility suite requires the app server URL.
