# Workflow Execution Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make approval templates testable end-to-end, enforce document requirements during execution, persist schema support in Supabase, snapshot template versions on submitted requests, and expose basic users/roles in the UI.

**Architecture:** Reuse the existing `approval-state` and `workflow-graph` engines instead of creating a second runtime. Add small pure helpers with tests first, then connect them to `ApprovalWorkspace` panels and existing workspace snapshot persistence.

**Tech Stack:** Next.js app router, React client components, Node test runner, TypeScript, Supabase Postgres and RLS.

---

### Task 1: Workflow Runner

**Files:**
- Modify: `src/lib/approval-state.ts`
- Test: `src/lib/approval-state.test.mjs`
- Modify: `src/app/approval-workspace.tsx`

- [ ] Add pure helper coverage for simulated action sequences.
- [ ] Add a Workflow tab runner panel that selects a template-linked task and triggers approve/reject/resubmit/cancel through `applyTaskAction`.
- [ ] Show current owner, current node, node decisions, and latest audit entry.

### Task 2: Canvas Outcome Visualization

**Files:**
- Modify: `src/app/approval-workspace.tsx`
- Test: existing workflow graph and keyboard tests.

- [ ] Label condition edges with condition names where possible.
- [ ] Keep selected outcome targets highlighted while assigning outcomes.
- [ ] Show outcome routes in condition details without relying on branch internals.

### Task 3: Box-Level Document Gating

**Files:**
- Modify: `src/lib/request-builder.ts`
- Modify: `src/lib/approval-state.ts`
- Test: `src/lib/request-builder.test.mjs`, `src/lib/approval-state.test.mjs`
- Modify: `src/app/approval-workspace.tsx`

- [ ] Add helper for missing required documents at the current node.
- [ ] Block approve/approve-with-comment when required current-node documents are missing.
- [ ] Let the current actor attach required documents from the queue panel.

### Task 4: Supabase Live Schema

**Files:**
- Read/apply: `supabase/approval_workflow_v2.sql`
- Modify only if advisors or live checks require compatible DDL.

- [ ] Apply SQL to project `wlbxrdmpwuupjyarjcxb`.
- [ ] Verify tables and grants with SQL.
- [ ] Run security and performance advisors and summarize any residual warnings.

### Task 5: Template Version Snapshots

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/request-builder.ts`
- Modify: `src/lib/workspace-persistence.ts`
- Test: `src/lib/request-builder.test.mjs`, `src/lib/workspace-persistence.test.mjs`

- [ ] Add `workflowTemplateVersion` and `workflowTemplateSnapshot` to submitted tasks.
- [ ] Use the task snapshot for routing/tracking when present.
- [ ] Keep parsing backward compatible for older saved workspace snapshots.

### Task 6: User and Role Surfaces

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/approval-workspace.tsx`

- [ ] Add lightweight role metadata to the existing user directory.
- [ ] Show requester/approver/reviewer/FYI/superuser labels in tracking and admin surfaces.
- [ ] Keep free-form emails usable until real auth roles are fully wired.

### Task 7: Verification

**Files:**
- Test all changed files.

- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Reload `http://localhost:3000/?tab=workflow`.
- [ ] Check mobile viewport for workflow and queue panels.
