# Workflow Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the workflow template list preview with a visual canvas where users can add approval, review, for-information, condition, document, and end boxes, then edit selected box or branch details.

**Architecture:** Add a workflow-graph data model alongside the existing template model, with pure helper functions covered by unit tests. Render the graph with `@xyflow/react` in the client workspace, and use a right-side inspector for selected node/edge details.

**Tech Stack:** Next.js 16 with webpack dev/build, React 19, Tailwind CSS, `@xyflow/react`, Node test runner.

---

### Task 1: Workflow Graph Model

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/workflow-graph.ts`
- Test: `src/lib/workflow-graph.test.mjs`

- [ ] Write failing tests for converting an existing template to graph nodes and branches.
- [ ] Run `npm test` and confirm the new tests fail because `workflow-graph.ts` does not exist.
- [ ] Implement graph types and helper functions.
- [ ] Run `npm test` and confirm graph tests pass.

### Task 2: Canvas Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Install `@xyflow/react`.
- [ ] Confirm package scripts still use `--webpack`.

### Task 3: Canvas UI

**Files:**
- Modify: `src/app/approval-workspace.tsx`

- [ ] Import React Flow components and styles.
- [ ] Replace the template preview panel with a canvas, toolbar, and details inspector.
- [ ] Add buttons for Approval, Review, For Information, Condition, Document, and End nodes.
- [ ] Allow node selection and edge selection.
- [ ] Allow editing node details and branch rule fields/operators/values.
- [ ] Preserve existing template builder and template library.

### Task 4: Verification

**Commands:**
- `npm test`
- `npm run lint`
- `npm run build`

- [ ] Run all verification commands.
- [ ] Restart the dev server if needed and warm `http://localhost:3000/?tab=workflow`.
