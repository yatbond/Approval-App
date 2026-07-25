# Field Recognition Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify field recognition into a two-step review flow on Upload and mirror the same concept in template document setup.

**Architecture:** Keep the existing parser and workflow document data model. Reorganize UI wording and layout so AI suggestions are Step 1, user boxed/manual fields are Step 2, and accepted values remain in the existing extraction draft fields.

**Tech Stack:** Next.js app components, React state, existing parser/upload helpers, Node test runner.

---

### Task 1: Upload Two-Step Field Review UI

**Files:**
- Modify: `src/app/upload-view.tsx`
- Test: `src/lib/upload-view-state.test.mjs`

- [ ] Rename the upload field controls to Step 1 `Suggested Fields` and Step 2 `Add / Correct Fields`.
- [ ] Move suggested parser fields above the manual/boxed field editor when parse results exist.
- [ ] Replace always-visible `Add selected box` with contextual copy that appears after a box is drawn: `Add box to <field>`.
- [ ] Keep manual fallback inside Step 2 as `Manual fields`.
- [ ] Run `npm test -- src/lib/upload-view-state.test.mjs src/lib/document-preview.test.mjs`.

### Task 2: Template Setup Recognition Language

**Files:**
- Modify: `src/app/workflow-view.tsx`
- Test: `src/lib/workflow-document-field-state.test.mjs`

- [ ] In Box details document field configuration, label existing fields as `Step 1: Required template fields`.
- [ ] Label add/edit field controls as `Step 2: Add / correct fields`.
- [ ] Use button text `Add template field` instead of generic `Add field`.
- [ ] Keep all existing document requirement field behavior unchanged.
- [ ] Run `npm test -- src/lib/workflow-document-field-state.test.mjs`.

### Task 3: Verification and Commit

**Files:**
- Modify: `tmp/refactor-Approval-workflow.md`

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Smoke-load `http://localhost:3000/?tab=upload`.
- [ ] Append progress notes to `tmp/refactor-Approval-workflow.md`.
- [ ] Commit with message `feat: simplify field recognition workflow`.
