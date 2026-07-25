# Shared Fulfillment Confirmation, Status, and Notifications Design

## Goal

Extend collaborative submissions so shared fulfillment is controlled, visible, and auditable. The feature must cover three connected areas:

- Shared fulfillment confirmation and rejection.
- A downstream status panel visible to all request participants.
- Important-change notifications for directly involved people.

The current application should remain stable by keeping the existing task snapshot as the live UI state. New normalized Supabase tables will be added as a mirror for operational records, with the intent to become the source of truth later after the workflow is proven.

## Current Context

The app already supports:

- Template-level Submit Request boxes with assigned submitter name and email.
- Shared fulfillment toggles on submit boxes.
- Upload-page grouping between assigned requirements and other requirements a submitter may help fulfill.
- Queue-side contributor requests with request note, due date, and blocking option.
- Tracking-side contributor uploads with AI/OCR parsing into task fields.
- Task-snapshot persistence through the existing workspace snapshot.
- Email notification generation from `buildTaskNotifications`.

The next feature should build on this foundation rather than replace it.

## Product Rules

### Shared Fulfillment

A shared fulfillment happens when a user uploads or fills a requirement that belongs to another submit box.

If the owning submit box does not require confirmation, the shared fulfillment can satisfy the requirement immediately.

If the owning submit box requires confirmation, the shared fulfillment enters `pending_confirmation`.

Either of these people can confirm or reject:

- The current reviewer or approver responsible for the active workflow action.
- The original assigned submitter for the requirement.

First decision wins. After one eligible person confirms or rejects, the status is final for that shared upload attempt. Every decision must record the decision maker, decision time, role context, and note when present.

### Rejection and Correction

Rejecting a shared fulfillment requires a rejection note.

Rejection creates a correction request for the original uploader. While the correction request is pending, downstream approval or review is blocked when the original requirement was required.

The correction can be fixed by either:

- The original uploader.
- The original assigned submitter for the requirement.

When a correction is submitted, it follows the same shared fulfillment rule again. If confirmation is required, the corrected upload also enters `pending_confirmation`.

### Downstream Status Panel

The status panel is visible to all task participants, including originator, submitters, contributors, reviewers, approvers, and FYI users.

The panel should show:

- Upstream submit boxes and assigned submitters.
- Required and optional document or form requirements.
- Missing required items.
- Shared fulfillment items awaiting confirmation.
- Confirmed shared fulfillment items.
- Rejected shared fulfillment items and their correction requests.
- Contributor requests and contributor submission status.
- Overdue contributor or correction items.
- Current blocking reason before approval or review.

The panel should be functional inside Tracking first, because that is where participants already inspect task state and audit trail. It can later be reused in Queue or Upload if needed.

### Notifications

Only important upstream changes should notify people. Avoid notifying on every minor state change.

Important notification events are:

- Required upload submitted.
- Shared upload needs confirmation.
- Shared upload confirmed.
- Shared upload rejected.
- Correction request created.
- Correction request resolved.
- Contributor request submitted.
- Required contributor, shared fulfillment, or correction item becomes overdue.

Recipients should be only directly involved people:

- Original uploader.
- Original assigned submitter.
- Current reviewer or approver when confirmation or blocking is relevant.
- Requester when their request becomes blocked, unblocked, or materially updated.

All generated notifications should still flow through the existing email delivery and outbox path.

## State Model

### Snapshot State

The task snapshot remains the live UI state for this pass.

Extend snapshot-backed task state with structured shared fulfillment and correction records. This keeps Queue, Tracking, Upload, approval preflight, and workspace persistence deterministic without requiring a full read-path migration.

Expected snapshot additions:

- `sharedFulfillments?: TaskSharedFulfillment[]`
- `correctionRequests?: TaskCorrectionRequest[]`

The existing `collaborationRequests` array remains for ad-hoc contributor requests.

### Shared Fulfillment Record

Each shared fulfillment record should contain:

- `id`
- `taskId`
- `requirementNodeId`
- `documentId`
- `assignedSubmitterEmail`
- `assignedSubmitterName`
- `uploaderEmail`
- `uploaderName`
- `attachmentId`
- `required`
- `status`: `pending_confirmation`, `confirmed`, `rejected`, or `superseded`
- `submittedAt`
- `decidedAt`
- `decidedByEmail`
- `decidedByName`
- `decisionRole`: `current_actor` or `assigned_submitter`
- `decisionNote`
- `correctionRequestId`

### Correction Request Record

Each correction request should contain:

- `id`
- `taskId`
- `sharedFulfillmentId`
- `requestedByEmail`
- `requestedByName`
- `assignedSubmitterEmail`
- `uploaderEmail`
- `rejectionNote`
- `status`: `requested`, `submitted`, or `cancelled`
- `blocksApproval`
- `createdAt`
- `submittedAt`
- `resolvedByFulfillmentId`

Correction requests should block approval only when `blocksApproval` is true.

## Normalized Supabase Mirror

Add basic operational tables now. These tables are not reporting-optimized yet.

The normalized mirror should include:

- `workflow_collaboration_requests`
- `workflow_shared_fulfillments`
- `workflow_correction_requests`
- `workflow_notification_events`

The mirror should be written when the task snapshot changes for these features. Reads can remain snapshot-backed for now.

### Table Requirements

All new tables must:

- Enable row-level security.
- Be accessible only to authenticated users who participate in the related workflow request.
- Include `workspace_id` or equivalent request scope if the current schema has one; otherwise use the existing request/task identifier and participant checks available in the app data model.
- Store `created_at` and `updated_at` where mutation happens.
- Use stable ids generated by the app or database, not display text.

### Migration Strategy

Create a Supabase migration for the new tables and policies. Do not convert existing task snapshots in this pass. Existing requests can begin writing mirror records only when touched by the new workflow.

The implementation plan must inspect the existing Supabase schema before finalizing exact foreign keys and RLS predicates.

## Blocking Rules

Approval and approve-with-comment actions must be blocked when any of these are true:

- A blocking contributor request is still `requested`.
- A required shared fulfillment is `pending_confirmation`.
- A required shared fulfillment was rejected and its correction request is still `requested`.
- A required upstream submit box has no satisfying assigned or confirmed shared upload.

The preflight error should list concise human-readable blockers, for example:

- `Site Team delivery note is pending confirmation.`
- `Contractor invoice correction is still required.`
- `QS assessment has not been uploaded.`

## UI Design

### Tracking Status Panel

Add a status panel near the workflow path and contributor request sections. It should use compact rows rather than a large visual dashboard.

Suggested groups:

- `Required submissions`
- `Pending confirmations`
- `Corrections`
- `Contributor requests`
- `Blocking approval`

Each row should show:

- Requirement name.
- Assigned submitter.
- Actual uploader when different.
- Status.
- Due date when available.
- Primary action when the active user can act.

### Confirmation Actions

For eligible users, pending shared fulfillment rows should show:

- Confirm.
- Reject.

Reject opens or reveals a required note field. Confirm can be immediate, but should still audit who confirmed.

### Correction Actions

For eligible users, correction rows should show a file upload action that reuses the existing AI/OCR parse path.

Eligible users are:

- Original uploader.
- Original assigned submitter.

## API and Data Flow

Use pure state helpers for the workflow rules first, then wire them into React handlers.

Expected helper responsibilities:

- Build status panel state from task, template snapshot, active user, and current node.
- Create shared fulfillment records when an upload satisfies another submitter's requirement.
- Confirm or reject pending shared fulfillment records.
- Create correction requests on rejection.
- Submit corrected uploads.
- Build important-change notification events and route them through existing email/outbox code.
- Mirror each accepted state transition into normalized Supabase tables.

The Upload page should keep using the existing parse path:

`file upload -> PDF/image render where needed -> AI parse -> draft/attachment state -> task transition`

## Error Handling

Invalid actions should fail with explicit messages:

- Unknown shared fulfillment.
- User is not allowed to confirm or reject this fulfillment.
- Rejection note is required.
- Correction request was not found.
- User is not allowed to resolve this correction.
- Upload was parsed but could not be mirrored to Supabase.

If the normalized mirror write fails for a workflow-control transition, the task snapshot must not be updated. Confirmation, rejection, correction creation, correction submission, and contributor submission should all fail visibly until both the snapshot transition and normalized mirror write can be persisted. This avoids a split-brain state where the UI says an approval blocker was resolved but the operational table did not record the decision.

## Testing Strategy

Use test-driven development for state helpers before UI wiring.

Required tests:

- Shared fulfillment enters `pending_confirmation` when required.
- Shared fulfillment confirms by current reviewer or original assigned submitter.
- First decision wins after confirmation or rejection.
- Rejection requires a note.
- Rejection creates a blocking correction request for required requirements.
- Correction can be submitted by original uploader or original assigned submitter.
- Approval preflight blocks on pending confirmations and unresolved corrections.
- Status panel state lists required submissions, pending confirmations, corrections, contributor requests, and blocking reasons.
- Notifications include only important-change events and only directly involved recipients.
- Supabase mirror helpers produce the expected rows or API payloads.

Verification commands should include:

- Focused state tests.
- `npx next typegen && npx tsc --noEmit`
- `npm run lint`
- `npm test -- --runInBand`
- `npm run build`
- Browser smoke for Tracking and Upload.

## Open Implementation Notes

Before coding Supabase migrations, inspect the current schema and migration conventions. The exact table names above may be adjusted to match existing naming, grants, and request identifiers.

Before coding Next.js route or server behavior, read the relevant guide in `node_modules/next/dist/docs/` because this repo's AGENTS.md warns that this Next.js version has changed conventions.

## Non-Goals

This pass will not add:

- Reporting dashboards.
- Historical backfill for old task snapshots.
- Full normalized-table read path.
- Teams or push notifications.
- Template-level notification customization.
