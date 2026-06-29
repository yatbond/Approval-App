# Template Recognition and OCR Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make field recognition work end-to-end across template setup, upload review, feedback examples, publish guardrails, and PRD documentation.

**Architecture:** Reuse the existing parser, PDF preview, and highlight extraction helpers. Add small pure state helpers for template recognition fields and extraction examples, then wire a template-side sample recognition panel into Box Details without changing the core workflow graph model.

**Tech Stack:** Next.js client components, React state, existing `/api/parse`, OpenRouter Qwen page-image OCR, Node test runner.

---

### Task 1: Extraction Examples and Parser Prompt

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/parser.ts`
- Modify: `src/lib/workspace-file-api.ts`
- Modify: `src/app/api/parse/route.ts`
- Test: `src/lib/parser.test.mjs`
- Test: `src/lib/workspace-file-api.test.mjs`

- [ ] Add an `ExtractionTrainingExample` type and allow workflow templates / fields to carry examples.
- [ ] Write tests proving parser prompts include prior corrected examples.
- [ ] Write tests proving `parseWorkspaceFile` posts `examplesJson`.
- [ ] Parse `examplesJson` in `/api/parse` and pass it into parser functions.

### Task 2: Template Recognition State

**Files:**
- Create: `src/lib/template-recognition-state.ts`
- Create: `src/lib/template-recognition-state.test.mjs`
- Modify: `src/lib/workflow-document-field-state.ts`
- Test: `src/lib/workflow-document-field-state.test.mjs`

- [ ] Add helpers to create template fields from suggested fields or manually boxed sample values.
- [ ] Add helpers to append correction examples to workflow templates.
- [ ] Keep generated field names stable and deduplicated.

### Task 3: Template Box Details Recognition UI

**Files:**
- Create: `src/app/template-document-recognition-panel.tsx`
- Modify: `src/app/workflow-view.tsx`

- [ ] Add a sample document upload inside each selected approval/review box document requirement.
- [ ] Show Step 1 suggested fields from parsing the sample document.
- [ ] Show Step 2 add/correct fields with preview boxing and optional sample values.
- [ ] Add selected fields to the template document requirement and store sample examples.

### Task 4: Upload Feedback Loop

**Files:**
- Modify: `src/app/approval-workspace.tsx`
- Modify: `src/lib/workspace-request-submission-state.ts`
- Test: `src/lib/workspace-request-submission-state.test.mjs`

- [ ] Build extraction training examples when edited values differ from parser values.
- [ ] Persist those examples against the selected workflow template when submitting a request.
- [ ] Pass template examples into future parsing calls.

### Task 5: Publish Guardrails

**Files:**
- Modify: `src/lib/workflow-template-action-state.ts`
- Test: `src/lib/workflow-template-action-state.test.mjs`

- [ ] Block publishing on validation warnings that make a workflow incomplete, including missing condition outcomes and required documents without extraction fields.
- [ ] Keep already-published and missing-template behavior unchanged.

### Task 6: Verification and Live Smoke

**Files:**
- Modify: `tmp/refactor-Approval-workflow.md`

- [ ] Run focused tests for parser, file API, template recognition, request submission, and publish action.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
- [ ] Smoke-load Upload and Workflow in the visible app.
- [ ] If a suitable local PDF is available, run one live `/api/parse` Qwen smoke.

### Task 7: PRD Update and Commit

**Files:**
- Modify: `PRD/approval-workflow-platform-prd.md`

- [ ] Document two-step field recognition in Upload and Template setup.
- [ ] Document extraction examples / confidence feedback.
- [ ] Document publish guardrails.
- [ ] Commit the completed batch.
