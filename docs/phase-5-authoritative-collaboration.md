# Phase 5 authoritative collaboration, ownership, and directory integrity

Date: 2026-07-20

## Outcome

Both collaboration modes now use the same versioned, idempotent, server-authoritative command boundary as approval decisions. Ad-hoc contributor requests, template-defined shared fulfillment, first-decision confirmation, correction loops, delegation, revocation, reassignment acceptance, attachment metadata, events, normalized collaboration rows, participants, and targeted notifications commit atomically.

The retired `/api/workflow-collaboration` mirror endpoint returns `410 legacy_endpoint_retired`. Canonical clients send intents only and reconcile their task from the returned request DTO. A browser cannot send an actor, timestamp, task snapshot, next state, policy flag, or notification recipient.

## Collaboration and correction

- `POST /api/approval-requests/{requestNo}/collaboration` accepts strict, bounded, discriminated commands with `expectedVersion` and an idempotency key.
- Ad-hoc contribution is restricted to the requested active contributor. An unrelated visible or non-visible user cannot submit it.
- Blocking contributor requests, required pending confirmations, and blocking corrections remove approval actions without removing reject, reassign, or delegate recovery actions.
- Shared fulfillment is derived from the pinned template. The server verifies the requirement node, document, target submitter, active uploader, shared-fulfillment permission, required flag, and confirmation policy. The browser cannot override those rules.
- Tracking exposes a real shared-fulfillment upload for an enabled submitter fulfilling another submitter's missing requirement.
- The first confirm/reject decision is authoritative. Rejection creates a correction request; the permitted submitter uploads a correction; the resulting fulfillment returns to confirmation; approval remains blocked until resolution.
- Attachment rows require the authenticated uploader's storage prefix, reject traversal and mismatched requirement metadata, and are inserted in the command transaction.

## Ownership and identity

- Reassignment creates a pending candidate assignment. The candidate can accept or decline but cannot approve before acceptance.
- Delegation retains original-owner visibility, defaults to a seven-day expiry, stores the expiry on the normalized assignment, and can be revoked by the original owner. A revoked delegate cannot act.
- Active scoped role assignments are normalized in `approval_scoped_role_assignments`, time bounded, RLS protected, synchronized for legacy profile roles, returned by `/api/me`, and consulted by the transaction function for `superuser` authority.
- Active profiles with a department scope cannot be assigned to a request in another department. Global profiles remain intentionally usable across scopes.
- Workflow publication verifies every configured assignee and escalation email against the active directory. Request submission resolves every effective participant to an active profile again and rejects invalid targets at the server/database boundary.

## Directory scale

- `/api/directory` uses bounded keyset pagination ordered by email, a maximum page size of 50, and an opaque cursor.
- Non-admin users must provide a safe search; administrators may browse the full active directory.
- The Admin directory/effective-role panel searches the authoritative API, appends pages without duplicates, exposes retry/loading/empty states, and never silently slices a local request-derived array.
- The live API proof created 53 matching Auth/profile records and returned exactly 50 plus 3 across two non-overlapping pages.

## Verification evidence

The final Phase 5 implementation passed against the disposable local Supabase/Postgres database and real Auth users:

- 826 unit, state, contract, and source-boundary tests;
- TypeScript type generation/typecheck and ESLint;
- Next.js 16.2.9 webpack production build;
- authoritative database/RLS suite, including direct role-escalation and collaboration-write denial;
- rolled-back SQL security assertions and Supabase database lint with no schema errors;
- full authoritative API lifecycle for contributor, shared-fulfillment, rejection/correction/reconfirmation, reassignment acceptance, delegation expiry/revocation, target validation, targeted recipients, and attachment failure atomicity;
- live 53-user directory pagination and normalized effective-role proof;
- two-browser stale-version reconciliation suite;
- three independent authenticated browser contexts for requester, owner, and contributor, ending in the requester observing the canonical approved state;
- authenticated navigation/workflow/forms/queue/admin regression suite.

The production Supabase project and the user's original dirty checkout were not changed.

## Phase 6 handoff

Delegation expiry is enforced when authorizing an action and stored durably. Phase 6 must add the scheduler that marks expired assignments, escalates overdue work exactly once, claims notification/outbox jobs safely, and provides retries, dead-letter visibility, and operational controls.
