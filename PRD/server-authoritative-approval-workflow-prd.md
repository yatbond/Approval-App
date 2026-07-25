# Server-Authoritative Approval Workflow PRD

**Document version:** 2.0

**Date:** 2026-07-19

**Status:** Approved implementation baseline

**Implementation branch:** `codex/server-authoritative-approvals`
**Supersedes for reliability and rollout:** the persistence, authorization, workflow-runtime, audit, escalation, and production-readiness sections of `approval-workflow-platform-prd.md`

## 1. Purpose

This PRD defines the production architecture and Phase 0–8 implementation required to operate the Approval Workflow Platform safely for hundreds of concurrent users.

The product capabilities in the existing platform PRD remain in scope. This document replaces the unsafe implementation assumptions that shared workflow state may be authored in a browser, stored as a whole-workspace snapshot, and reconciled by last writer wins.

No phase may begin until the previous phase's exit criteria pass. A passing unit suite alone is not sufficient: database behavior, authorization boundaries, concurrent mutations, browser behavior, and operational recovery must be verified at the phase where they become relevant.

## 2. Problem statement

The current application mirrors shared approval requests into normalized tables but still treats client-owned task snapshots as the effective write model. A stale browser can overwrite another user's approval, alter audit history, restore deactivated records, or replace ownership metadata without an error.

The critical causes are:

1. whole-workspace saves upsert all requests held by the client;
2. a browser with local state does not reliably refresh shared remote state;
3. authorization checks which transitions are allowed are primarily client-side;
4. requesters and owners have broad row UPDATE access through the Data API;
5. events are client-authored and updateable;
6. identity and admin status are fabricated in the client instead of derived from server data;
7. escalation depends on a browser interval;
8. collaboration, notifications, delegation, and status surfaces can diverge from durable data;
9. API, RLS, lifecycle, concurrency, and browser test gates are incomplete;
10. the current code and dependency shape contains reliability, accessibility, performance, and security debt that is unacceptable for a large pilot.

## 3. Product outcome

For every shared request, the database is the single authority. A browser submits an intent; an authenticated server command validates the actor, locks the request, validates the state transition, writes the new state, appends immutable events, enqueues targeted notifications, and commits atomically.

A workspace snapshot remains only a versioned personal recovery/cache artifact for drafts and non-authoritative presentation state. It cannot approve, reject, reassign, delegate, cancel, escalate, alter collaboration state, author audit records, or replace shared request ownership.

## 4. Users and scale assumptions

The initial production target is:

- at least 300 simultaneously active authenticated users;
- at least 50 approval-related command requests per second during a short burst;
- multiple actors reading and acting on the same request at the same time;
- desktop and mobile browsers with long-lived tabs and intermittent connectivity;
- serverless application instances running concurrently in more than one process;
- durable scheduled work that continues when no user has the application open.

The design must remain correct above these numbers. Capacity failures may reject or delay work explicitly; they may never silently lose or duplicate a decision.

## 5. Non-negotiable invariants

### 5.1 Authority

- Shared workflow state is written only by approved server command paths.
- Direct authenticated UPDATE/DELETE access to authoritative request state and audit events is revoked.
- The client never sends a complete replacement shared task as a mutation payload.
- The server derives actor ID, actor email, active status, and roles from the authenticated session and database.

### 5.2 Atomicity and consistency

- One command runs in one database transaction.
- The request row is locked before transition validation and remains locked through commit.
- Request state, node decisions, ownership, collaboration state, audit events, command receipt, and notification/outbox records commit together where they describe one business action.
- A failed command leaves no partial request or audit change.
- Every successful state mutation increments `state_version` exactly once.

### 5.3 Authorization

- Only an actor currently entitled to an action may execute it.
- Requester privileges do not imply approval privileges.
- Admin privilege is derived from an active profile and normalized role assignment; it is never accepted from browser data or user-editable JWT metadata.
- Assignee, delegate, reassignment, contributor, escalation, and fixed-template emails must resolve to active directory profiles before the applicable command commits.
- Every API route independently verifies authentication and authorization close to the database operation.

### 5.4 Idempotency and conflicts

- Every mutation requires a client-generated idempotency key.
- The key is unique within actor and request scope and is bound to a canonical request hash.
- Repeating the same key and payload returns the original result without another transition or event.
- Reusing a key for a different payload returns a conflict.
- A stale `expectedVersion` returns HTTP 409 with the current request DTO and does not mutate state.
- The UI refreshes and explains conflicts rather than silently overwriting remote state.

### 5.5 Audit

- Audit events are insert-only for application roles.
- Event ID/key, actor identity, server timestamp, request version, command ID, and event details are produced or validated by the server.
- No client may update or delete an event.
- Snapshot history is not the audit source of truth.

### 5.6 Visibility and privacy

- A user can read a request only when they are the requester, an active/past participant with retained visibility, an invited contributor for the relevant scope, or an authorized administrator.
- Attachments are private and accessible only through an authorized participant check.
- API DTOs expose only fields the caller is entitled to see.
- Sensitive service credentials never reach the browser.

### 5.7 Durable automation

- Due-date and escalation processing runs on a server schedule and is idempotent.
- Notifications are targeted and durable; mock notifications are forbidden outside explicit test fixtures.
- Provider delivery is asynchronous and retryable. A provider outage does not roll back a valid approval decision.

## 6. Target architecture

### 6.1 Command flow

1. The client reads a request DTO containing `stateVersion` and `availableActions`.
2. The client sends one command containing action-specific input, `expectedVersion`, and an idempotency key.
3. The route handler authenticates the session and validates the bounded request body.
4. A database command function locks the request row with `FOR UPDATE`.
5. The function resolves the active profile and roles, verifies request visibility and action entitlement, and validates directory targets.
6. The workflow transition engine computes the next canonical state from the locked row and pinned template snapshot.
7. The transaction updates canonical columns, appends events, updates normalized collaboration rows, and inserts notification/outbox rows.
8. The transaction stores a command result and commits.
9. The route returns a fresh request DTO, new state version, events, and available actions.
10. The client replaces its cached request with the returned DTO and revalidates relevant lists.

### 6.2 Read flow

- Request list endpoints return bounded summary DTOs with pagination and explicit filters.
- Request detail endpoints load canonical normalized rows and append-only events.
- Realtime or focus/visibility revalidation may improve freshness, but correctness never depends on it.
- Local storage may cache non-sensitive UI and draft data with a schema version. Shared request cache entries are disposable and never become a write source.

### 6.3 Server boundary

- Next.js Route Handlers remain the browser-facing backend-for-frontend.
- A server-only data access layer centralizes session/profile resolution, role checks, DTO shaping, and response-cookie propagation.
- Supabase SSR uses the publishable key and the caller's session for reads.
- Privileged database functions are narrowly scoped, validate `auth.uid()`, set an empty `search_path`, have explicit EXECUTE grants, and are not generally exposed.
- RLS remains defense in depth even when a command function performs the primary transition authorization.

### 6.4 Canonical data

The canonical runtime comprises:

- `profiles` and normalized role assignments;
- immutable published workflow template versions and pinned snapshots;
- `approval_requests` canonical state and `state_version`;
- normalized request participants and active work assignments;
- insert-only approval request events;
- request attachments and extracted values;
- reassignment, delegation, collaboration, fulfillment, and correction records;
- notification events and email outbox;
- idempotent command receipts;
- durable scheduler leases/runs where needed.

`task_snapshot` remains a derived compatibility projection during migration, then a read-only derived cache. `workspace_snapshots` remain per-user recovery artifacts and may not be used to mutate canonical runtime rows.

## 7. API contract

### 7.1 Queries

- `GET /api/me` — active profile, effective roles, business/department scope.
- `GET /api/directory?query=` — bounded active-user lookup for assignment controls.
- `GET /api/approval-requests?view=&cursor=&limit=` — paginated Inbox/Tracking summaries.
- `GET /api/approval-requests/{requestNo}` — canonical request detail, version, events, collaboration, and available actions.

### 7.2 Commands

- `POST /api/approval-requests` — submit a request from a validated draft.
- `POST /api/approval-requests/{requestNo}/actions` — execute one discriminated action payload.
- `POST /api/approval-requests/{requestNo}/attachments` — authorize and register request/node attachment metadata.
- `POST /api/approval-requests/{requestNo}/collaboration` — contributor, fulfillment, confirmation, and correction commands when kept separate from the main action union.
- `POST /api/internal/escalations/run` — protected scheduler entry point if Vercel Cron is used instead of direct database scheduling.

### 7.3 Action union

The authoritative action union includes:

- approve;
- approve with note;
- reject to originator;
- reject to an allowed upstream node;
- amend and resubmit;
- cancel;
- propose, accept, or decline reassignment;
- delegate or revoke delegation;
- request contributor input;
- submit contributor fulfillment;
- confirm fulfillment;
- request correction;
- submit correction;
- acknowledge FYI where configured;
- escalate through the system scheduler.

Each action has a strict Zod schema. Unknown properties, unbounded strings/arrays, client-supplied actor fields, client timestamps, client event keys, and arbitrary task snapshots are rejected.

### 7.4 Responses

- `200` successful or idempotently replayed command;
- `400` malformed input or invalid transition parameters;
- `401` missing or invalid session;
- `403` authenticated but not entitled;
- `404` request absent or intentionally hidden;
- `409` stale version, conflicting idempotency reuse, or already-decided state;
- `422` unresolved/inactive directory target or unmet business precondition;
- `429` rate limit exceeded;
- `503` temporary dependency/capacity failure with no partial commit.

Every error uses a stable machine code, safe user message, correlation ID, and optional fresh request DTO for recoverable conflicts.

## 8. Data requirements

### 8.1 Request state

`approval_requests` must add or formalize:

- `schema_version integer not null`;
- `state_version bigint not null`;
- canonical request status constrained to supported values;
- pinned workflow template version and immutable template snapshot;
- current node, current owner profile, pending nodes, and active assignment state;
- requester profile resolved server-side;
- submitted/updated/completed timestamps generated server-side;
- derived snapshot with a documented schema version for compatibility only.

### 8.2 Participants and assignments

Typed-email arrays are not sufficient for authorization. Normalized records must identify:

- request;
- profile/user;
- participant role and visibility reason;
- workflow node where relevant;
- active/from/to timestamps;
- delegation/reassignment relationship;
- creator and server timestamps.

### 8.3 Commands

The command receipt table stores:

- command UUID;
- request ID;
- authenticated actor ID;
- idempotency key;
- action;
- canonical payload hash;
- expected and resulting state versions;
- result DTO/projection or stable result reference;
- status and server timestamps;
- unique `(request_id, actor_id, idempotency_key)`.

### 8.4 Events

Events store:

- immutable event UUID and request ID;
- command ID when command-generated;
- resulting request version;
- action/event type;
- actor profile/email captured from the server;
- optional target profile/email;
- bounded structured details and human-readable summary;
- server-created timestamp.

Authenticated roles receive SELECT only according to visibility. INSERT is restricted to the authoritative command path; UPDATE and DELETE are revoked and have no policies.

### 8.5 Schema versioning

- All persisted JSON shapes have an explicit integer schema version.
- Parsers migrate supported older shapes deterministically.
- Unsupported future versions fail safely with recovery instructions rather than causing a sticky white screen.
- Null or malformed legacy snapshots cannot take the entire normalized loader down.

## 9. UX requirements

- The UI renders server-provided role and available-action data.
- Every command has pending, success, validation, conflict, authorization, and retryable-failure states.
- Buttons disable while the same idempotency key is in flight.
- On 409, the UI replaces stale data with the server DTO and tells the user what changed.
- Window focus, visibility restoration, and network reconnect trigger bounded request/list revalidation.
- There are no permanent mock unread badges or inert controls in production UI.
- Delegation controls either persist and affect routing or are not shown.
- Admin role and directory lists are paginated/searchable and never silently truncated.
- Assignment inputs select or validate active directory users; free-typed invalid emails cannot publish or submit.
- A top-level error boundary offers retry and safe local-cache reset without deleting server data.
- File inputs reset after processing so the same file can be selected again.
- Confirmation modals trap focus, restore focus, and protect against duplicate keyboard submission.
- Document-box selection supports keyboard and touch as well as mouse.

## 10. Reliability, performance, and security targets

### 10.1 Correctness

- Zero lost decisions in deterministic two-client and load-driven races.
- Zero duplicate events or notifications for idempotent retries.
- Exactly one winner when competing actions target the same request version.
- No mixed normalized/snapshot state after an injected persistence failure.

### 10.2 Performance

- Request summary p95 <= 1.0 second at target load.
- Request detail p95 <= 1.5 seconds at target load.
- Approval command p95 <= 1.5 seconds and p99 <= 3.0 seconds at target load, excluding external email delivery.
- Error rate below 1% under the agreed 300-user/50-command-per-second burst profile, with all errors explicit and no invariant violations.
- Queries use bounded result sets and indexed request, participant, active-owner, version, idempotency, due-date, and event access paths.

### 10.3 Security

- Real authenticated positive and negative RLS tests cover requester, current actor, former actor, unrelated user, contributor, inactive user, and admin.
- Browser/API tests prove that actor, role, owner, timestamp, event, and version fields cannot be forged.
- Private attachments cannot be read by unrelated users.
- Security and performance advisors contain no unexplained error-level findings introduced by this work.
- Vulnerable spreadsheet parsing dependencies are removed or isolated behind a documented, tested mitigation before pilot release.

### 10.4 Observability

- Every command has a correlation/command ID in response and structured logs.
- Metrics include command latency/outcome by action, conflicts, idempotent replays, authorization denials, scheduler lag, overdue counts, notification/outbox delivery, snapshot fallback usage, and migration read mismatches.
- Operational health is itself authenticated and covered by E2E.
- Logs never contain credentials, raw access tokens, full documents, or unnecessary extracted sensitive values.

## 11. Phase 0–8 implementation plan

## Phase 0 — Trustworthy baseline and implementation control

### Objective

Create a reproducible baseline so later green gates are meaningful.

### Implementation

1. Save and version this PRD and its requirement-to-test matrix.
2. Preserve the user's pre-existing dirty checkout; implement on the isolated branch/worktree.
3. Add `typecheck`, recursive unit-test discovery, supported Node engine, and deterministic CI commands.
4. Add CI for install, type generation/check, lint, unit/API tests, build, and Playwright smoke.
5. Fix the development E2E auth bypass so server pages and API routes resolve the same synthetic user only outside production.
6. Add route-level tests for cookie propagation and auth status handling.
7. Remove production mock notifications; wire or remove inert delegation UI; remove admin list truncation.
8. Add the error boundary/local-cache recovery path, debounced local autosave, unchanged-reference escalation behavior, file-input resets, accessible confirmation behavior, and remove Upload-tab render-side-effect saves.
9. Record dependency audit findings and a removal/mitigation owner for `xlsx`; never run a breaking forced audit fix.
10. Confirm ignored environment, logs, build output, and temporary folders remain outside Git.

### Required tests

- clean `npm ci`;
- Next type generation and `tsc --noEmit`;
- lint;
- all recursively discovered unit tests with an assertion count recorded;
- production webpack build;
- E2E navigation and authenticated operational-health smoke using the development bypass;
- source and browser checks proving mock/inert/truncated behavior is gone;
- clean-worktree check excluding intentional changes.

### Exit criteria

All baseline gates pass locally and CI is capable of running the same commands. Any remaining dependency advisory has an explicit Phase 7 removal gate. No shared-state architecture change begins on an untrustworthy test harness.

## Phase 1 — Authoritative database foundation

### Objective

Make invalid shared-state writes structurally impossible and provide atomic primitives for subsequent APIs.

### Implementation

1. Create an ordered migration using the installed Supabase CLI workflow.
2. Add schema/state versions, command receipts, normalized participants/assignments, delegation/reassignment state, durable notifications/outbox, and required indexes/constraints.
3. Backfill profile/request/participant references by normalized email with an explicit unresolved-user report; do not silently null ownership.
4. Preserve `public_url` and all required attachment fields during normalized round trips.
5. Make event tables insert-only and revoke direct request-runtime mutations that bypass commands.
6. Add a private, narrowly granted transactional command function or equivalent database primitive with row locking, version checks, idempotency, target validation, and atomic event writes.
7. Replace the six-table non-transactional normalized save with an atomic RPC for non-runtime workspace configuration, while excluding authoritative runtime rows from whole-workspace saves.
8. Guard/reconstruct null or malformed legacy template/task snapshots.
9. Add explicit Data API grants because new Supabase projects no longer expose tables/functions automatically.
10. Keep RLS enabled and index every policy/join/filter column used on hot paths.

### Required tests

- migration applies from the current production migration chain to a disposable/local database;
- migration is idempotent where required and has a reviewed rollback/forward-repair plan;
- SQL tests for constraints, grants, RLS, event immutability, target validation, stale version, idempotent replay, payload mismatch, and transaction rollback;
- two-session lock race proving one state-version winner;
- normalized round-trip tests including attachment URL and null legacy snapshots;
- Supabase security/performance advisors reviewed after migration.

### Exit criteria

Direct browser credentials cannot rewrite authoritative runtime state or audit history. Atomic database tests prove zero partial writes, duplicate events, and lost updates.

## Phase 2 — Authenticated server query and command APIs

### Objective

Expose a bounded, authenticated, server-validated application contract.

### Implementation

1. Create a server-only DAL for session, active profile, roles, visibility, DTOs, and Supabase response-cookie propagation.
2. Implement `/api/me`, directory search, request list/detail, request submission, and authoritative action routes.
3. Reuse the existing pure workflow engine on the server while separating deterministic transition computation from server timestamps/IDs and persistence.
4. Add Zod discriminated schemas, size limits, action-specific validation, stable error codes, correlation IDs, and safe logging.
5. Ensure every route checks authentication and authorization even if Proxy already admitted the page.
6. Return fresh canonical DTOs and server-computed `availableActions` after every command.
7. Ensure refreshed Supabase cookies are copied to every returned response.
8. Apply explicit no-store behavior to personalized runtime query responses.

### Required tests

- tests for every method of every runtime API route;
- 401/403/404/409/422 cases;
- forged actor/role/timestamp/event/state fields rejected;
- cookie refresh propagated on success and error responses;
- positive lifecycle tests for sequential, parallel, conditional, reject/return, reassign, delegate, cancel, and resubmit;
- build and complete Phase 0 regression suite.

### Exit criteria

The server API can execute every core lifecycle transition against canonical data, and route tests prove unauthorized callers cannot obtain equivalent effects.

## Phase 3 — Client cutover and state reconciliation

### Objective

Stop all client whole-row task writes and make the UI a consumer of canonical DTOs.

### Implementation

1. Replace `applyTaskAction` client persistence with API commands while preserving optimistic presentation only where rollback is safe.
2. Stop `/api/workspace` and autosave from writing authoritative requests, events, attachments, collaboration, or ownership.
3. Load Inbox/Tracking/detail from paginated canonical query APIs.
4. Revalidate on focus, visibility restore, reconnect, and successful commands.
5. Add 409 reconciliation UI and deterministic retry behavior using the original idempotency key.
6. Add schema-versioned local caches and migrations; treat shared request cache as disposable.
7. Split the oversized workspace state/render surface into tab/request containers with narrow props and memoized pure views where measurement shows benefit.
8. Debounce expensive serialization and ensure unchanged scheduler/state operations preserve object identity.

### Required tests

- source-level guard that workspace snapshot paths cannot mutate runtime tables;
- component/hook tests for success, pending, retry, offline, 401, 403, 409, 422, and 503;
- two-browser test where one approval remains after the other stale browser autosaves and refocuses;
- refresh/reconnect tests;
- render/performance measurements for common typing and navigation flows;
- full type/lint/unit/build/E2E regression.

### Exit criteria

No browser workflow can overwrite another user's decision through workspace save, local storage, tab rendering, or stale refocus. The canonical server response always wins.

## Phase 4 — Concurrency, idempotency, and conflict proof

### Objective

Prove correctness under realistic races and retries.

### Implementation

1. Add deterministic concurrency fixtures for same-action and competing-action races.
2. Add retry simulations for response loss, double-click, browser resend, serverless retry, and network reconnect.
3. Validate row-lock duration, deadlock handling, lock timeout, and bounded retry rules.
4. Add request/action rate limits that do not weaken correctness.
5. Add correlation IDs and command receipts to operational diagnostics.

### Required tests

- concurrent approve/approve;
- approve/reject;
- approve/reassign;
- correction/approve;
- cancel/approve;
- same-key same-payload replay;
- same-key different-payload conflict;
- stale expected version;
- injected failure after each transaction step;
- at least 1,000 repeated race iterations locally or on an isolated database with zero invariant failures.

### Exit criteria

Exactly one valid transition wins each competing version. Retries return stable results. No duplicate event, command, notification, or partial state is observed.

## Phase 5 — Collaboration, correction, ownership, and directory integrity

### Objective

Move all collaborative behavior onto the same authoritative model without reducing the product's flexible collaboration modes.

### Implementation

1. Preserve both template-defined multi-submit requirements and ad-hoc contributor invitations.
2. Server-validate contributor requests, fulfillment submission, first-decision confirmation, correction requests, corrected fulfillment, and blocking behavior.
3. Preserve broad status visibility for originators, owners, contributors, prior actors, and authorized admins while keeping notifications sparse and targeted.
4. Implement real delegation and reassignment ownership semantics with acceptance, expiry/revocation, and audit history.
5. Derive roles from profiles plus normalized scoped role assignments.
6. Replace free-typed assignment with active-directory selection/validation at template publish and request submission.
7. Make admin directory and role views paginated/searchable with no arbitrary truncation.

### Required tests

- complete lifecycle for both collaboration modes;
- first confirm/reject and later correction loops;
- blocking correction prevents approval;
- non-blocking contribution does not seize ownership;
- delegation retains original-owner visibility and limits delegate actions;
- reassignment requires candidate acceptance;
- inactive, missing, typo, unrelated, and cross-scope directory targets rejected;
- targeted notification recipient assertions;
- authenticated browser E2E with multiple real users.

### Exit criteria

All collaboration and ownership changes are authoritative, auditable, directory-backed, and consistent across users and devices.

## Phase 6 — Durable escalation and notification delivery

### Objective

Remove browser presence from operational correctness.

### Implementation

1. Implement an idempotent server scheduler using Supabase Cron/`pg_cron` or protected Vercel Cron.
2. Claim due work safely so overlapping scheduler runs cannot double-escalate.
3. Execute escalation through the same authoritative command/event rules.
4. Persist in-app notification events and read state server-side.
5. Persist email outbox records and process them asynchronously with bounded retries, backoff, terminal failure, and diagnostic state.
6. Replace mock notification counts and client-memory outbox state.
7. Provide real delegation schedule controls or keep them absent until authoritative.

### Required tests

- clock-controlled due/not-due cases;
- no-browser weekend simulation;
- overlapping scheduler invocation;
- escalation idempotency;
- retryable and permanent email provider failure;
- notification audience/read-state isolation;
- scheduler authentication and replay resistance;
- live scheduled smoke in an isolated/non-production environment.

### Exit criteria

Due work escalates once without any open browser, and notification/provider failures are durable, visible, and retryable without duplicating workflow decisions.

## Phase 7 — Security, scale, performance, accessibility, and observability hardening

### Objective

Demonstrate that the system is safe and usable for the stated pilot scale.

### Implementation

1. Replace or isolate the vulnerable `xlsx` dependency; resolve safe dependency updates without forced breaking downgrades.
2. Complete real-user RLS and storage authorization coverage for every exposed table/function/bucket.
3. Review function ownership, `SECURITY DEFINER`, `search_path`, EXECUTE grants, view security, and Data API exposure.
4. Add/verify hot-path indexes, pagination, query bounds, payload limits, and connection-pool-compatible access.
5. Add structured logs, metrics, alert thresholds, operational dashboards, and runbooks.
6. Run accessibility checks for keyboard, focus, mobile/touch document boxing, dialogs, errors, and loading states.
7. Run the target load profile and tune only from measured database/application evidence.
8. Resolve or explicitly accept pre-existing advisor findings with ownership and rationale; no new unexplained warnings.

### Required tests

- authenticated RLS matrix with real test users and rollback cleanup;
- storage cross-user denial;
- OWASP-style API abuse cases, input limits, and rate limits;
- dependency audit and software composition review;
- 300 active-user and 50-command-per-second burst load test;
- p50/p95/p99 latency, error rate, lock wait, database CPU/connections, and invariant audit;
- axe/keyboard/touch/browser checks;
- backup/restore and observability alert drills where available.

### Exit criteria

Security boundaries are proven with real identities, target-scale tests meet the published thresholds with zero correctness violations, and operators can detect and diagnose failures.

## Phase 8 — Migration, cutover, rollback, and release proof

### Objective

Move existing data and production traffic to the authoritative model without losing in-flight work.

### Implementation

1. Inventory and back up existing requests, snapshots, events, attachments, and collaboration rows.
2. Run a deterministic backfill with unresolved/invalid records quarantined for review.
3. Enable mirror/read-compare mode and record mismatches without allowing legacy writes to win.
4. Gate command/client cutover behind server-controlled feature flags with a documented rollback path.
5. Rehearse migration and rollback on a production-like branch/database.
6. Deploy database before compatible application code, then enable cohort rollout, then full rollout.
7. Freeze legacy runtime writes after acceptance; retain time-bounded read fallback and remove it only after evidence.
8. Update the deployment runbook, incident response, scheduler/outbox operations, support guidance, and architecture documentation.
9. Run the complete requirement-to-test matrix and archive evidence bound to the final commit/deployment.

### Required tests

- migration rehearsal on a production-shaped data copy;
- row counts, hashes, foreign keys, unresolved identity report, and event ordering reconciliation;
- in-flight sequential, parallel, conditional, returned, delegated, reassigned, and collaboration requests survive cutover;
- rollback rehearsal before irreversible legacy-write removal;
- complete unit, API, SQL/RLS, concurrency, E2E, accessibility, load, build, advisor, and production smoke suites;
- post-deploy real-user lifecycle including request submit, approval, rejection/resubmit, collaboration/correction, escalation, attachment access, notification, and audit review.

### Exit criteria

Production uses only server-authoritative shared-state writes, all in-flight data is reconciled, rollback is rehearsed, all PRD requirements have current evidence, and no required work remains.

## 12. Requirement-to-test matrix

| Requirement | Primary proof |
| --- | --- |
| No lost decisions | two-session SQL race plus two-browser stale-autosave test and Phase 4 stress loop |
| Legal transitions only | server transition unit/API tests plus database authorization tests |
| Real identity/roles | `/api/me` tests, real-user RLS matrix, forged-role negative tests |
| Insert-only audit | grants/policy catalog checks and failed UPDATE/DELETE as authenticated users |
| Atomic persistence | injected failure SQL tests and post-failure row/event counts |
| Idempotency | replay/mismatch API and database tests |
| Conflict handling | stale-version API test and browser reconciliation E2E |
| Durable escalation | overlapping scheduled-run tests and no-browser live smoke |
| Directory integrity | publish/submit/action tests for active, inactive, missing, and scoped users |
| Collaboration semantics | multi-user E2E for both modes, confirmations, corrections, and blocking |
| Attachment privacy | authenticated cross-user storage/API denial tests |
| Session continuity | refreshed-cookie route tests and long-lived browser smoke |
| Snapshot compatibility | version migration, malformed/null recovery, and derived-cache tests |
| Performance at hundreds of users | target load report with database and app metrics plus invariant audit |
| Accessible interactions | automated axe plus manual keyboard/touch/focus verification |
| Safe cutover | rehearsal reconciliation, feature-flag rollback, and final deployment smoke |

## 13. Delivery controls

- Feature work unrelated to these phases remains frozen until Phase 4 proves the core concurrency model.
- Each phase receives its own implementation summary, test evidence, and focused commit(s).
- Database migrations are forward-safe, ordered, reviewed, and tested before production application.
- Production data mutations are not used as an experiment. Read-only inspection and transaction-rollback proofs precede deployment.
- A phase is not complete when a test merely exists; the test must exercise the stated boundary and pass against the relevant current state.
- A later regression reopens the phase whose invariant failed.

## 14. Final definition of done

The project is complete only when:

1. every Phase 0–8 exit criterion passes;
2. all Claude review findings and baseline findings are mapped to implemented fixes and direct evidence;
3. the full application uses authoritative server commands for all shared workflow mutations;
4. real-user RLS, storage, lifecycle, concurrency, scheduler, and load proofs pass;
5. the final migration and rollback have been rehearsed;
6. production smoke verifies the complete lifecycle on the final deployed candidate;
7. documentation and operator runbooks match the deployed behavior;
8. the old whole-workspace shared-state write path cannot be re-enabled accidentally.
