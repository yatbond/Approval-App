# Collaborative Submit Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow template-level submit boxes to opt into shared fulfillment so one submitter can see and upload documents required from other upstream submit boxes.

**Architecture:** Keep each workflow request as a normal `ApprovalTask`. Extend submit-request graph nodes with shared-fulfillment metadata, derive upload-page requirement groups from the active user's assigned submit boxes, and reuse the existing AI parsing/upload flow for both assigned and shared requirements.

**Tech Stack:** Next.js 16 app router, React client components, TypeScript state helpers, Node test runner.

---

### Task 1: Upload-State Grouping

**Files:**
- Modify: `src/lib/upload-view-state.ts`
- Test: `src/lib/upload-view-state.test.mjs`

- [ ] Add tests where an active submitter only sees their assigned submit box documents when shared fulfillment is off.
- [ ] Add tests where the same submitter sees other submit boxes' documents when `allowSharedFulfillment` is on.
- [ ] Implement grouped upload state: assigned upload documents, shared upload documents, assigned manual forms, shared manual forms, and compatibility `uploadDocuments`/`manualFormDocuments`.

### Task 2: Template Metadata

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/workflow-view.tsx`

- [ ] Add `allowSharedFulfillment` and `requireSharedFulfillmentConfirmation` to `WorkflowGraphNode`.
- [ ] Add submit-box detail toggles in the canvas side panel.
- [ ] Keep defaults conservative: shared fulfillment off, confirmation on when enabled.

### Task 3: Upload UI

**Files:**
- Modify: `src/app/approval-workspace.tsx`
- Modify: `src/app/upload-view.tsx`

- [ ] Pass the active user email into `UploadView`.
- [ ] Show assigned requirements under "Your assigned uploads".
- [ ] Show shared requirements under "Other required uploads you may help fulfill".
- [ ] Reuse the existing `parseFile(file, document)` path so AI parsing, confidence, evidence, and draft rows continue to work.

### Task 4: Verification

**Files:**
- No production files expected.

- [ ] Run focused upload-state tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Preview `http://localhost:3000/?tab=upload` and check console errors.

---

Self-review: This plan intentionally implements Mode 1 first. Mode 2 ad-hoc contributor invitations inside a submit box should build on the same submission-task concept after this foundation is stable.
