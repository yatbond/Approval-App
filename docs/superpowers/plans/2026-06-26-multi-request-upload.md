# Multi Request Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload/parse multiple documents and submit them as separate workflow request instances in one action.

**Architecture:** Keep the workflow engine unchanged. Add a small upload draft row model around the existing single-request parser result and reuse `createApprovalTaskFromTemplate` for each row. The UI presents multiple independent request drafts with per-row extracted fields, attachments, validation status, and a `Submit all` action.

**Tech Stack:** Next.js 16 app router, React 19 client state, Node test runner, TypeScript library state helpers.

---

### Task 1: Batch Submission State

**Files:**
- Modify: `src/lib/workspace-request-submission-state.ts`
- Test: `src/lib/workspace-request-submission-state.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests that call `getWorkspaceBatchRequestSubmissionState` with two valid draft inputs and assert it creates two tasks, selects the newest task id, clears uploaded draft work, and reports a two-request success message. Add a second test where one draft is invalid and assert no tasks are created and the message identifies the invalid draft.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/lib/workspace-request-submission-state.test.mjs`
Expected: FAIL because `getWorkspaceBatchRequestSubmissionState` is not exported.

- [ ] **Step 3: Implement batch state helper**

Create `UploadRequestSubmissionDraft` and `getWorkspaceBatchRequestSubmissionState`. Reuse `getWorkspaceRequestSubmissionState` for each draft, make the operation all-or-nothing, and generate stable task ids with `taskIdPrefix` when provided.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `npm test -- src/lib/workspace-request-submission-state.test.mjs`
Expected: PASS.

### Task 2: Upload UI Draft Rows

**Files:**
- Modify: `src/app/upload-view.tsx`
- Modify: `src/app/use-approval-workspace-state.ts`
- Test: existing upload and workspace tests

- [ ] **Step 1: Add UI state for request drafts**

Add a draft list containing file name, parse result, edited fields, attachments, and status. When a parse succeeds, append or update a draft row instead of only replacing the single global extraction draft.

- [ ] **Step 2: Show draft rows in Upload page**

Render a `Request drafts` section showing each uploaded document as a separate row with status and extracted field count. Keep the existing extraction editor for the selected row.

- [ ] **Step 3: Add `Submit all` action**

Wire a new callback from workspace state that calls `getWorkspaceBatchRequestSubmissionState`. Keep existing `Submit request` for one selected draft and show `Submit all` only when two or more drafts exist.

- [ ] **Step 4: Verify with tests**

Run: `npm test`, then fix failures.

### Task 3: Final Verification

**Files:**
- No new production files expected.

- [ ] **Step 1: Run full checks**

Run:
- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

- [ ] **Step 2: Browser sanity**

Open `http://localhost:3000/?tab=upload`, confirm the Upload tab loads, and check console errors. If logged out, verify the login shell and state the limitation.

---

Self-review: This plan is scoped to simple multi-request submission. It excludes parent batch workflows, cross-request approval logic, and rollback after partial remote persistence. It reuses existing workflow instance creation and keeps each submitted request independent.
