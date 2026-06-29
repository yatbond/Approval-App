# Approval Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add active task lifecycle tracking so approvers, originators, and reassigned/delegated users can see each item after actions are taken.

**Architecture:** Keep the MVP client-side, seeded from mock tasks. Add a pure workflow reducer for approve, reject, reassign, delegate, amend, resubmit, and cancel transitions, then render Queue as "my actionable items" and Tracking as "items I am involved in."

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Node test runner for focused transition tests.

---

### Task 1: Workflow State Helper

**Files:**
- Create: `src/lib/approval-state.ts`
- Create: `src/lib/approval-state.test.mjs`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write failing tests** covering approve moves to tracking, reject returns to originator, reassign remains actionable with a label, and originator cancel closes a rejected item.
- [ ] **Step 2: Run `node src/lib/approval-state.test.mjs` and confirm it fails because the helper does not exist.**
- [ ] **Step 3: Add task lifecycle types and pure transition functions.**
- [ ] **Step 4: Run `node src/lib/approval-state.test.mjs` and confirm all transition tests pass.**

### Task 2: Queue And Tracking UI

**Files:**
- Modify: `src/app/approval-workspace.tsx`

- [ ] **Step 1: Replace shared activity state with per-task state initialized from mock tasks.**
- [ ] **Step 2: Add a Tracking tab and render every involved item with status, owner, last action, and audit trail.**
- [ ] **Step 3: Update Queue to show only actionable items for the current user, including rejected-originator actions and reassigned labels.**
- [ ] **Step 4: Add email fields for reassign and delegate actions.**

### Task 3: Verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add a `test` script for the workflow helper.**
- [ ] **Step 2: Run `npm test`, `npm run lint`, and `npm run build`.**
- [ ] **Step 3: Confirm the running app responds at `/`, `/login`, and `/?tab=tracking`.**
