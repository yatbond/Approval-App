# Shared Fulfillment Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add controlled shared fulfillment confirmation, correction requests, downstream status visibility, important-change notifications, and normalized Supabase mirror tables.

**Architecture:** Keep the task snapshot as the live UI state for this pass, but mirror workflow-control records into normalized Supabase operational tables. Implement pure state helpers first, then wire them into Upload/Tracking actions, and require mirror persistence before committing confirmation/correction/contributor state transitions to local UI state.

**Tech Stack:** Next.js 16 app router route handlers, React 19 client components, Supabase Postgres/RLS, TypeScript state helpers, Node test runner.

---

## File Structure

- Create `src/lib/shared-fulfillment-state.ts`: pure task transition helpers for shared fulfillment, confirmation, rejection, correction creation, and correction submission.
- Create `src/lib/shared-fulfillment-state.test.mjs`: TDD coverage for the transition helpers.
- Create `src/lib/collaboration-status-panel-state.ts`: pure selector that builds downstream status panel groups and blocking reasons.
- Create `src/lib/collaboration-status-panel-state.test.mjs`: selector tests for required submissions, pending confirmations, corrections, contributor requests, and blockers.
- Create `src/lib/collaboration-notification-state.ts`: important-change notification builder for directly involved recipients.
- Create `src/lib/collaboration-notification-state.test.mjs`: notification tests.
- Create `src/lib/collaboration-mirror-store.ts`: Supabase write helper for normalized mirror records.
- Create `src/lib/collaboration-mirror-store.test.mjs`: fake Supabase tests for mirror payloads and failures.
- Modify `src/lib/types.ts`: add `TaskSharedFulfillment`, `TaskCorrectionRequest`, new audit actions, and optional arrays on `ApprovalTask`.
- Modify `src/lib/task-action-state.ts` and `src/lib/workspace-task-action-state.ts`: add preflight blockers for pending confirmations and unresolved correction requests.
- Modify `src/app/api/workflow-collaboration/route.ts`: new route handler for mirror writes. Follow local Next.js route handler docs: `app/api/.../route.ts`, public endpoint, explicit auth/authorization, `NextResponse.json`.
- Modify `src/app/approval-workspace.tsx`: block workflow-control UI transitions until mirror persistence succeeds; add handlers for confirm/reject/correction upload; wire notifications.
- Modify `src/app/task-views.tsx`: add compact status panel and eligible actions in Tracking.
- Modify `src/app/upload-view.tsx`: pass enough metadata when a shared upload is selected so the parent can create a shared fulfillment record.
- Modify `src/lib/workflow-system.ts`: merge important collaboration notifications with existing task notifications without spamming all participants.
- Create Supabase migration `supabase/migrations/20260626093000_create_workflow_collaboration_operational_tables.sql`: operational mirror tables with RLS and grants.

## Documentation Constraints

- Before editing route handlers, use local docs already checked in `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`.
- Before finalizing Supabase SQL, follow the Supabase skill security rules: RLS enabled on public tables, grants explicit, policies scoped to authenticated participants, no `auth.role()`, no `SECURITY DEFINER`.

---

### Task 1: Types and Shared Fulfillment State

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/shared-fulfillment-state.ts`
- Test: `src/lib/shared-fulfillment-state.test.mjs`

- [ ] Add failing tests for shared fulfillment transitions.

Test cases to add:

```js
test("creates a pending shared fulfillment when confirmation is required", () => {});
test("confirms pending fulfillment by current reviewer", () => {});
test("confirms pending fulfillment by assigned submitter", () => {});
test("rejects fulfillment with note and creates blocking correction", () => {});
test("prevents a second decision after first decision wins", () => {});
test("submits correction by original uploader or assigned submitter", () => {});
```

Run:

```powershell
npm test -- --runInBand src/lib/shared-fulfillment-state.test.mjs
```

Expected: fails because helper file/types do not exist.

- [ ] Add types in `src/lib/types.ts`.

Add audit actions:

```ts
| "shared_fulfillment_submitted"
| "shared_fulfillment_confirmed"
| "shared_fulfillment_rejected"
| "correction_requested"
| "correction_submitted"
```

Add task fields:

```ts
sharedFulfillments?: TaskSharedFulfillment[];
correctionRequests?: TaskCorrectionRequest[];
```

Add exported types:

```ts
export type TaskSharedFulfillmentStatus =
  | "pending_confirmation"
  | "confirmed"
  | "rejected"
  | "superseded";

export type TaskSharedFulfillment = {
  id: string;
  taskId: string;
  requirementNodeId: string;
  documentId: string;
  documentType: string;
  assignedSubmitterEmail: string;
  assignedSubmitterName: string;
  uploaderEmail: string;
  uploaderName: string;
  attachmentId: string;
  required: boolean;
  status: TaskSharedFulfillmentStatus;
  submittedAt: string;
  decidedAt?: string;
  decidedByEmail?: string;
  decidedByName?: string;
  decisionRole?: "current_actor" | "assigned_submitter";
  decisionNote?: string;
  correctionRequestId?: string;
};

export type TaskCorrectionRequest = {
  id: string;
  taskId: string;
  sharedFulfillmentId: string;
  requestedByEmail: string;
  requestedByName: string;
  assignedSubmitterEmail: string;
  uploaderEmail: string;
  rejectionNote: string;
  status: "requested" | "submitted" | "cancelled";
  blocksApproval: boolean;
  createdAt: string;
  submittedAt?: string;
  resolvedByFulfillmentId?: string;
};
```

- [ ] Implement `src/lib/shared-fulfillment-state.ts`.

Required exports:

```ts
export function getTaskSharedFulfillmentSubmitState(input: {
  task: ApprovalTask;
  actor: ApprovalActor;
  attachment: ApprovalAttachment;
  requirementNodeId: string;
  documentId: string;
  documentType: string;
  assignedSubmitterEmail: string;
  assignedSubmitterName: string;
  required: boolean;
  requiresConfirmation: boolean;
  extractedFields: Record<string, string>;
  now?: Date;
}): { didApply: boolean; task: ApprovalTask; errorMessage: string };

export function getTaskSharedFulfillmentDecisionState(input: {
  task: ApprovalTask;
  fulfillmentId: string;
  actor: ApprovalActor;
  currentOwnerEmail: string;
  decision: "confirm" | "reject";
  note?: string;
  now?: Date;
}): { didApply: boolean; task: ApprovalTask; errorMessage: string };

export function getTaskCorrectionUploadState(input: {
  task: ApprovalTask;
  correctionRequestId: string;
  actor: ApprovalActor;
  attachment: ApprovalAttachment;
  extractedFields: Record<string, string>;
  now?: Date;
}): { didApply: boolean; task: ApprovalTask; errorMessage: string };
```

Rules:

- Pending if `requiresConfirmation === true`, confirmed otherwise.
- Confirm/reject allowed for current owner or assigned submitter.
- Reject requires non-empty note.
- Reject creates correction request when requirement is required.
- Correction upload allowed by original uploader or assigned submitter.
- All state changes append audit trail entries and namespace extracted fields.

- [ ] Run the focused test and fix until green.

```powershell
npm test -- --runInBand src/lib/shared-fulfillment-state.test.mjs
```

- [ ] Commit Task 1.

```powershell
git add -- src/lib/types.ts src/lib/shared-fulfillment-state.ts src/lib/shared-fulfillment-state.test.mjs
git commit -m "feat: add shared fulfillment state"
```

---

### Task 2: Status Panel Selector and Approval Blockers

**Files:**
- Create: `src/lib/collaboration-status-panel-state.ts`
- Test: `src/lib/collaboration-status-panel-state.test.mjs`
- Modify: `src/lib/task-action-state.ts`
- Modify: `src/lib/workspace-task-action-state.ts`
- Test: `src/lib/task-action-state.test.mjs`
- Test: `src/lib/workspace-task-action-state.test.mjs`

- [ ] Add failing tests for panel state and blockers.

Test cases:

```js
test("lists required submit box documents and missing required uploads", () => {});
test("lists pending shared fulfillment confirmations", () => {});
test("lists blocking correction requests", () => {});
test("lists contributor requests with submitted state", () => {});
test("blocks approval on pending confirmation and unresolved correction", () => {});
```

Run:

```powershell
npm test -- --runInBand src/lib/collaboration-status-panel-state.test.mjs src/lib/task-action-state.test.mjs src/lib/workspace-task-action-state.test.mjs
```

Expected: fails for missing selector/blocking logic.

- [ ] Implement selector.

Required export:

```ts
export function getCollaborationStatusPanelState(input: {
  task: ApprovalTask;
  template?: WorkflowTemplate;
  activeUserEmail: string;
  now?: Date;
}): {
  requiredSubmissions: CollaborationStatusItem[];
  pendingConfirmations: CollaborationStatusItem[];
  corrections: CollaborationStatusItem[];
  contributorRequests: CollaborationStatusItem[];
  blockingReasons: string[];
};
```

`CollaborationStatusItem` should include `id`, `label`, `assignedEmail`, `actualActorEmail`, `status`, `detail`, `canAct`, and optional `dueAt`.

- [ ] Extend approval preflight.

`getTaskActionPreflightState` should accept:

```ts
pendingSharedFulfillments?: TaskSharedFulfillment[];
pendingCorrectionRequests?: TaskCorrectionRequest[];
missingRequiredSubmissionLabels?: string[];
```

It should block approve and approve-with-comment when any are present.

- [ ] Wire `workspace-task-action-state.ts` to derive those arrays from the selected task and template snapshot.

- [ ] Run focused tests until green.

```powershell
npm test -- --runInBand src/lib/collaboration-status-panel-state.test.mjs src/lib/task-action-state.test.mjs src/lib/workspace-task-action-state.test.mjs
```

- [ ] Commit Task 2.

```powershell
git add -- src/lib/collaboration-status-panel-state.ts src/lib/collaboration-status-panel-state.test.mjs src/lib/task-action-state.ts src/lib/task-action-state.test.mjs src/lib/workspace-task-action-state.ts src/lib/workspace-task-action-state.test.mjs
git commit -m "feat: add collaboration status blockers"
```

---

### Task 3: Collaboration Notifications

**Files:**
- Create: `src/lib/collaboration-notification-state.ts`
- Test: `src/lib/collaboration-notification-state.test.mjs`
- Modify: `src/lib/workflow-system.ts`
- Test: `src/lib/workflow-system.test.mjs`

- [ ] Add failing tests for important-change notifications.

Test cases:

```js
test("notifies only directly involved people for pending confirmation", () => {});
test("notifies uploader and requester when shared upload is rejected", () => {});
test("notifies uploader and assigned submitter when correction is created", () => {});
test("dedupes collaboration notifications with existing task notifications", () => {});
```

- [ ] Implement notification builder.

Required export:

```ts
export function buildCollaborationNotifications(input: {
  task: ApprovalTask;
  event:
    | { type: "shared_pending_confirmation"; fulfillmentId: string }
    | { type: "shared_confirmed"; fulfillmentId: string }
    | { type: "shared_rejected"; fulfillmentId: string }
    | { type: "correction_created"; correctionRequestId: string }
    | { type: "correction_resolved"; correctionRequestId: string }
    | { type: "contributor_submitted"; collaborationRequestId: string };
}): TaskNotification[];
```

Recipients must be directly involved only.

- [ ] Extend `TaskNotification["kind"]` with `"collaboration_update"` if needed.

- [ ] Keep `buildTaskNotifications` behavior for general task status. Use the new builder only at the specific action handlers that know which event happened.

- [ ] Run focused tests until green.

```powershell
npm test -- --runInBand src/lib/collaboration-notification-state.test.mjs src/lib/workflow-system.test.mjs
```

- [ ] Commit Task 3.

```powershell
git add -- src/lib/collaboration-notification-state.ts src/lib/collaboration-notification-state.test.mjs src/lib/workflow-system.ts src/lib/workflow-system.test.mjs
git commit -m "feat: add collaboration notifications"
```

---

### Task 4: Supabase Operational Mirror

**Files:**
- Create: `supabase/migrations/20260626093000_create_workflow_collaboration_operational_tables.sql`
- Create: `src/lib/collaboration-mirror-store.ts`
- Test: `src/lib/collaboration-mirror-store.test.mjs`

- [ ] Create the migration with the Supabase CLI if available.

```powershell
supabase migration new create_workflow_collaboration_operational_tables
```

If the CLI is unavailable, create `supabase/migrations/20260626093000_create_workflow_collaboration_operational_tables.sql` manually.

- [ ] Add SQL for four operational tables.

Tables:

```sql
workflow_collaboration_requests
workflow_shared_fulfillments
workflow_correction_requests
workflow_notification_events
```

Each table should include:

- `id text primary key`
- `approval_request_no text not null`
- relevant actor/status columns
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Policies should follow this participant predicate pattern against `approval_requests`:

```sql
exists (
  select 1
  from public.approval_requests r
  join public.profiles p on p.id = (select auth.uid())
  where r.request_no = c.approval_request_no
  and (
    r.requester_id = (select auth.uid())
    or r.current_owner_email = p.email
    or p.email = any(r.participants)
    or p.is_admin
  )
)
```

Grant `select, insert, update` to `authenticated`. Enable RLS on all four tables. Do not grant to `anon`.

- [ ] Add failing fake-Supabase tests for mirror writes.

Test cases:

```js
test("mirrors contributor requests, shared fulfillments, corrections, and notifications", () => {});
test("throws when a mirror upsert fails", () => {});
test("skips empty mirror payloads without touching Supabase", () => {});
```

- [ ] Implement `src/lib/collaboration-mirror-store.ts`.

Required export:

```ts
export async function saveCollaborationMirrorState(
  supabase: SupabaseLike,
  task: ApprovalTask,
  notifications: TaskNotification[],
): Promise<void>;
```

Use `.from(table).upsert(rows, { onConflict: "id" })` and throw on any error.

- [ ] Run focused tests until green.

```powershell
npm test -- --runInBand src/lib/collaboration-mirror-store.test.mjs
```

- [ ] Commit Task 4.

```powershell
git add -- supabase/migrations src/lib/collaboration-mirror-store.ts src/lib/collaboration-mirror-store.test.mjs
git commit -m "feat: add collaboration mirror tables"
```

---

### Task 5: Mirror API Route and Blocking Persistence

**Files:**
- Create: `src/app/api/workflow-collaboration/route.ts`
- Modify: `src/app/approval-workspace.tsx`
- Test: `src/lib/collaboration-mirror-store.test.mjs`

- [ ] Add route handler after reading local Next route handler docs.

Route behavior:

- `POST /api/workflow-collaboration`
- Authenticates using `createSupabaseRouteClient(request, response)` and the same claims/getUser pattern used by `/api/workspace`.
- Accepts `{ task, notifications }`.
- Calls `saveCollaborationMirrorState`.
- Returns `{ mode: "supabase" }` on success.
- Returns `401` when not signed in.
- Returns `400` for invalid body.
- Returns `503` for Supabase write failures.

- [ ] Add client helper inside `approval-workspace.tsx`.

Helper shape:

```ts
async function persistCollaborationTransition({
  task,
  notifications,
}: {
  task: ApprovalTask;
  notifications: TaskNotification[];
}) {
  const response = await fetch("/api/workflow-collaboration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, notifications }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.reason || "Collaboration persistence failed.");
  }
}
```

- [ ] Change contributor request/upload, shared confirmation, rejection, and correction submission handlers so they await `persistCollaborationTransition` before `setTasks`.

- [ ] Keep general workspace snapshot save after local state update for snapshot backup.

- [ ] Run focused tests and typecheck.

```powershell
npm test -- --runInBand src/lib/collaboration-mirror-store.test.mjs
npx next typegen && npx tsc --noEmit
```

- [ ] Commit Task 5.

```powershell
git add -- src/app/api/workflow-collaboration/route.ts src/app/approval-workspace.tsx
git commit -m "feat: persist collaboration transitions"
```

---

### Task 6: Upload and Tracking UI Wiring

**Files:**
- Modify: `src/app/upload-view.tsx`
- Modify: `src/app/task-views.tsx`
- Modify: `src/app/approval-workspace.tsx`

- [ ] Update Upload shared requirement callbacks.

When `sharedUploadDocuments` render, pass document and requirement owner metadata to the parent so the parent can call `getTaskSharedFulfillmentSubmitState`.

- [ ] Add Tracking status panel.

Use `getCollaborationStatusPanelState` and render groups:

- Required submissions
- Pending confirmations
- Corrections
- Contributor requests
- Blocking approval

Use compact rows, no nested cards, and stable button widths.

- [ ] Add confirmation/rejection actions.

For pending confirmations, show Confirm and Reject only when `canAct` is true. Rejection must require a note before calling the handler.

- [ ] Add correction upload action.

For requested corrections, show upload action only for original uploader or assigned submitter.

- [ ] Run typecheck.

```powershell
npx next typegen && npx tsc --noEmit
```

- [ ] Commit Task 6.

```powershell
git add -- src/app/upload-view.tsx src/app/task-views.tsx src/app/approval-workspace.tsx
git commit -m "feat: wire collaboration status UI"
```

---

### Task 7: Full Verification and Browser Smoke

**Files:**
- No production files expected.

- [ ] Run focused tests.

```powershell
npm test -- --runInBand src/lib/shared-fulfillment-state.test.mjs src/lib/collaboration-status-panel-state.test.mjs src/lib/collaboration-notification-state.test.mjs src/lib/collaboration-mirror-store.test.mjs src/lib/task-action-state.test.mjs src/lib/workspace-task-action-state.test.mjs
```

- [ ] Run typecheck.

```powershell
npx next typegen && npx tsc --noEmit
```

- [ ] Run lint.

```powershell
npm run lint
```

- [ ] Run full tests.

```powershell
npm test -- --runInBand
```

- [ ] Run build.

```powershell
npm run build
```

- [ ] Start or reuse dev server.

```powershell
npm run dev
```

- [ ] Browser smoke:

Open:

- `http://localhost:3000/?tab=tracking`
- `http://localhost:3000/?tab=upload`
- `http://localhost:3000/?tab=workflow`

Check:

- page renders
- no captured console errors
- Tracking shows collaboration status panel
- Upload still shows assigned/shared upload sections

- [ ] Commit any final fixes only if the verification step changed files.

```powershell
git status --short
git add -- src/lib src/app supabase/migrations
git commit -m "fix: stabilize collaboration confirmation flow"
```
